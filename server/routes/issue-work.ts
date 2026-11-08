import { runPriorityOf } from '../agents/run-priority.js';
import { budgetServiceToken } from '../providers/outbound.js';
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
  listResponse,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { databaseManagerToken } from '@nocobase/db';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { z } from 'zod';
import { PROJECT_MANAGER_ID } from '../agents/ids.js';
import { readProjectManagerSettings } from '../agents/project-manager-settings.js';
import { str } from '../git/rows.js';
import { gitServiceToken } from '../providers/git.js';
import {
  computeProgress,
  decisionToken,
  isFinishedStatus,
  stepOf,
  undecidedFailedRun,
  type ProgressRun,
} from '../progress/service.js';

type Env = AuthEnv & AuthorizationEnv;
type Ctx = Context<Env>;

const DOMAIN = 'studio';
const ISSUE = 'issue';
const ACTIVITY_LIMIT = 100;
const COMMENT_RUN_WINDOW_HOURS = 24;
const MENTION_AGENT = /mention:\/\/agent\/([\w.-]+)/g;

const PERSON: Record<string, string[]>[] = [
  { cookieAuth: [] },
  { apiKeyAuth: [] },
];
const PERSON_OR_RUN: Record<string, string[]>[] = [...PERSON, { runToken: [] }];
const RUN_ONLY: Record<string, string[]>[] = [{ runToken: [] }];

const ProgressSchema = z
  .object({
    state: z.enum([
      'working',
      'queued',
      'checksPending',
      'needsDecision',
      'waitingForContinuation',
      'inReview',
      'notStarted',
      'finished',
      'idle',
    ]),
    agent: z.object({ id: z.string(), name: z.string() }).nullable(),
    step: z.string().nullable(),
    since: z.string().nullable(),
    runner: z.string().nullable(),
    pullRequest: z
      .object({ number: z.number().int(), url: z.string().nullable() })
      .nullable(),
    needsYou: z.string().nullable(),
    explanationCommentId: z.string().nullable(),
    next: z.string().nullable(),
    handOver: z.boolean(),
    failedRunId: z.string().nullable().meta({
      description:
        'A failed run still waiting for a decision. Dương Sinh addition.',
    }),
    personalRunnerRequests: z.array(z.record(z.string(), z.unknown())),
    waiting: z.record(z.string(), z.unknown()).nullable(),
    managerWait: z.record(z.string(), z.unknown()),
  })
  .meta({ ref: 'StudioIssueProgress' });

const RunSchema = z
  .object({
    id: z.string(),
    agentId: z.string(),
    agent: z.string(),
    status: z.string(),
    trigger: z.string().nullable(),
    attempt: z.number().int(),
    createdAt: z.string(),
    startedAt: z.string().nullable(),
    finishedAt: z.string().nullable(),
    summary: z.string(),
    failureReason: z.string().nullable(),
    failure: z.string(),
  })
  .meta({ ref: 'StudioIssueRun' });

const RunEventSchema = z
  .object({
    seq: z.number().int(),
    at: z.string(),
    type: z.string(),
    tool: z.string().nullable(),
    text: z.string(),
    content: z.string().nullable(),
    output: z.string().nullable(),
    input: z.unknown().optional(),
  })
  .meta({ ref: 'StudioIssueRunEvent' });

const HandoffSchema = z.object({
  handoff: z
    .object({
      issueId: z.string(),
      waiting: z.boolean(),
      ownerUserId: z.string(),
      previousOwnerUserId: z.string(),
      previousWaiting: z.boolean(),
      transferredByUserId: z.string(),
      notificationKey: z.string(),
      transferredAt: z.string(),
      rejectedAt: z.string().nullable(),
    })
    .nullable(),
  canDecide: z.boolean(),
  canClaim: z.boolean(),
});

const CommentRunLimitSchema = z
  .object({ token: z.string(), maxRuns: z.number(), windowHours: z.number() })
  .nullable();

const IssueParam = z.object({ issueId: z.string() });
const RunParam = z.object({ runId: z.string() });
const NoteKey = z.object({ notificationKey: z.uuid() }).strict();

