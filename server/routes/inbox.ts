import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization';
import {
  agentsToken,
  runIdentityOf,
} from '@nocobase/app-plugin-agents/server/tokens';
import {
  projectsAccessToken,
  projectsToken,
  type Viewer,
} from '@nocobase/app-plugin-projects/server/tokens';
import type { Application } from '@nocobase/app-server/application';
import {
  ApiError,
  apiErrorResponses,
  apiValidator,
  cliRoute,
  dataResponse,
  defineApiRoutes,
  describeRoute,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { databaseManagerToken } from '@nocobase/db';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { z } from 'zod';
import { str } from '../git/rows.js';
import {
  decisionToken,
  isFinishedStatus,
  undecidedFailedRun,
  type ProgressRun,
} from '../progress/service.js';

type Env = AuthEnv & AuthorizationEnv;
type Ctx = Context<Env>;

const DOMAIN = 'studio';
const ISSUE = 'issue';
const PERSON: Record<string, string[]>[] = [
  { cookieAuth: [] },
  { apiKeyAuth: [] },
];
const ISSUE_LIMIT = 200;
const DECISION_SCAN = 50;
const MAX_UNREAD = 99;

type Wait = 'takeOver' | 'failed' | 'answer' | 'accept' | 'authorize' | 'plan';

interface ListedIssue {
  readonly id: string;
  readonly identifier: string;
  readonly title: string;
  readonly statusKey: string;
  readonly needsYou: string | null;
  readonly ownerUserId: string;
  readonly projectId?: string | null;
  readonly executorName?: string | null;
  readonly lastActivityAt: string;
  readonly updatedAt: string;
  readonly parentIssueId?: string | null;
  readonly subtaskCount?: number;
}

interface Decision {
  readonly wait: Wait;
  readonly issue: ListedIssue;
  readonly key: string;
  readonly since: string;
  readonly detail: string | null;
  readonly runId?: string;
}

const pageItems = (page: unknown): readonly ListedIssue[] => {
  const source = page as {
    items?: readonly ListedIssue[];
    data?: readonly ListedIssue[];
  };
  return source.items ?? source.data ?? [];
};

const InboxNoticeSchema = z
  .object({
    notificationId: z.string(),
    source: z.string(),
    kind: z.enum(['decision', 'info']),
    type: z.string(),
    subject: z
      .object({
        type: z.string(),
        id: z.string(),
        label: z.string().nullable(),
      })
      .nullable(),
    decisionKey: z.string().nullable(),
    data: z.record(z.string(), z.unknown()).nullable(),
    count: z.number().int(),
    resolvedAt: z.string().nullable(),
    outcome: z.string().nullable(),
  })
  .meta({ ref: 'StudioInboxNotice' });

const InboxItemSchema = z
  .object({
    id: z.string(),
    kind: z.enum(['decision', 'info']),
    type: z.string(),
    pending: z.boolean(),
    read: z.boolean(),
    issue: z.string().nullable(),
    title: z.string(),
    body: z.string(),
    url: z.string().nullable(),
    createdAt: z.string(),
  })
  .meta({ ref: 'StudioInboxItem' });

const WaitingEntry = z.object({
  item: z.object({
    id: z.string(),
    deliveryId: z.string(),
    notificationId: z.string(),
    title: z.string(),
    body: z.string(),
    target: z.unknown().optional(),
    readAt: z.string().optional(),
    createdAt: z.string(),
  }),
  notice: InboxNoticeSchema,
});

const WaitsSchema = z.array(
  z.enum(['takeOver', 'failed', 'authorize', 'answer', 'plan', 'accept']),
);

const TaskRow = z.object({
  issue: z.record(z.string(), z.unknown()),
  parent: z.object({ id: z.string(), identifier: z.string() }).nullable(),
  waits: WaitsSchema,
  waitingSince: z.string().nullable(),
  followed: z.boolean(),
  unread: z.number(),
  progress: z.object({ finished: z.number(), total: z.number() }),
  hasChildren: z.boolean(),
  context: z.boolean(),
  expand: z.array(z.string()),
});

const FollowUpIssue = z
  .object({
    id: z.string(),
    identifier: z.string(),
    title: z.string(),
    statusKey: z.string(),
    projectId: z.string().nullable(),
    executorName: z.string().nullable(),
    lastActivityAt: z.string(),
    owned: z.boolean(),
    followed: z.boolean(),
    unread: z.number().int(),
    seenAt: z.string().nullable(),
  })
  .meta({ ref: 'StudioFollowUpIssue' });

const ListFilters = z.object({
  q: z.string().optional(),
  statusKey: z.string().optional(),
  projectId: z.string().optional(),
  ownerUserId: z.string().optional(),
  executorId: z.string().optional(),
  involvesUserId: z.string().optional(),
  labelId: z.string().optional(),
});

const denied = (message: string, reason = 'ACCESS_DENIED'): ApiError =>
  new ApiError({
    status: 'PERMISSION_DENIED',
    reason,
    domain: DOMAIN,
    message,
  });

/**
 * What waits on a person, in one place: the demo's `inbox/*`, `followUps/*` and `taskGroups/*`. Decisions are read from
 * the state of the issues themselves, so one that was answered elsewhere is simply gone; only "last seen" is stored.
 */
export const inboxRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const routes = new Hono<Env>();
    const { container } = app;
    const auth = container.resolve(authenticationToken);
    const authz = container.resolve(authorizationToken);
    const projects = () => container.resolve(projectsToken);
    const agents = () => container.resolve(agentsToken);
    const conn = () => container.resolve(databaseManagerToken).connection();

    const viewerOf = async (context: Ctx): Promise<Viewer> => {
      const session = context.get('auth');
      if (!session) throw denied('Sign in first.');
      if (runIdentityOf(session)?.run)
        throw denied(
          'This endpoint is for people, not agent runs.',
          'RUN_NOT_ALLOWED',
        );
      const identity = context.get('authz').identity;
      const scoped = identity.keyScope?.objects('pm.projects') ?? 'all';
      return {
        userId: session.user.id,
        actor: { type: 'user', id: session.user.id },
        permissions: await container
          .resolve(projectsAccessToken)
          .permissionsOf(identity),
        ...(scoped === 'all' ? {} : { projectIds: scoped }),
      };
    };

    /** What this person owes each of their open issues, read from the issues' own state. */
    const decisionsOn = async (
      viewer: Viewer,
      issues: readonly ListedIssue[],
    ): Promise<Decision[]> => {
      const decisions: Decision[] = [];
      for (const issue of issues.slice(0, DECISION_SCAN)) {
        if (issue.ownerUserId !== viewer.userId) continue;
        if (isFinishedStatus(issue.statusKey)) continue;
        if (issue.statusKey === 'in_review')
          decisions.push({
            wait: 'accept',
            issue,
            key: `accept:${issue.id}`,
            since: issue.updatedAt,
            detail: issue.needsYou,
          });
        else if (issue.needsYou)
          decisions.push({
            wait: 'answer',
            issue,
            key: `answer:${issue.id}`,
            since: issue.updatedAt,
            detail: issue.needsYou,
          });
        const runs = (await agents().runs.list({
          subjectKind: ISSUE,
          subjectId: issue.id,
          limit: 20,
        })) as unknown as ProgressRun[];
        if (runs.some((run) => run.status === 'failed')) {
          const answered = await conn()
            .query.selectFrom('dsFailedRunDecisions')
            .select('runId')
            .where('issueId', '=', issue.id)
            .execute();
          const failed = undecidedFailedRun(
            runs,
            new Set(answered.map((row) => str(row.runId))),
          );
          if (failed)
            decisions.push({
              wait: 'failed',
              issue,
              key: `failed:${failed}`,
              since:
                runs.find((run) => run.id === failed)?.finishedAt ??
                issue.updatedAt,
              detail: null,
              runId: failed,
            });
        }
      }
      return decisions.sort((a, b) => b.since.localeCompare(a.since));
    };

    const ownedOpen = async (viewer: Viewer): Promise<ListedIssue[]> =>
      pageItems(
        await projects().issueQueries.page(viewer, {
          ownerUserId: viewer.userId,
          limit: ISSUE_LIMIT,
        }),
      ).filter((issue) => !isFinishedStatus(issue.statusKey));

    const inboxItems = async (
      userId: string,
      unread: boolean,
      limit: number,
    ) => {
      let query = conn()
        .query.selectFrom('notificationInAppItems')
        .selectAll()
        .where('userId', '=', userId);
      if (unread) query = query.where('readAt', 'is', null);
      return query.orderBy('createdAt', 'desc').limit(limit).execute();
    };

    const unreadOf = async (userId: string): Promise<number> =>
      (
        await conn()
          .query.selectFrom('notificationInAppItems')
          .select('id')
          .where('userId', '=', userId)
          .where('readAt', 'is', null)
          .execute()
      ).length;

    const iso = (value: unknown): string =>
      new Date(value as string | Date).toISOString();

    const entryOf = (decision: Decision) => {
      const id = decisionToken('decision', decision.key);
      return {
        item: {
          id,
          deliveryId: id,
          notificationId: id,
          title: `${decision.issue.identifier} ${decision.issue.title}`,
          body: decision.detail ?? '',
          target: { type: 'route', path: `/issues/${decision.issue.id}` },
          readAt: decision.since,
          createdAt: decision.since,
        },
        notice: {
          notificationId: id,
          source: 'studio',
          kind: 'decision' as const,
          type: decision.wait,
          subject: {
            type: ISSUE,
            id: decision.issue.id,
            label: decision.issue.identifier,
          },
          decisionKey: decision.key,
          data: decision.runId ? { runId: decision.runId } : null,
          count: 1,
          resolvedAt: null,
          outcome: null,
        },
      };
    };

    const seenMap = async (userId: string, ids: readonly string[]) => {
      if (ids.length === 0) return new Map<string, Date>();
      const rows = await conn()
        .query.selectFrom('dsIssueSeen')
        .select(['issueId', 'seenAt'])
        .where('userId', '=', userId)
        .where('issueId', 'in', [...ids])
        .execute();
      return new Map(
        rows.map((row) => [
          str(row.issueId),
          new Date(row.seenAt as string | Date),
        ]),
      );
    };

    /** Comments by others since the person last looked; 0 when they never looked or do not follow. */
    const unreadComments = async (
      userId: string,
      issue: ListedIssue,
      seenAt: Date | undefined,
    ): Promise<number> => {
      if (!seenAt) return 0;
      const rows = await conn()
        .query.selectFrom('pmComments')
        .select('id')
        .where('issueId', '=', issue.id)
        .where('authorId', '!=', userId)
        .where('createdAt', '>', seenAt)
        .limit(MAX_UNREAD)
        .execute();
      return rows.length;
    };

    const followedIds = async (userId: string, ids: readonly string[]) =>
      projects().subscriptions.followedBy(conn(), userId, ids);

    const followUpOf = async (
      viewer: Viewer,
      issue: ListedIssue,
      followed: ReadonlySet<string>,
      seen: ReadonlyMap<string, Date>,
    ) => {
      const seenAt = seen.get(issue.id);
      const isFollowed = followed.has(issue.id);
      return {
        id: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        statusKey: issue.statusKey,
        projectId: issue.projectId ?? null,
        executorName: issue.executorName ?? null,
        lastActivityAt: issue.lastActivityAt,
        owned: issue.ownerUserId === viewer.userId,
        followed: isFollowed,
        unread: isFollowed
          ? await unreadComments(viewer.userId, issue, seenAt)
          : 0,
        seenAt: seenAt?.toISOString() ?? null,
      };
    };

    const visibleOrMissing = async (viewer: Viewer, issueId: string) => {
      try {
        return (await projects().issueQueries.visible(
          viewer,
          issueId,
        )) as unknown as ListedIssue;
      } catch {
        throw new ApiError({
          status: 'NOT_FOUND',
          reason: 'NOT_FOUND',
          domain: DOMAIN,
          message: 'Issue not found.',
        });
      }
    };

    /** Everything a list groups: the issues, what each waits for, and whether it is followed. */
    const rowsOf = async (viewer: Viewer, issues: readonly ListedIssue[]) => {
      const ids = issues.map((issue) => issue.id);
      const followed = await followedIds(viewer.userId, ids);
      const seen = await seenMap(viewer.userId, ids);
      const decisions = await decisionsOn(viewer, issues);
      return Promise.all(
        issues.map(async (issue) => {
          const mine = decisions.filter((d) => d.issue.id === issue.id);
          const seenAt = seen.get(issue.id);
          const isFollowed = followed.has(issue.id);
          return {
            issue: issue as unknown as Record<string, unknown>,
            parent: null,
            waits: mine.map((d) => d.wait),
            waitingSince: mine[0]?.since ?? null,
            followed: isFollowed,
            unread: isFollowed
              ? await unreadComments(viewer.userId, issue, seenAt)
              : 0,
            progress: { finished: 0, total: issue.subtaskCount ?? 0 },
            hasChildren: (issue.subtaskCount ?? 0) > 0,
            context: false,
            expand: [],
          };
        }),
      );
    };

    for (const path of [
      '/inbox/*',
      '/followUps',
      '/followUps/*',
      '/taskGroups',
      '/taskGroups/*',
    ])
      routes.use(path, auth.required(), authz.middleware());

    routes.get(
      '/inbox/items',
      describeRoute({
        tags: ['Studio'],
        summary: 'List the caller’s inbox',
        operationId: 'studioInboxItems',
        security: PERSON,
        ...cliRoute({ command: 'inbox list' }),
        responses: {
          '200': dataResponse(z.array(InboxItemSchema)),
          ...apiErrorResponses,
        },
      }),
      apiValidator(
        'query',
        z.object({
          unread: z.stringbool().optional(),
          pageSize: z.coerce.number().int().min(1).max(200).optional(),
        }),
      ),
      async (context) => {
        const viewer = await viewerOf(context);
        const query = context.req.valid('query');
        const limit = query.pageSize ?? 50;
        const decisions = await decisionsOn(viewer, await ownedOpen(viewer));
        const items = await inboxItems(
          viewer.userId,
          query.unread === true,
          limit,
        );
        return context.json({
          data: [
            ...decisions.map((decision) => ({
              id: decisionToken('decision', decision.key),
              kind: 'decision' as const,
              type: decision.wait,
              pending: true,
              read: false,
              issue: decision.issue.identifier,
              title: `${decision.issue.identifier} ${decision.issue.title}`,
              body: decision.detail ?? '',
              url: `/issues/${decision.issue.id}`,
              createdAt: decision.since,
            })),
            ...items.map((item) => ({
              id: str(item.id),
              kind: 'info' as const,
              type: 'notification',
              pending: false,
              read: Boolean(item.readAt),
              issue: null,
              title: item.title ? str(item.title) : '',
              body: str(item.body),
              url: item.actionUrl ? str(item.actionUrl) : null,
              createdAt: iso(item.createdAt),
            })),
          ],
          meta: {},
        });
      },
    );

    routes.get(
      '/inbox/notices',
      describeRoute({
        tags: ['Studio'],
        summary: 'List what Studio knows about the caller’s inbox items',
        operationId: 'studioInboxNotices',
        security: PERSON,
        ...cliRoute({ command: 'inbox notices' }),
        responses: {
          '200': dataResponse(z.array(InboxNoticeSchema)),
          ...apiErrorResponses,
        },
      }),
      apiValidator('query', z.object({ ids: z.string().optional() })),
      async (context) => {
        const viewer = await viewerOf(context);
        const ids = (context.req.valid('query').ids ?? '')
          .split(',')
          .filter(Boolean)
          .slice(0, 200);
        if (ids.length === 0) return context.json({ data: [], meta: {} });
        // Only notifications that reached this person.
        const mine = await conn()
          .query.selectFrom('notificationInAppItems')
          .select('notificationId')
          .where('userId', '=', viewer.userId)
          .where('notificationId', 'in', ids)
          .execute();
        const owned = mine.map((row) => str(row.notificationId));
        const dispatches = owned.length
          ? await conn()
              .query.selectFrom('notificationDispatches')
              .select(['id', 'sourceType'])
              .where('id', 'in', owned)
              .execute()
          : [];
        return context.json({
          data: dispatches.map((row) => ({
            notificationId: str(row.id),
            source: str(row.sourceType),
            kind: 'info' as const,
            type: str(row.sourceType),
            subject: null,
            decisionKey: null,
            data: null,
            count: 1,
            resolvedAt: null,
            outcome: null,
          })),
          meta: {},
        });
      },
    );

    routes.get(
      '/inbox/pending',
      describeRoute({
        tags: ['Studio'],
        summary: 'Count inbox approvals and unread notifications',
        operationId: 'studioInboxPending',
        security: PERSON,
        ...cliRoute({ command: 'inbox pending' }),
        responses: {
          '200': dataResponse(
            z.object({ info: z.number().int(), decision: z.number().int() }),
          ),
          ...apiErrorResponses,
        },
      }),
      async (context) => {
        const viewer = await viewerOf(context);
        const decisions = await decisionsOn(viewer, await ownedOpen(viewer));
        return context.json({
          data: {
            info: await unreadOf(viewer.userId),
            decision: decisions.length,
          },
        });
      },
    );

    routes.get(
      '/inbox/unreadCount',
      describeRoute({
        tags: ['Studio'],
        summary: 'Count unread inbox notifications',
        operationId: 'studioInboxUnreadCount',
        security: PERSON,
        ...cliRoute({ command: 'inbox unread' }),
        responses: {
          '200': dataResponse(z.object({ count: z.number().int() })),
          ...apiErrorResponses,
        },
      }),
      async (context) => {
        const viewer = await viewerOf(context);
        return context.json({ data: { count: await unreadOf(viewer.userId) } });
      },
    );

    routes.get(
      '/inbox/waiting',
      describeRoute({
        tags: ['Studio'],
        summary: 'List the decisions waiting on the caller',
        operationId: 'studioInboxWaiting',
        security: PERSON,
        ...cliRoute({ command: 'inbox waiting' }),
        responses: {
          '200': dataResponse(z.array(WaitingEntry)),
          ...apiErrorResponses,
        },
      }),
      apiValidator('query', z.object({ subject: z.string().optional() })),
      async (context) => {
        const viewer = await viewerOf(context);
        const { subject } = context.req.valid('query');
        const decisions = await decisionsOn(viewer, await ownedOpen(viewer));
        return context.json({
          data: decisions
            .filter(
              (decision) =>
                !subject || subject === `${ISSUE}:${decision.issue.id}`,
            )
            .map(entryOf),
          meta: {},
        });
      },
    );

    routes.post(
      '/inbox/reconcile',
      describeRoute({
        tags: ['Studio'],
        summary: 'Reconcile obsolete decisions on finished issues',
        description:
          'Studio reads decisions from the issues’ state, so none can go stale: this finds nothing to repair.',
        operationId: 'studioInboxReconcile',
        security: PERSON,
        ...cliRoute({ command: 'inbox reconcile' }),
        responses: {
          '200': dataResponse(z.array(z.unknown())),
          ...apiErrorResponses,
        },
      }),
      apiValidator(
        'json',
        z.object({
          mode: z.string().optional(),
          execute: z.boolean().optional(),
        }),
      ),
      async (context) => {
        await viewerOf(context);
        return context.json({
          data: [],
          meta: {
            scanned: 0,
            execute: context.req.valid('json').execute === true,
            failed: 0,
          },
        });
      },
    );

    routes.get(
      '/followUps',
      describeRoute({
        tags: ['Studio'],
        summary: 'Get my follow-ups',
        operationId: 'studioFollowUps',
        security: PERSON,
        ...cliRoute({ command: 'follow-up list' }),
        responses: {
          '200': dataResponse(
            z.object({
              following: z.array(z.string()),
              followingStored: z.boolean(),
              issues: z.array(FollowUpIssue),
              counts: z.object({
                in_review: z.number().int(),
                blocked: z.number().int(),
                in_progress: z.number().int(),
                backlog: z.number().int(),
              }),
              truncated: z.boolean(),
            }),
          ),
          ...apiErrorResponses,
        },
      }),
      async (context) => {
        const viewer = await viewerOf(context);
        const page = pageItems(
          await projects().issueQueries.page(viewer, {
            involvesUserId: viewer.userId,
            limit: ISSUE_LIMIT,
          }),
        );
        const open = page.filter((issue) => !isFinishedStatus(issue.statusKey));
        const ids = open.map((issue) => issue.id);
        const followed = await followedIds(viewer.userId, ids);
        const seen = await seenMap(viewer.userId, ids);
        const issues = await Promise.all(
          open.map((issue) => followUpOf(viewer, issue, followed, seen)),
        );
        const count = (key: string) =>
          open.filter((issue) => issue.statusKey === key).length;
        return context.json({
          data: {
            following: [...followed],
            followingStored: true,
            issues,
            counts: {
              in_review: count('in_review'),
              blocked: count('blocked'),
              in_progress: count('in_progress'),
              backlog: count('backlog'),
            },
            truncated: page.length >= ISSUE_LIMIT,
          },
        });
      },
    );

    const followingState = async (viewer: Viewer) => {
      const rows = await conn()
        .query.selectFrom('pmIssueSubscriptions')
        .select('issueId')
        .where('userId', '=', viewer.userId)
        .execute();
      const ids = rows.map((row) => str(row.issueId));
      const visible = await projects().issueQueries.visibleIds(viewer, ids);
      // Unfollowing keeps the row, so whoever opted out is not added back; only `followedBy` says who follows.
      const followed = await followedIds(viewer.userId, ids);
      return {
        following: ids.filter((id) => visible.has(id) && followed.has(id)),
        stored: true,
      };
    };

    const FollowingState = z.object({
      following: z.array(z.string()),
      stored: z.boolean(),
    });

    routes.get(
      '/followUps/following',
      describeRoute({
        tags: ['Studio'],
        summary: 'Get the issues I follow',
        operationId: 'studioFollowing',
        security: PERSON,
        ...cliRoute({ command: 'follow-up following' }),
        responses: {
          '200': dataResponse(FollowingState),
          ...apiErrorResponses,
        },
      }),
      async (context) =>
        context.json({
          data: await followingState(await viewerOf(context)),
        }),
    );

    routes.put(
      '/followUps/following',
      describeRoute({
        tags: ['Studio'],
        summary: 'Replace the issues I follow',
        operationId: 'studioReplaceFollowing',
        security: PERSON,
        ...cliRoute({ command: 'follow-up set' }),
        responses: {
          '200': dataResponse(FollowingState),
          ...apiErrorResponses,
        },
      }),
      apiValidator(
        'json',
        z.object({ following: z.array(z.string().min(1)).max(500) }),
      ),
      async (context) => {
        const viewer = await viewerOf(context);
        const wanted = new Set(context.req.valid('json').following);
        const current = await followingState(viewer);
        for (const id of current.following)
          if (!wanted.has(id))
            await projects().subscriptions.set(viewer, id, false);
        for (const id of wanted)
          if (!current.following.includes(id)) {
            await visibleOrMissing(viewer, id);
            await projects().subscriptions.set(viewer, id, true);
          }
        return context.json({ data: await followingState(viewer) });
      },
    );

    routes.get(
      '/followUps/issues',
      describeRoute({
        tags: ['Studio'],
        summary: 'List my follow-ups rows of some issues',
        operationId: 'studioFollowUpIssues',
        security: PERSON,
        ...cliRoute({ command: 'follow-up issues' }),
        responses: {
          '200': dataResponse(z.array(FollowUpIssue)),
          ...apiErrorResponses,
        },
      }),
      apiValidator('query', z.object({ issueIds: z.string() })),
      async (context) => {
        const viewer = await viewerOf(context);
        const wanted = context.req
          .valid('query')
          .issueIds.split(',')
          .filter(Boolean)
          .slice(0, 100);
        const visible = await projects().issueQueries.visibleIds(
          viewer,
          wanted,
        );
        const issues = pageItems(
          await projects().issueQueries.page(viewer, {
            issueIds: [...visible],
            limit: 100,
          }),
        );
        const ids = issues.map((issue) => issue.id);
        const followed = await followedIds(viewer.userId, ids);
        const seen = await seenMap(viewer.userId, ids);
        return context.json({
          data: await Promise.all(
            issues.map((issue) => followUpOf(viewer, issue, followed, seen)),
          ),
          meta: { total: issues.length },
        });
      },
    );

    const IssueParam = z.object({ issueId: z.string() });
    const Following = z.object({ followed: z.boolean() });

    for (const [path, followed, command, operationId, summary] of [
      [
        'follow',
        true,
        'follow-up follow',
        'studioFollowUpFollow',
        'Follow an issue in my follow-ups',
      ],
      [
        'unfollow',
        false,
        'follow-up unfollow',
        'studioFollowUpUnfollow',
        'Stop following an issue in my follow-ups',
      ],
    ] as const)
      routes.post(
        `/followUps/issues/:issueId/${path}`,
        describeRoute({
          tags: ['Studio'],
          summary,
          operationId,
          security: PERSON,
          ...cliRoute({ command }),
          responses: {
            '200': dataResponse(Following),
            ...apiErrorResponses,
          },
        }),
        apiValidator('param', IssueParam),
        async (context) => {
          const viewer = await viewerOf(context);
          const issue = await visibleOrMissing(
            viewer,
            context.req.valid('param').issueId,
          );
          await projects().subscriptions.set(viewer, issue.id, followed);
          return context.json({ data: { followed } });
        },
      );

    routes.post(
      '/followUps/issues/:issueId/markSeen',
      describeRoute({
        tags: ['Studio'],
        summary: 'Mark an issue seen in my follow-ups',
        operationId: 'studioFollowUpMarkSeen',
        security: PERSON,
        ...cliRoute({ command: 'follow-up seen' }),
        responses: {
          '200': dataResponse(z.object({ seenAt: z.string() })),
          ...apiErrorResponses,
        },
      }),
      apiValidator('param', IssueParam),
      async (context) => {
        const viewer = await viewerOf(context);
        const issue = await visibleOrMissing(
          viewer,
          context.req.valid('param').issueId,
        );
        const now = new Date();
        const key = { userId: viewer.userId, issueId: issue.id };
        const existing = await conn()
          .query.selectFrom('dsIssueSeen')
          .select('issueId')
          .where('userId', '=', key.userId)
          .where('issueId', '=', key.issueId)
          .executeTakeFirst();
        if (existing)
          await conn()
            .query.updateTable('dsIssueSeen')
            .set({ seenAt: now })
            .where('userId', '=', key.userId)
            .where('issueId', '=', key.issueId)
            .execute();
        else
          await conn()
            .query.insertInto('dsIssueSeen')
            .values({ ...key, seenAt: now })
            .execute();
        return context.json({ data: { seenAt: now.toISOString() } });
      },
    );

    routes.get(
      '/taskGroups/summary',
      describeRoute({
        tags: ['Studio'],
        summary: 'Count the tasks the caller owns or executes',
        operationId: 'studioTaskGroupsSummary',
        security: PERSON,
        ...cliRoute({ command: 'task-group summary' }),
        responses: {
          '200': dataResponse(
            z.object({
              mine: z.object({ open: z.number(), waiting: z.number() }),
              waiting: z.number(),
            }),
          ),
          ...apiErrorResponses,
        },
      }),
      async (context) => {
        const viewer = await viewerOf(context);
        const open = await ownedOpen(viewer);
        const decisions = await decisionsOn(viewer, open);
        const waiting = new Set(decisions.map((d) => d.issue.id)).size;
        return context.json({
          data: { mine: { open: open.length, waiting }, waiting },
        });
      },
    );

    routes.get(
      '/taskGroups/rows',
      describeRoute({
        tags: ['Studio'],
        summary: 'Read single tasks as an issue list groups them now',
        operationId: 'studioTaskGroupsRows',
        security: PERSON,
        ...cliRoute({ command: 'task-group rows' }),
        responses: {
          '200': dataResponse(
            z.object({ membership: z.string(), data: z.array(TaskRow) }),
          ),
          ...apiErrorResponses,
        },
      }),
      apiValidator('query', ListFilters.extend({ ids: z.string() })),
      async (context) => {
        const viewer = await viewerOf(context);
        const { ids } = context.req.valid('query');
        const wanted = ids.split(',').filter(Boolean).slice(0, 100);
        const visible = await projects().issueQueries.visibleIds(
          viewer,
          wanted,
        );
        const issues = pageItems(
          await projects().issueQueries.page(viewer, {
            issueIds: [...visible],
            limit: 100,
          }),
        );
        return context.json({
          data: {
            membership: viewer.userId,
            data: await rowsOf(viewer, issues),
          },
        });
      },
    );

    routes.get(
      '/taskGroups/children',
      describeRoute({
        tags: ['Studio'],
        summary: 'Read the children of tasks in the grouped table',
        operationId: 'studioTaskGroupsChildren',
        security: PERSON,
        ...cliRoute({ command: 'task-group children' }),
        responses: {
          '200': dataResponse(z.record(z.string(), z.unknown())),
          ...apiErrorResponses,
        },
      }),
      apiValidator('query', ListFilters.extend({ parentIds: z.string() })),
      async (context) => {
        const viewer = await viewerOf(context);
        const parents = context.req
          .valid('query')
          .parentIds.split(',')
          .filter(Boolean)
          .slice(0, 50);
        const groups = await Promise.all(
          parents.map(async (parentId) => {
            const issues = pageItems(
              await projects().issueQueries.page(viewer, {
                parentIssueId: parentId,
                limit: 100,
              }),
            );
            return {
              parentId,
              data: await rowsOf(viewer, issues),
              nextCursor: null,
            };
          }),
        );
        return context.json({
          data: { generation: new Date().toISOString(), parents: groups },
        });
      },
    );

    routes.get(
      '/taskGroups/:issueId/decisions',
      describeRoute({
        tags: ['Studio'],
        summary: 'Read the caller’s waiting decisions on a task',
        operationId: 'studioTaskGroupDecisions',
        security: PERSON,
        ...cliRoute({ command: 'task-group decisions' }),
        responses: {
          '200': dataResponse(z.array(WaitingEntry)),
          ...apiErrorResponses,
        },
      }),
      apiValidator('param', IssueParam),
      async (context) => {
        const viewer = await viewerOf(context);
        const issue = await visibleOrMissing(
          viewer,
          context.req.valid('param').issueId,
        );
        return context.json({
          data: (await decisionsOn(viewer, [issue])).map(entryOf),
          meta: {},
        });
      },
    );

    routes.get(
      '/taskGroups',
      describeRoute({
        tags: ['Studio'],
        summary: 'Read the grouped tasks of an issue list',
        operationId: 'studioTaskGroups',
        security: PERSON,
        ...cliRoute({ command: 'task-group list' }),
        responses: {
          '200': dataResponse(z.record(z.string(), z.unknown())),
          ...apiErrorResponses,
        },
      }),
      apiValidator(
        'query',
        ListFilters.extend({
          mode: z.enum(['split', 'table']).optional(),
          limit: z.coerce.number().int().min(1).max(200).optional(),
        }),
      ),
      async (context) => {
        const viewer = await viewerOf(context);
        const { mode, limit, ...filters } = context.req.valid('query');
        const issues = pageItems(
          await projects().issueQueries.page(viewer, {
            ...filters,
            limit: limit ?? ISSUE_LIMIT,
          }),
        );
        const rows = await rowsOf(viewer, issues);
        const groupOf = (row: (typeof rows)[number]): string => {
          const status = String(row.issue.statusKey);
          if (status === 'done') return 'done';
          if (status === 'cancelled' || status === 'canceled')
            return 'cancelled';
          if (row.waits.length > 0) return 'wait';
          if (status === 'backlog') return 'backlog';
          if (status === 'blocked') return 'blocked';
          if (status === 'in_review') return 'review';
          return 'doing';
        };
        const order = [
          'wait',
          'doing',
          'review',
          'blocked',
          'backlog',
          'done',
          'cancelled',
        ];
        const groups = order
          .map((group) => {
            const data = rows.filter((row) => groupOf(row) === group);
            return { group, count: data.length, data, nextCursor: null };
          })
          .filter((group) => group.count > 0);
        return context.json({
          data: {
            generation: new Date().toISOString(),
            membership: viewer.userId,
            mode: mode ?? 'split',
            groups,
            following: rows
              .filter((row) => row.followed)
              .map((row) => String(row.issue.id)),
            waiting: rows.filter((row) => row.waits.length > 0).length,
          },
        });
      },
    );

    router.route('/', routes);
    return router;
  });
