import {
  authenticationToken,
  isServiceAccount,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization';
import { runIdentityOf } from '@nocobase/app-plugin-agents/server/tokens';
import {
  DomainError,
  projectsAccessToken,
  projectsToken,
  type Projects,
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
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { agentsToken } from '@nocobase/app-plugin-agents/server/tokens';
import { databaseManagerToken } from '@nocobase/db';
import { ISSUE_SUBJECT } from '../agents/ids.js';
import { str } from '../git/rows.js';
import { agentWakerToken } from '../providers/agent-executor.js';
import { lessonsServiceToken } from '../providers/lessons.js';
import { contextFrom, snippetOf } from '../run-profile/excerpt.js';
import { maskSecrets } from '../security/secret-patterns.js';

type Env = AuthEnv & AuthorizationEnv;
const DOMAIN = 'studio';
const PERSON_ONLY: Record<string, string[]>[] = [
  { cookieAuth: [] },
  { apiKeyAuth: [] },
];

const HitSchema = z
  .object({
    runId: z.string(),
    seq: z.number().int(),
    at: z.string().nullable(),
    type: z.string(),
    snippet: z.string(),
    subjectKind: z.string().nullable(),
    subjectId: z.string().nullable(),
  })
  .meta({ ref: 'StudioRunLogHit' });

const SearchQuery = z.object({
  q: z.string().trim().min(2).max(200),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

const ContinueBody = z
  .object({
    seq: z.number().int().min(1),
    note: z.string().trim().max(2000).optional(),
  })
  .strict();

const ContinueSchema = z
  .object({
    started: z.boolean(),
    skipped: z.string().nullable(),
    runId: z.string().nullable(),
  })
  .meta({ ref: 'StudioRunContinued' });

const LessonBody = z
  .object({
    seq: z.number().int().min(1),
    rule: z.string().trim().min(1).max(1000),
    tag: z.string().trim().min(1).max(64),
    target: z.enum(['skill', 'knowledge', 'sensitivePath', 'projectCriteria']),
  })
  .strict();

const LessonSchema = z
  .object({ id: z.string(), status: z.string() })
  .meta({ ref: 'StudioRunLesson' });

const RunParams = z.object({ runId: z.string() });

/** A run's log: search across runs, continue from a step, and turn a step into a lesson (plan T, T11). */
export const runProfileRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const routes = new Hono<Env>();
    const { container } = app;
    const auth = container.resolve(authenticationToken);
    const authz = container.resolve(authorizationToken);
    const projects = (): Projects => container.resolve(projectsToken);

    const viewerOf = async (context: Context<Env>): Promise<Viewer> => {
      const session = context.get('auth');
      if (!session)
        throw new ApiError({
          status: 'UNAUTHENTICATED',
          reason: 'UNAUTHENTICATED',
          domain: DOMAIN,
          message: 'Sign in first.',
        });
      if (
        runIdentityOf(session)?.run ||
        isServiceAccount(session.user) ||
        (await auth.isScopedSession(session, context.req.raw))
      )
        throw new ApiError({
          status: 'PERMISSION_DENIED',
          reason: 'RUN_NOT_ALLOWED',
          domain: DOMAIN,
          message:
            'Branch protection is read by people, not by runs or scoped keys.',
        });
      return {
        userId: session.user.id,
        actor: { type: 'user', id: session.user.id },
        permissions: await container
          .resolve(projectsAccessToken)
          .permissionsOf(context.get('authz').identity),
      };
    };

    const conn = () => container.resolve(databaseManagerToken).connection();

    /** The run's issue, when the caller may edit it: the person's own right, not the agent's. */
    const editableRun = async (context: Context<Env>, runId: string) => {
      const viewer = await viewerOf(context);
      const notFound = new ApiError({
        status: 'NOT_FOUND',
        reason: 'RUN_NOT_FOUND',
        domain: DOMAIN,
        message: `Run ${runId} not found.`,
      });
      let run;
      try {
        run = await container.resolve(agentsToken).runs.get(runId);
      } catch {
        throw notFound;
      }
      if (run.subject.kind !== ISSUE_SUBJECT) throw notFound;
      try {
        await projects().issueQueries.visible(viewer, run.subject.id);
      } catch (error) {
        if (error instanceof DomainError) throw notFound;
        throw error;
      }
      const scope = viewer.permissions.scopes['pm.issues/edit' as never] as
        string | undefined;
      if (
        !(await context.get('authz').snapshot()).unrestricted &&
        (!scope || scope === 'none')
      )
        throw new ApiError({
          status: 'PERMISSION_DENIED',
          reason: 'ACCESS_DENIED',
          domain: DOMAIN,
          message: 'You may not change this issue.',
        });
      return { viewer, run, issueId: run.subject.id };
    };

    for (const path of [
      '/runLogs/search',
      '/runs/:runId/continueFrom',
      '/runs/:runId/lesson',
    ])
      routes.use(path, auth.required({ scopedKeys: true }), authz.middleware());

    routes.get(
      '/runLogs/search',
      describeRoute({
        tags: ['Studio Agents'],
        summary: 'Search the logs of every run',
        description:
          'The text of events across runs, with a short window around the match and secrets masked. For administrators.',
        security: PERSON_ONLY,
        ...cliRoute({ command: 'run-log search' }),
        responses: { '200': listResponse(HitSchema), ...apiErrorResponses },
      }),
      apiValidator('query', SearchQuery),
      async (context) => {
        await viewerOf(context);
        if (!(await context.get('authz').snapshot()).unrestricted)
          throw new ApiError({
            status: 'PERMISSION_DENIED',
            reason: 'ACCESS_DENIED',
            domain: DOMAIN,
            message: 'Only administrators search every run’s log.',
          });
        const { q, limit } = context.req.valid('query');
        const like = `%${q.replace(/[\\%_]/gu, (c) => `\\${c}`)}%`;
        const rows = await conn()
          .query.selectFrom('agRunEvents as event')
          .innerJoin('agRuns as run', 'run.id', 'event.runId')
          .select([
            'event.runId as runId',
            'event.seq as seq',
            'event.at as at',
            'event.type as type',
            'event.content as content',
            'event.output as output',
            'run.subjectKind as subjectKind',
            'run.subjectId as subjectId',
          ])
          .where((eb) =>
            eb.or([
              eb('event.content', 'like', like),
              eb('event.output', 'like', like),
            ]),
          )
          .orderBy('event.at', 'desc')
          .limit(limit)
          .execute();
        return context.json({
          data: rows.map((row) => ({
            runId: str(row.runId),
            seq: Number(row.seq),
            at: row.at ? new Date(str(row.at)).toISOString() : null,
            type: str(row.type),
            snippet: snippetOf(
              [row.content, row.output].filter(Boolean).map(str).join(' → '),
              q,
              80,
            ),
            subjectKind: row.subjectKind ? str(row.subjectKind) : null,
            subjectId: row.subjectId ? str(row.subjectId) : null,
          })),
        });
      },
    );

    routes.post(
      '/runs/:runId/continueFrom',
      describeRoute({
        tags: ['Studio Agents'],
        summary: 'Continue an issue from a step of an earlier run',
        description:
          'Wakes the agent that holds the issue with the earlier run’s log up to that step (secrets masked) and an optional note, as one new run. Every guard of a wake still applies: a finished issue, a budget or a limit leaves it alone.',
        security: PERSON_ONLY,
        ...cliRoute({ command: 'run continue-from' }),
        responses: {
          '200': dataResponse(ContinueSchema),
          ...apiErrorResponses,
        },
      }),
      apiValidator('param', RunParams),
      apiValidator('json', ContinueBody),
      async (context) => {
        const { runId } = context.req.valid('param');
        const { seq, note } = context.req.valid('json');
        const { run, issueId } = await editableRun(context, runId);
        const page = await container
          .resolve(agentsToken)
          .runs.events(runId, 0, 1000);
        const text = [
          `Làm tiếp từ bước #${seq} của lượt chạy trước (${run.id}). Nhật ký đến bước đó:`,
          '',
          contextFrom(page.events, seq, 15),
          ...(note ? ['', `Ghi chú của người: ${maskSecrets(note)}`] : []),
        ].join('\n');
        const attempt = await container
          .resolve(agentWakerToken)
          .wakeIssue({ issueId, text });
        return context.json({
          data: {
            started: attempt?.started ?? false,
            skipped: attempt?.skipped ?? (attempt ? null : 'noAgent'),
            runId: attempt?.runId ?? null,
          },
        });
      },
    );

    routes.post(
      '/runs/:runId/lesson',
      describeRoute({
        tags: ['Studio Agents'],
        summary: 'Turn a step of a run into a lesson',
        description:
          'Proposes a lesson built from the log up to that step (secrets masked). It waits for approval like every proposed lesson.',
        security: PERSON_ONLY,
        ...cliRoute({ command: 'run lesson' }),
        responses: { '201': dataResponse(LessonSchema), ...apiErrorResponses },
      }),
      apiValidator('param', RunParams),
      apiValidator('json', LessonBody),
      async (context) => {
        const { runId } = context.req.valid('param');
        const body = context.req.valid('json');
        const { viewer, issueId } = await editableRun(context, runId);
        const page = await container
          .resolve(agentsToken)
          .runs.events(runId, 0, 1000);
        const issue = await conn()
          .query.selectFrom('pmIssues')
          .select('projectId')
          .where('id', '=', issueId)
          .executeTakeFirst();
        const lesson = await container
          .resolve(lessonsServiceToken)
          .proposeLesson({
            projectId: issue?.projectId ? str(issue.projectId) : null,
            issueId,
            mistake: contextFrom(page.events, body.seq, 6),
            rule: maskSecrets(body.rule),
            tag: body.tag,
            target: body.target,
            targetRef: null,
            proposedByType: 'user',
            proposedById: viewer.userId,
          });
        return context.json(
          { data: { id: lesson.id, status: lesson.status } },
          201,
        );
      },
    );

    router.route('/', routes);
    return router;
  });