const cut = (text: string | null | undefined, max: number): string =>
  (text ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

const notFound = (what: string): ApiError =>
  new ApiError({
    status: 'NOT_FOUND',
    reason: 'NOT_FOUND',
    domain: DOMAIN,
    message: `${what} not found.`,
  });
const denied = (message: string, reason = 'ACCESS_DENIED'): ApiError =>
  new ApiError({
    status: 'PERMISSION_DENIED',
    reason,
    domain: DOMAIN,
    message,
  });
const conflict = (message: string): ApiError =>
  new ApiError({
    status: 'FAILED_PRECONDITION',
    reason: 'STATE_CHANGED',
    domain: DOMAIN,
    message,
  });

interface IssueRow {
  readonly id: string;
  readonly identifier: string;
  readonly title: string;
  readonly statusKey: string;
  readonly needsYou: string | null;
  readonly next: string | null;
  readonly ownerUserId: string;
  readonly priority?: string;
  readonly revision: number;
  readonly projectId?: string | null;
  readonly executor: { readonly type: string; readonly id: string } | null;
}

interface ActivityRow {
  readonly id: string;
  readonly action: string;
  readonly actorId: string | null;
  readonly actorType: string;
  readonly createdAt: string;
  readonly details: Readonly<Record<string, unknown>>;
}

/**
 * What an issue's work is waiting for and the decisions about it (the demo's `issueProgress`, `issueRuns`, `agentBoard`,
 * `failedRuns`, `issueCommentRuns`, `issueOwnerHandoffs`, `issuePanels`, `sendBack`). Every route checks that the
 * caller sees the issue; routes for people refuse a run token, and the two that hand work on accept only one.
 */
export const issueWorkRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const routes = new Hono<Env>();
    const { container } = app;
    const auth = container.resolve(authenticationToken);
    const authz = container.resolve(authorizationToken);
    const projects = () => container.resolve(projectsToken);
    const agents = () => container.resolve(agentsToken);
    const git = () => container.resolve(gitServiceToken);
    const conn = () => container.resolve(databaseManagerToken).connection();

    const viewerOf = async (context: Ctx): Promise<Viewer> => {
      const session = context.get('auth');
      if (!session) throw denied('Sign in first.');
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

    const requirePerson = (context: Ctx): void => {
      if (runIdentityOf(context.get('auth'))?.run)
        throw denied(
          'This endpoint is for people, not agent runs.',
          'RUN_NOT_ALLOWED',
        );
    };

    const visibleIssue = async (
      viewer: Viewer,
      issueId: string,
    ): Promise<IssueRow> => {
      try {
        return await projects().issueQueries.visible(viewer, issueId);
      } catch {
        throw notFound('Issue');
      }
    };

    /** An issue the caller may also act on: its owner, or whoever may edit it. */
    const actableIssue = async (
      viewer: Viewer,
      issueId: string,
    ): Promise<IssueRow> => {
      const issue = await visibleIssue(viewer, issueId);
      const scope = viewer.permissions.scopes[
        'pm.issues/edit' as never
      ] as unknown as string | undefined;
      if (issue.ownerUserId !== viewer.userId && (!scope || scope === 'none'))
        throw denied('Only someone who may edit the issue can do this.');
      return issue;
    };

    const runsOf = (issueId: string) =>
      agents().runs.list({
        subjectKind: ISSUE,
        subjectId: issueId,
        limit: 100,
      });

    const agentNames = async (
      ids: readonly string[],
    ): Promise<Map<string, string>> => {
      const names = await agents().agents.names(conn(), [...new Set(ids)]);
      return new Map(names);
    };

    const decidedRuns = async (issueId: string): Promise<Set<string>> => {
      const rows = await conn()
        .query.selectFrom('dsFailedRunDecisions')
        .select('runId')
        .where('issueId', '=', issueId)
        .execute();
      return new Set(rows.map((row) => str(row.runId)));
    };

    const activitiesOf = async (
      viewer: Viewer,
      issueId: string,
    ): Promise<readonly ActivityRow[]> => {
      const page = (await projects().issueQueries.activities(viewer, issueId, {
        limit: ACTIVITY_LIMIT,
      })) as unknown as {
        items?: readonly ActivityRow[];
        data?: readonly ActivityRow[];
      };
      return page.items ?? page.data ?? [];
    };

    /** The newest comment run the limit held back since the owner last let them continue. */
    const heldCommentRun = async (
      activities: readonly ActivityRow[],
      issueId: string,
    ): Promise<ActivityRow | null> => {
      const grant = await conn()
        .query.selectFrom('dsCommentRunGrants')
        .select('continuedAt')
        .where('issueId', '=', issueId)
        .executeTakeFirst();
      const since = grant?.continuedAt
        ? new Date(str(grant.continuedAt)).getTime()
        : 0;
      const windowStart = Date.now() - COMMENT_RUN_WINDOW_HOURS * 3_600_000;
      return (
        activities.find(
          (activity) =>
            activity.action === 'work_skipped' &&
            activity.details.reason === 'limited' &&
            new Date(activity.createdAt).getTime() >
              Math.max(since, windowStart),
        ) ?? null
      );
    };

    const commentRunLimit = async (
      activities: readonly ActivityRow[],
      issueId: string,
    ) => {
      const held = await heldCommentRun(activities, issueId);
      if (!held) return null;
      const settings = await readProjectManagerSettings(conn());
      return {
        token: decisionToken('comment-run', held.id),
        maxRuns: settings.commentRunLimit,
        windowHours: COMMENT_RUN_WINDOW_HOURS,
      };
    };

    const handoffOf = async (
      viewer: Viewer,
      issue: IssueRow,
      activities: readonly ActivityRow[],
    ) => {
      const moved = activities.find(
        (activity) =>
          activity.action === 'owner_changed' &&
          typeof activity.details.from === 'string' &&
          typeof activity.details.to === 'string' &&
          activity.actorId !== activity.details.to,
      );
      if (!moved)
        return {
          handoff: null,
          canDecide: false,
          canClaim: false,
          activityId: null,
        };
      const decision = await conn()
        .query.selectFrom('dsOwnerHandoffDecisions')
        .select(['outcome', 'decidedAt'])
        .where('activityId', '=', moved.id)
        .executeTakeFirst();
      const waiting = !decision;
      const ownerUserId = String(moved.details.to);
      return {
        handoff: {
          issueId: issue.id,
          waiting,
          ownerUserId,
          previousOwnerUserId: String(moved.details.from),
          previousWaiting: false,
          transferredByUserId: moved.actorId ?? String(moved.details.from),
          notificationKey: decisionToken('owner-handoff', moved.id),
          transferredAt: moved.createdAt,
          rejectedAt:
            decision && str(decision.outcome) === 'rejected'
              ? new Date(str(decision.decidedAt)).toISOString()
              : null,
        },
        canDecide:
          waiting &&
          issue.ownerUserId === viewer.userId &&
          ownerUserId === viewer.userId,
        canClaim: false,
        activityId: moved.id,
      };
    };

    const progressOf = async (viewer: Viewer, issue: IssueRow) => {
      const runs = (await runsOf(issue.id)) as unknown as (ProgressRun & {
        runnerName?: string | null;
      })[];
      const open = runs.filter((run) =>
        ['queued', 'dispatched', 'running'].includes(run.status),
      );
      const names = await agentNames(open.map((run) => run.agentId));
      const pulls = await git().listPullRequests({ issueId: issue.id });
      const activities = await activitiesOf(viewer, issue.id);
      const failed = undecidedFailedRun(runs, await decidedRuns(issue.id));
      const held = await heldCommentRun(activities, issue.id);
      const current = open.find((run) => run.status !== 'queued') ?? open[0];
      const detail = current
        ? await agents()
            .runs.detail(current.id)
            .catch(() => null)
        : null;
      const firstInput = detail?.inputs?.[0] as { text?: string } | undefined;
      const managerComment = await conn()
        .query.selectFrom('pmComments')
        .select('id')
        .where('issueId', '=', issue.id)
        .where('authorId', '=', PROJECT_MANAGER_ID)
        .where('deletedAt', 'is', null)
        .orderBy('createdAt', 'desc')
        .executeTakeFirst();
      const progress = computeProgress({
        statusKey: issue.statusKey,
        needsYou: issue.needsYou,
        next: issue.next,
        executorIsManager: issue.executor?.id === PROJECT_MANAGER_ID,
        managerHasWorked: runs.some(
          (run) => run.agentId === PROJECT_MANAGER_ID,
        ),
        runs,
        pulls: pulls.map((pull) => ({
          number: pull.number,
          url: pull.url,
          state: pull.state,
          ciState: pull.ciState,
        })),
        undecidedFailedRunId: failed,
        commentRunsHeld: held !== null,
        agentName: (id) => names.get(id) ?? id,
        step: stepOf(firstInput?.text),
        explanationCommentId: managerComment?.id
          ? str(managerComment.id)
          : null,
      });
      return {
        ...progress,
        failedRunId: failed,
        // The demo's other fields. Studio has no personal-runner consent flow, so that list is always empty.
        personalRunnerRequests: [] as never[],
        waiting: progress.needsYou
          ? { kind: 'decision', text: progress.needsYou }
          : failed
            ? { kind: 'failedRun', runId: failed }
            : null,
        managerWait: {
          waiting: progress.state === 'waitingForContinuation',
        },
      };
    };

    /** A run on an issue the caller sees; anything else is simply not there. */
    const visibleRun = async (viewer: Viewer, runId: string) => {
      const run = await agents()
        .runs.get(runId)
        .catch(() => null);
      if (run?.subject.kind !== ISSUE) throw notFound('Run');
      const issue = await visibleIssue(viewer, run.subject.id);
      return { run, issue };
    };

    const startAgent = async (
      issue: IssueRow,
      agentId: string,
      viewer: Viewer,
      text: string,
    ) => {
      if (
        await app.container
          .resolve(budgetServiceToken)
          .stopsIssue(issue.id, agentId)
      )
        throw new ApiError({
          status: 'FAILED_PRECONDITION',
          reason: 'BUDGET_EXHAUSTED',
          domain: 'studio',
          message:
            'The budget for this work is used up: release it or wait for the next period.',
        });
      const name =
        (await agentNames([viewer.userId])).get(viewer.userId) ?? viewer.userId;
      return agents().runs.enqueue({
        agentId,
        subject: { kind: ISSUE, id: issue.id },
        priority: runPriorityOf(issue.priority),
        actorUserId: viewer.userId,
        responsibleUserId: issue.ownerUserId,
        requestedByUserId: viewer.userId,
        input: {
          type: 'custom',
          actor: { kind: 'user', id: viewer.userId, name },
          text,
          payload: {
            trigger: 'manual',
            issueId: issue.id,
            identifier: issue.identifier,
          },
        },
      } as never);
    };

    routes.use('/issueProgress/*', auth.required(), authz.middleware());
    for (const path of [
      '/agentBoard/*',
      '/agentBoard',
      '/issueCommentRuns/*',
      '/issueOwnerHandoffs/*',
      '/issuePanels/*',
      '/issues/:issueId/sendBack',
      '/projectManager/issues/*',
      '/failedRuns/:runId/decide',
    ])
      routes.use(path, auth.required(), authz.middleware());
    for (const path of [
      '/issueRuns',
      '/issueRuns/*',
      '/failedRuns/:runId/dispatch',
      '/failedRuns/confirmHandoff',
    ])
      routes.use(path, auth.required({ scopedKeys: true }), authz.middleware());

    routes.get(
      '/issueProgress/:issueId',
      describeRoute({
        tags: ['Studio'],
        summary: 'Get what an issue waits for',
        operationId: 'studioIssueProgress',
        security: PERSON,
        ...cliRoute({ command: 'issue progress' }),
        responses: {
          '200': dataResponse(ProgressSchema),
          ...apiErrorResponses,
        },
      }),
      apiValidator('param', IssueParam),
      async (context) => {
        requirePerson(context);
        const viewer = await viewerOf(context);
        const issue = await visibleIssue(
          viewer,
          context.req.valid('param').issueId,
        );
        return context.json({ data: await progressOf(viewer, issue) });
      },
    );

    routes.get(
      '/issueRuns',
      describeRoute({
        tags: ['Studio'],
        summary: "List an issue's agent runs",
        operationId: 'studioIssueRuns',
        security: PERSON_OR_RUN,
        ...cliRoute({ command: 'issue runs' }),
        responses: { '200': listResponse(RunSchema), ...apiErrorResponses },
      }),
      apiValidator(
        'query',
        z.object({
          issue: z.string(),
          pageSize: z.coerce.number().int().min(1).max(100).optional(),
          pageToken: z.string().optional(),
        }),
      ),
      async (context) => {
        const viewer = await viewerOf(context);
        const query = context.req.valid('query');
        const issue = await visibleIssue(viewer, query.issue);
        const cursor = query.pageToken
          ? (JSON.parse(
              Buffer.from(query.pageToken, 'base64url').toString(),
            ) as {
              createdAt: string;
              id: string;
            })
          : undefined;
        const limit = query.pageSize ?? 20;
        const runs = await agents().runs.list({
          subjectKind: ISSUE,
          subjectId: issue.id,
          limit: limit + 1,
          ...(cursor ? { cursor } : {}),
        });
        const page = runs.slice(0, limit);
        const names = await agentNames(page.map((run) => run.agentId));
        const triggers = await agents().runs.inputTriggers(
          page.map((run) => run.id),
        );
        const last = page.at(-1);
        return context.json({
          data: page.map((run) => {
            const first = triggers.get(run.id)?.[0]?.payload as
              { trigger?: string } | undefined;
            return {
              id: run.id,
              agentId: run.agentId,
              agent: names.get(run.agentId) ?? run.agentId,
              status: run.status,
              trigger: first?.trigger ?? null,
              attempt: run.attempt,
              createdAt: run.createdAt,
              startedAt: run.startedAt,
              finishedAt: run.finishedAt,
              summary: cut(run.summary, 200),
              failureReason: run.failureReason,
              failure: cut(run.failureDetail, 200),
            };
          }),
          meta:
            runs.length > limit && last
              ? {
                  nextPageToken: Buffer.from(
                    JSON.stringify({ createdAt: last.createdAt, id: last.id }),
                  ).toString('base64url'),
                }
              : {},
        });
      },
    );

    routes.get(
      '/issueRuns/:runId',
      describeRoute({
        tags: ['Studio'],
        summary: 'Get an agent run on an issue',
        operationId: 'studioIssueRun',
        security: PERSON_OR_RUN,
        ...cliRoute({ command: 'issue run get' }),
        responses: {
          '200': dataResponse(z.record(z.string(), z.unknown())),
          ...apiErrorResponses,
        },
      }),
      apiValidator('param', RunParam),
      async (context) => {
        const viewer = await viewerOf(context);
        const { run, issue } = await visibleRun(
          viewer,
          context.req.valid('param').runId,
        );
        const detail = await agents().runs.detail(run.id);
        const names = await agentNames([run.agentId]);
        return context.json({
          data: {
            id: run.id,
            actorUserId: run.actorUserId,
            actorName: detail.actorName ?? run.actorUserId,
            requestedByUserId: run.requestedByUserId,
            requestedByName: detail.requestedByName ?? run.requestedByUserId,
            ownerUserId: run.ownerUserId,
            agentId: run.agentId,
            agent: names.get(run.agentId) ?? run.agentId,
            issue: {
              id: issue.id,
              identifier: issue.identifier,
              title: issue.title,
            },
            status: run.status,
            attempt: run.attempt,
            maxAttempts: run.maxAttempts,
            retryOfRunId: run.retryOfRunId,
            retriedRunId: detail.retriedRunId ?? null,
            createdAt: run.createdAt,
            startedAt: run.startedAt,
            finishedAt: run.finishedAt,
            summary: run.summary,
            failureReason: run.failureReason,
            failureDetail: run.failureDetail,
            inputs: detail.inputs,
            usage: detail.usage,
            repos: detail.repos,
            children: detail.children,
          },
        });
      },
    );

    routes.get(
      '/issueRuns/:runId/events',
      describeRoute({
        tags: ['Studio'],
        summary: "Read an agent run's transcript on an issue",
        operationId: 'studioIssueRunEvents',
        security: PERSON_OR_RUN,
        ...cliRoute({ command: 'issue run events' }),
        responses: {
          '200': listResponse(RunEventSchema),
          ...apiErrorResponses,
        },
      }),
      apiValidator('param', RunParam),
      apiValidator(
        'query',
        z.object({
          after: z.coerce.number().int().min(0).optional(),
          pageSize: z.coerce.number().int().min(1).max(200).optional(),
        }),
      ),
      async (context) => {
        const viewer = await viewerOf(context);
        const { run } = await visibleRun(
          viewer,
          context.req.valid('param').runId,
        );
        const query = context.req.valid('query');
        const page = await agents().runs.events(
          run.id,
          query.after ?? 0,
          query.pageSize ?? 100,
        );
        const events = page.events;
        return context.json({
          data: events.map((event) => ({
            seq: event.seq,
            at: event.at,
            type: event.type,
            tool: event.tool ?? null,
            text: cut(event.content ?? event.output, 160),
            content: event.content?.slice(0, 2000) ?? null,
            output: event.output?.slice(0, 2000) ?? null,
            ...(event.input === undefined ? {} : { input: event.input }),
          })),
          meta: { lastSeq: events.at(-1)?.seq ?? query.after ?? 0 },
        });
      },
    );

    routes.get(
      '/agentBoard',
      describeRoute({
        tags: ['Studio'],
        summary: 'Get the Agent queue',
        operationId: 'studioAgentBoard',
        security: PERSON,
        ...cliRoute({ command: 'board get' }),
        responses: {
          '200': dataResponse(z.record(z.string(), z.unknown())),
          ...apiErrorResponses,
        },
      }),
      apiValidator(
        'query',
        z.object({
          q: z.string().optional(),
          projectId: z.string().optional(),
          labelId: z.string().optional(),
          ownerUserId: z.string().optional(),
          executorId: z.string().optional(),
          involvesUserId: z.string().optional(),
        }),
      ),
      async (context) => {
        requirePerson(context);
        const viewer = await viewerOf(context);
        const query = context.req.valid('query');
        const page = (await projects().issueQueries.page(viewer, {
          ...query,
          limit: 200,
        })) as unknown as {
          items?: readonly IssueRow[];
          data?: readonly IssueRow[];
          nextCursor?: string | null;
        };
        const issues = (page.items ?? page.data ?? []).filter(
          (issue) => !isFinishedStatus(issue.statusKey),
        );
        const workload = await agents().runs.workload({
          subjectKind: ISSUE,
          limit: 1000,
        });
        const byIssue = new Map<string, (typeof workload.runs)[number][]>();
        for (const run of workload.runs)
          byIssue.set(run.subject.id, [
            ...(byIssue.get(run.subject.id) ?? []),
            run,
          ]);
        const lastEnded = await agents().runs.lastEnded(
          ISSUE,
          issues.map((issue) => issue.id),
        );
        const ended = new Map(lastEnded.map((run) => [run.subject.id, run]));

        const rows = issues
          .filter(
            (issue) =>
              issue.executor?.type === 'agent' || byIssue.has(issue.id),
          )
          .map((issue) => {
            const [run, ...others] = byIssue.get(issue.id) ?? [];
            const last = ended.get(issue.id);
            const agentId = run?.agentId ?? issue.executor?.id ?? '';
            const state = run
              ? run.status === 'queued'
                ? 'queued'
                : 'working'
              : issue.statusKey === 'in_review' || issue.needsYou
                ? 'waiting'
                : 'idle';
            return {
              agentId,
              state,
              run: run
                ? {
                    id: run.id,
                    status: run.status,
                    since: run.startedAt ?? run.createdAt,
                    trigger: run.trigger,
                    runnerName: run.runnerName,
                    tool: run.tool,
                    model: run.model,
                    lastActivity: run.lastActivity,
                    attempt: run.attempt,
                    maxAttempts: run.maxAttempts,
                    priority: run.priority,
                  }
                : null,
              queue: run?.wait ?? null,
              blockedBy: null,
              waiting:
                state === 'waiting'
                  ? {
                      kind:
                        issue.statusKey === 'in_review' ? 'review' : 'question',
                      since: null,
                      waitingFor: [{ userId: issue.ownerUserId, name: null }],
                      viewerDecides: issue.ownerUserId === viewer.userId,
                      path: `/issues/${issue.id}`,
                      detail: issue.needsYou,
                    }
                  : null,
              idle:
                state === 'idle'
                  ? {
                      reason:
                        issue.statusKey === 'backlog'
                          ? 'backlog'
                          : last
                            ? 'lastRun'
                            : 'neverRan',
                      lastRun: last
                        ? {
                            status: last.status,
                            at: last.finishedAt ?? last.updatedAt,
                          }
                        : null,
                      mayStart: issue.statusKey !== 'backlog',
                    }
                  : null,
              issue: {
                id: issue.id,
                identifier: issue.identifier,
                title: issue.title,
                statusKey: issue.statusKey,
                projectId: issue.projectId ?? null,
                ownerUserId: issue.ownerUserId,
              },
              others: others.map((other) => ({
                agentId: other.agentId,
                state: other.status === 'queued' ? 'queued' : 'working',
              })),
              mine: issue.ownerUserId === viewer.userId,
            };
          });

        const count = (state: string) =>
          rows.filter((row) => row.state === state).length;
        const names = await agentNames(
          rows.map((row) => row.agentId).filter(Boolean),
        );
        return context.json({
          data: {
            rows,
            agents: Object.fromEntries(
              workload.agents.map((agent) => [
                agent.agentId,
                { ...agent, name: names.get(agent.agentId) ?? agent.agentId },
              ]),
            ),
            summary: {
              waiting: count('waiting'),
              working: count('working'),
              queued: count('queued'),
              idle: count('idle'),
              runners: {
                online: workload.runners.online,
                busy: workload.runners.busy,
                slots: workload.runners.slots,
                used: workload.runners.busy,
              },
            },
            statuses: Object.fromEntries(
              projects()
                .issueQueries.statuses()
                .map((status) => [status.key, status]),
            ),
            truncated: workload.truncated || Boolean(page.nextCursor),
            generatedAt: new Date().toISOString(),
          },
        });
      },
    );

    routes.post(
      '/agentBoard/issueWork',
      describeRoute({
        tags: ['Studio'],
        summary: 'Get current agent work on visible issues',
        operationId: 'studioAgentBoardIssueWork',
        security: PERSON,
        ...cliRoute({ command: 'board work' }),
        responses: {
          '200': dataResponse(
            z.array(
              z.object({
                issueId: z.string(),
                agentId: z.string(),
                working: z.boolean(),
              }),
            ),
          ),
          ...apiErrorResponses,
        },
      }),
      apiValidator(
        'json',
        z.object({ issueIds: z.array(z.string().min(1).max(100)).max(100) }),
      ),
      async (context) => {
        requirePerson(context);
        const viewer = await viewerOf(context);
        const visible = await projects().issueQueries.visibleIds(
          viewer,
          context.req.valid('json').issueIds,
        );
        const work = await agents().runs.workingOn(ISSUE, [...visible]);
        return context.json({
          data: work.map((entry) => ({
            issueId: entry.subjectId,
            agentId: entry.agentId,
            working: entry.working,
          })),
        });
      },
    );

    routes.get(
      '/agentBoard/issues/:issueId/agents/:agentId/wait',
      describeRoute({
        tags: ['Studio'],
        summary: 'Get why an agent’s queued run on an issue waits',
        operationId: 'studioAgentBoardWait',
        security: PERSON,
        ...cliRoute({ command: 'board wait' }),
        responses: {
          '200': dataResponse(z.record(z.string(), z.unknown())),
          ...apiErrorResponses,
        },
      }),
      apiValidator(
        'param',
        z.object({ issueId: z.string(), agentId: z.string() }),
      ),
      async (context) => {
        requirePerson(context);
        const viewer = await viewerOf(context);
        const { issueId, agentId } = context.req.valid('param');
        const issue = await visibleIssue(viewer, issueId);
        const [queued] = await agents().runs.list({
          subjectKind: ISSUE,
          subjectId: issue.id,
          agentId,
          status: 'queued',
          limit: 1,
        });
        if (!queued) throw notFound('Queued run');
        const wait = await agents().runs.queueWait(queued.id);
        if (!wait) throw notFound('Queued run');
        return context.json({ data: wait });
      },
    );

    routes.post(
      '/agentBoard/issues/:issueId/start',
      describeRoute({
        tags: ['Studio'],
        summary: 'Start the agent’s work on an idle issue',
        operationId: 'studioAgentBoardStart',
        security: PERSON,
        ...cliRoute({ command: 'board start' }),
        responses: {
          '200': dataResponse(
            z.object({ started: z.boolean(), skipped: z.string().nullable() }),
          ),
          ...apiErrorResponses,
        },
      }),
      apiValidator('param', IssueParam),
      async (context) => {
        requirePerson(context);
        const viewer = await viewerOf(context);
        const issue = await actableIssue(
          viewer,
          context.req.valid('param').issueId,
        );
        if (issue.statusKey === 'backlog')
          return context.json({ data: { started: false, skipped: 'dormant' } });
        if (isFinishedStatus(issue.statusKey))
          return context.json({
            data: { started: false, skipped: 'finished' },
          });
        if (issue.executor?.type !== 'agent')
          return context.json({ data: { started: false, skipped: 'noAgent' } });
        const open = await agents().runs.openOn(conn(), {
          kind: ISSUE,
          id: issue.id,
        });
        if (open.length > 0)
          return context.json({
            data: { started: false, skipped: 'alreadyRunning' },
          });
        await startAgent(
          issue,
          issue.executor.id,
          viewer,
          'Bắt đầu công việc này.',
        );
        return context.json({ data: { started: true, skipped: null } });
      },
    );

    routes.post(
      '/projectManager/issues/:issueId/start',
      describeRoute({
        tags: ['Studio'],
        summary: 'Hand an issue to the project manager',
        operationId: 'studioProjectManagerStart',
        security: PERSON,
        ...cliRoute({ command: 'issue manager-start' }),
        responses: {
          '200': dataResponse(z.object({ runId: z.string().nullable() })),
          ...apiErrorResponses,
        },
      }),
      apiValidator('param', IssueParam),
      async (context) => {
        requirePerson(context);
        const viewer = await viewerOf(context);
        const issue = await actableIssue(
          viewer,
          context.req.valid('param').issueId,
        );
        if (isFinishedStatus(issue.statusKey))
          throw conflict('This issue is already finished.');
        await projects().issues.update(viewer, issue.id, {
          revision: issue.revision,
          executor: { type: 'agent', id: PROJECT_MANAGER_ID },
          ...(issue.statusKey === 'backlog'
            ? { statusKey: 'in_progress' }
            : {}),
        });
        const [open] = await agents().runs.openOn(
          conn(),
          { kind: ISSUE, id: issue.id },
          PROJECT_MANAGER_ID,
        );
        return context.json({ data: { runId: open?.id ?? null } });
      },
    );

    routes.post(
      '/issues/:issueId/sendBack',
      describeRoute({
        tags: ['Studio'],
        summary: 'Send an issue back with a reason',
        operationId: 'studioIssueSendBack',
        security: [{ cookieAuth: [] }],
        ...cliRoute({ command: 'issue send-back' }),
        responses: {
          '200': dataResponse(z.object({ commentId: z.string() })),
          ...apiErrorResponses,
        },
      }),
      apiValidator('param', IssueParam),
      apiValidator(
        'json',
        z
          .object({
            revision: z.number().int().min(0),
            content: z.string().min(1),
            attachmentIds: z.array(z.string().min(1)).max(10).optional(),
          })
          .strict(),
      ),
      async (context) => {
        requirePerson(context);
        const viewer = await viewerOf(context);
        const body = context.req.valid('json');
        const issue = await actableIssue(
          viewer,
          context.req.valid('param').issueId,
        );
        if (issue.statusKey !== 'in_review')
          throw conflict(
            'Only an issue waiting for acceptance can be sent back.',
          );
        // The comment first: the move wakes the executor, and it must already see why.
        const { comment } = await projects().comments.create(viewer, issue.id, {
          content: body.content,
          ...(body.attachmentIds ? { attachmentIds: body.attachmentIds } : {}),
        });
        await projects().issues.update(viewer, issue.id, {
          revision: body.revision,
          statusKey: 'in_progress',
          needsYou: null,
        });
        return context.json({ data: { commentId: comment.id } });
      },
    );

    const recordDecision = async (values: {
      readonly runId: string;
      readonly issueId: string;
      readonly outcome: string;
      readonly decidedById: string | null;
      readonly replacementRunId?: string | null;
    }): Promise<void> => {
      try {
        await conn()
          .query.insertInto('dsFailedRunDecisions')
          .values({ ...values, decidedAt: new Date() })
          .execute();
      } catch {
        throw conflict('This failed run was already decided.');
      }
    };

    const undecidedFailed = async (viewer: Viewer, runId: string) => {
      const { run, issue } = await visibleRun(viewer, runId);
      if (run.status !== 'failed') throw conflict('This run did not fail.');
      if ((await decidedRuns(issue.id)).has(run.id))
        throw conflict('This failed run was already decided.');
      return { run, issue };
    };

    const FailedOutcome = z.object({
      outcome: z.string(),
      runId: z.string().optional(),
    });

    routes.post(
      '/failedRuns/:runId/decide',
      describeRoute({
        tags: ['Studio'],
        summary: 'Decide a failed run’s card',
        operationId: 'studioFailedRunDecide',
        security: PERSON,
        ...cliRoute({ command: 'issue failed-run decide' }),
        responses: { '200': dataResponse(FailedOutcome), ...apiErrorResponses },
      }),
      apiValidator('param', RunParam),
      apiValidator(
        'json',
        z
          .object({
            action: z.enum(['retry', 'reassign', 'cancel']),
            userId: z.string().min(1).optional(),
          })
          .strict(),
      ),
      async (context) => {
        requirePerson(context);
        const viewer = await viewerOf(context);
        const { action, userId } = context.req.valid('json');
        const { run, issue } = await undecidedFailed(
          viewer,
          context.req.valid('param').runId,
        );
        await actableIssue(viewer, issue.id);
        if (action === 'retry') {
          const retried = await agents().runs.retry(
            run.id,
            viewer.userId,
            'card',
          );
          await recordDecision({
            runId: run.id,
            issueId: issue.id,
            outcome: 'retried',
            decidedById: viewer.userId,
            replacementRunId: retried.id,
          });
          return context.json({
            data: { outcome: 'retried', runId: retried.id },
          });
        }
        if (action === 'reassign') {
          if (userId) {
            await projects().issues.update(viewer, issue.id, {
              revision: issue.revision,
              ownerUserId: userId,
            });
          } else {
            await startAgent(
              issue,
              PROJECT_MANAGER_ID,
              viewer,
              `Lượt chạy ${run.id} của agent ${run.agentId} đã lỗi (${run.failureReason ?? 'unknown'}). Hãy giao lại bước này cho agent khác.`,
            );
          }
          await recordDecision({
            runId: run.id,
            issueId: issue.id,
            outcome: 'reassigned',
            decidedById: viewer.userId,
          });
          return context.json({ data: { outcome: 'reassigned' } });
        }
        await recordDecision({
          runId: run.id,
          issueId: issue.id,
          outcome: 'cancelled',
          decidedById: viewer.userId,
        });
        return context.json({ data: { outcome: 'cancelled' } });
      },
    );

    const managerRun = async (context: Ctx) => {
      const identity = runIdentityOf(context.get('auth'));
      if (!identity?.run)
        throw denied('Only an agent run can do this.', 'RUN_ONLY');
      if (!(await agents().gate.allowed(identity)).has('pm.issues/comment'))
        throw denied('This run may not comment on issues.');
      return identity;
    };

    routes.post(
      '/failedRuns/:runId/dispatch',
      describeRoute({
        tags: ['Studio'],
        summary: 'Dispatch a replacement for a failed step',
        operationId: 'studioFailedRunDispatch',
        security: RUN_ONLY,
        ...cliRoute({
          command: 'issue failed-run dispatch',
          action: 'pm.issues/comment',
        }),
        responses: {
          '200': dataResponse(
            z.object({ commentId: z.string(), runId: z.string() }),
          ),
          ...apiErrorResponses,
        },
      }),
      apiValidator('param', RunParam),
      apiValidator(
        'json',
        z
          .object({
            content: z.string().min(1).max(200_000),
            parentId: z.string().min(1).optional(),
          })
          .strict(),
      ),
      async (context) => {
        const identity = await managerRun(context);
        const viewer = await viewerOf(context);
        const body = context.req.valid('json');
        const { run, issue } = await undecidedFailed(
          viewer,
          context.req.valid('param').runId,
        );
        if (identity.run?.run.subjectId !== issue.id)
          throw denied('A run may hand over only its own issue’s work.');
        const mentioned = [
          ...new Set(
            [...body.content.matchAll(MENTION_AGENT)].map((m) => m[1]),
          ),
        ];
        if (mentioned.length !== 1)
          throw new ApiError({
            status: 'INVALID_ARGUMENT',
            reason: 'ONE_AGENT_REQUIRED',
            domain: DOMAIN,
            message: 'A hand-over mentions exactly one replacement agent.',
          });
        const [agentId] = mentioned;
        const { comment } = await projects().comments.create(
          {
            ...viewer,
            actor: { type: 'agent', id: identity.agent?.id ?? agentId },
          },
          issue.id,
          {
            content: body.content,
            ...(body.parentId ? { parentId: body.parentId } : {}),
          },
        );
        const [replacement] = await agents().runs.openOn(
          conn(),
          { kind: ISSUE, id: issue.id },
          agentId,
        );
        if (!replacement)
          throw conflict('The replacement agent did not start.');
        await recordDecision({
          runId: run.id,
          issueId: issue.id,
          outcome: 'reassigned',
          decidedById: null,
          replacementRunId: replacement.id,
        });
        return context.json({
          data: { commentId: comment.id, runId: replacement.id },
        });
      },
    );

    routes.post(
      '/failedRuns/confirmHandoff',
      describeRoute({
        tags: ['Studio'],
        summary: 'Confirm a manager handoff of a failed step',
        operationId: 'studioFailedRunConfirmHandoff',
        security: RUN_ONLY,
        ...cliRoute({
          command: 'issue failed-run confirm',
          action: 'pm.issues/comment',
        }),
        responses: { '200': dataResponse(FailedOutcome), ...apiErrorResponses },
      }),
      apiValidator(
        'json',
        z
          .object({
            failedRunId: z.string().min(1),
            replacementRunId: z.string().min(1),
          })
          .strict(),
      ),
      async (context) => {
        const identity = await managerRun(context);
        const viewer = await viewerOf(context);
        const body = context.req.valid('json');
        const { run, issue } = await undecidedFailed(viewer, body.failedRunId);
        const replacement = await agents()
          .runs.get(body.replacementRunId)
          .catch(() => null);
        if (
          identity.run?.run.subjectId !== issue.id ||
          replacement?.subject.id !== issue.id
        )
          throw denied('A run may confirm only its own issue’s hand-over.');
        await recordDecision({
          runId: run.id,
          issueId: issue.id,
          outcome: 'reassigned',
          decidedById: null,
          replacementRunId: replacement.id,
        });
        return context.json({ data: { outcome: 'reassigned' } });
      },
    );

    routes.get(
      '/issueCommentRuns/:issueId',
      describeRoute({
        tags: ['Studio'],
        summary: 'Get an agent comment held back by the comment run limit',
        operationId: 'studioIssueCommentRuns',
        security: PERSON,
        ...cliRoute({ command: 'issue comment-limit' }),
        responses: {
          '200': dataResponse(CommentRunLimitSchema),
          ...apiErrorResponses,
        },
      }),
      apiValidator('param', IssueParam),
      async (context) => {
        requirePerson(context);
        const viewer = await viewerOf(context);
        const issue = await visibleIssue(
          viewer,
          context.req.valid('param').issueId,
        );
        return context.json({
          data: await commentRunLimit(
            await activitiesOf(viewer, issue.id),
            issue.id,
          ),
        });
      },
    );

    routes.post(
      '/issueCommentRuns/:issueId/continue',
      describeRoute({
        tags: ['Studio'],
        summary: 'Continue an agent comment held back by the comment run limit',
        operationId: 'studioIssueCommentRunsContinue',
        security: PERSON,
        ...cliRoute({ command: 'issue comment-limit continue' }),
        responses: {
          '200': dataResponse(z.object({ runIds: z.array(z.string()) })),
          ...apiErrorResponses,
        },
      }),
      apiValidator('param', IssueParam),
      apiValidator('json', z.object({ token: z.uuid() })),
      async (context) => {
        requirePerson(context);
        const viewer = await viewerOf(context);
        const issue = await actableIssue(
          viewer,
          context.req.valid('param').issueId,
        );
        const activities = await activitiesOf(viewer, issue.id);
        const held = await heldCommentRun(activities, issue.id);
        if (
          !held ||
          decisionToken('comment-run', held.id) !==
            context.req.valid('json').token
        )
          throw conflict('Nothing is held back any more.');
        const heldAgents = [
          ...new Set(
            activities
              .filter(
                (activity) =>
                  activity.action === 'work_skipped' &&
                  activity.details.reason === 'limited' &&
                  activity.actorId,
              )
              .map((activity) => String(activity.actorId)),
          ),
        ];
        const now = new Date();
        const existing = await conn()
          .query.selectFrom('dsCommentRunGrants')
          .select('issueId')
          .where('issueId', '=', issue.id)
          .executeTakeFirst();
        if (existing)
          await conn()
            .query.updateTable('dsCommentRunGrants')
            .set({ continuedAt: now, continuedById: viewer.userId })
            .where('issueId', '=', issue.id)
            .execute();
        else
          await conn()
            .query.insertInto('dsCommentRunGrants')
            .values({
              issueId: issue.id,
              continuedAt: now,
              continuedById: viewer.userId,
            })
            .execute();
        const runIds: string[] = [];
        for (const agentId of heldAgents) {
          const result = (await startAgent(
            issue,
            agentId,
            viewer,
            'Chủ dự án cho phép tiếp tục sau khi đạt giới hạn lượt chạy từ bình luận.',
          )) as { runId?: string };
          if (result.runId) runIds.push(result.runId);
        }
        return context.json({ data: { runIds } });
      },
    );

    routes.get(
      '/issueOwnerHandoffs/:issueId',
      describeRoute({
        tags: ['Studio'],
        summary: 'Get an issue owner handoff',
        operationId: 'studioIssueOwnerHandoff',
        security: PERSON,
        ...cliRoute({ command: 'issue handoff get' }),
        responses: { '200': dataResponse(HandoffSchema), ...apiErrorResponses },
      }),
      apiValidator('param', IssueParam),
      async (context) => {
        requirePerson(context);
        const viewer = await viewerOf(context);
        const issue = await visibleIssue(
          viewer,
          context.req.valid('param').issueId,
        );
        const { activityId: _activityId, ...handoff } = await handoffOf(
          viewer,
          issue,
          await activitiesOf(viewer, issue.id),
        );
        return context.json({ data: handoff });
      },
    );

    const decideHandoff =
      (outcome: 'accepted' | 'rejected') => async (context: Ctx) => {
        requirePerson(context);
        const viewer = await viewerOf(context);
        const { issueId } = context.req.param() as { issueId: string };
        const { notificationKey } = await context.req.json<{
          notificationKey: string;
        }>();
        const issue = await visibleIssue(viewer, issueId);
        const current = await handoffOf(
          viewer,
          issue,
          await activitiesOf(viewer, issue.id),
        );
        if (
          !current.handoff ||
          !current.activityId ||
          current.handoff.notificationKey !== notificationKey
        )
          throw conflict('This handoff is not current any more.');
        if (!current.canDecide)
          throw denied('Only the person it was handed to can decide.');
        const now = new Date();
        await conn()
          .query.insertInto('dsOwnerHandoffDecisions')
          .values({
            activityId: current.activityId,
            issueId: issue.id,
            outcome,
            decidedById: viewer.userId,
            decidedAt: now,
          })
          .execute();
        if (outcome === 'rejected')
          await projects().issues.update(viewer, issue.id, {
            revision: issue.revision,
            ownerUserId: current.handoff.previousOwnerUserId,
          });
        return context.json({
          data: {
            handoff: {
              ...current.handoff,
              waiting: false,
              rejectedAt: outcome === 'rejected' ? now.toISOString() : null,
            },
          },
        });
      };

    routes.post(
      '/issueOwnerHandoffs/:issueId/accept',
      describeRoute({
        tags: ['Studio'],
        summary: 'Accept an issue owner handoff',
        operationId: 'studioIssueOwnerHandoffAccept',
        security: PERSON,
        ...cliRoute({ command: 'issue handoff accept' }),
        responses: {
          '200': dataResponse(
            z.object({ handoff: HandoffSchema.shape.handoff }),
          ),
          ...apiErrorResponses,
        },
      }),
      apiValidator('param', IssueParam),
      apiValidator('json', NoteKey),
      decideHandoff('accepted'),
    );

    routes.post(
      '/issueOwnerHandoffs/:issueId/reject',
      describeRoute({
        tags: ['Studio'],
        summary: 'Reject an issue owner handoff',
        operationId: 'studioIssueOwnerHandoffReject',
        security: PERSON,
        ...cliRoute({ command: 'issue handoff reject' }),
        responses: {
          '200': dataResponse(
            z.object({ handoff: HandoffSchema.shape.handoff }),
          ),
          ...apiErrorResponses,
        },
      }),
      apiValidator('param', IssueParam),
      apiValidator('json', NoteKey),
      decideHandoff('rejected'),
    );

    routes.get(
      '/issuePanels/:issueId',
      describeRoute({
        tags: ['Studio'],
        summary: 'Read authorized task panel snapshots',
        operationId: 'studioIssuePanels',
        security: PERSON,
        ...cliRoute({ command: 'issue panels' }),
        responses: {
          '200': dataResponse(
            z.object({
              progress: ProgressSchema,
              ownerHandoff: HandoffSchema,
              pullRequests: z.object({
                data: z.array(z.record(z.string(), z.unknown())),
              }),
              commentRunLimit: CommentRunLimitSchema,
            }),
          ),
          ...apiErrorResponses,
        },
      }),
      apiValidator('param', IssueParam),
      async (context) => {
        requirePerson(context);
        const viewer = await viewerOf(context);
        const issue = await visibleIssue(
          viewer,
          context.req.valid('param').issueId,
        );
        const activities = await activitiesOf(viewer, issue.id);
        const { activityId: _activityId, ...ownerHandoff } = await handoffOf(
          viewer,
          issue,
          activities,
        );
        return context.json({
          data: {
            progress: await progressOf(viewer, issue),
            ownerHandoff,
            pullRequests: {
              data: await git().listPullRequests({ issueId: issue.id }),
            },
            commentRunLimit: await commentRunLimit(activities, issue.id),
          },
        });
      },
    );

    router.route('/', routes);
    return router;
  });
