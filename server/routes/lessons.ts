import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { Application } from '@nocobase/app-server/application';
import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization';
import { runIdentityOf } from '@nocobase/app-plugin-agents/server/tokens';
import {
  apiValidator,
  defineApiRoutes,
  describeRoute,
  apiErrorResponse,
  apiErrorResponses,
  cliRoute,
  ApiError,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { lessonsServiceToken } from '../providers/lessons.js';
import { LessonError } from '../lessons/service.js';

const DOMAIN = 'lessons';

type Env = AuthEnv & AuthorizationEnv;
type Ctx = Context<Env>;

const PERSON_OR_RUN: Record<string, string[]>[] = [
  { cookieAuth: [] },
  { apiKeyAuth: [] },
  { runToken: [] },
];

export const LessonSchema = z
  .object({
    id: z.string(),
    projectId: z.string().nullable(),
    issueId: z.string().nullable(),
    reviewId: z.string().nullable(),
    mistake: z.string(),
    rule: z.string(),
    tag: z.string(),
    target: z.enum(['skill', 'knowledge', 'sensitivePath', 'projectCriteria']),
    targetRef: z.string().nullable(),
    status: z.enum(['proposed', 'accepted', 'rejected', 'applied']),
    proposedByType: z.enum(['user', 'agent']),
    proposedById: z.string().nullable(),
    decidedBy: z.string().nullable(),
    appliedRef: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .meta({ ref: 'StudioLesson' });

const ProposeLessonBody = z.object({
  projectId: z.string().trim().nullable().optional(),
  issueId: z.string().trim().nullable().optional(),
  reviewId: z.string().trim().nullable().optional(),
  mistake: z.string().trim().min(1),
  rule: z.string().trim().min(1),
  tag: z.string().trim().min(1),
  target: z.enum(['skill', 'knowledge', 'sensitivePath', 'projectCriteria']),
  targetRef: z.string().trim().nullable().optional(),
});

const DecideLessonBody = z.object({
  decision: z.enum(['accept', 'reject']),
});

const ListLessonsQuery = z.object({
  projectId: z.string().optional(),
  issueId: z.string().optional(),
  status: z.enum(['proposed', 'accepted', 'rejected', 'applied']).optional(),
  tag: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const LessonIdParam = z.object({
  id: z.string(),
});

export const lessonRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const routes = new Hono<Env>();
    const { container } = app;
    const auth = container.resolve(authenticationToken);
    const authz = container.resolve(authorizationToken);
    const lessons = () => container.resolve(lessonsServiceToken);

    for (const path of [
      '/lessons',
      '/lessons/propose',
      '/lessons/:id',
      '/lessons/:id/decide',
      '/lessons/:id/apply',
    ]) {
      routes.use(path, auth.required({ scopedKeys: true }), authz.middleware());
    }

    const denied = (message: string) =>
      new ApiError({
        status: 'PERMISSION_DENIED',
        reason: 'FORBIDDEN',
        domain: DOMAIN,
        message,
      });

    const requireManager = async (c: Ctx) => {
      const snapshot = await c.get('authz').snapshot();
      if (!snapshot.unrestricted) {
        const canManage = await c.get('authz').can({
          resource: { type: 'settings', id: 'agents.agents' },
          action: 'manage',
        });
        if (!canManage) {
          throw denied('Only administrators may decide or apply lessons.');
        }
      }
    };

    const handleError = (error: unknown): never => {
      if (error instanceof LessonError) {
        throw new ApiError({
          status: error.status,
          reason: error.reason,
          domain: DOMAIN,
          message: error.message,
          cause: error,
        });
      }
      throw error;
    };

    // 1. GET /lessons
    routes.get(
      '/lessons',
      describeRoute({
        tags: ['Studio'],
        summary: 'List lessons learned',
        description:
          'Lists lessons proposed or applied across projects and issues.',
        security: PERSON_OR_RUN,
        ...cliRoute({ command: 'lesson list' }),
        responses: {
          200: { description: 'List of lessons.' },
          ...apiErrorResponses,
        },
      }),
      apiValidator('query', ListLessonsQuery),
      async (c) => {
        const query = c.req.valid('query');
        try {
          const list = await lessons().listLessons({
            projectId: query.projectId,
            issueId: query.issueId,
            status: query.status,
            tag: query.tag,
            limit: query.limit,
          });
          return c.json({ data: list });
        } catch (error) {
          return handleError(error);
        }
      },
    );

    // 2. GET /lessons/:id
    routes.get(
      '/lessons/:id',
      describeRoute({
        tags: ['Studio'],
        summary: 'Get lesson details',
        description: 'Retrieves a single lesson learned by id.',
        security: PERSON_OR_RUN,
        ...cliRoute({ command: 'lesson get' }),
        responses: {
          200: { description: 'Lesson details.' },
          ...apiErrorResponses,
          404: apiErrorResponse(404),
        },
      }),
      apiValidator('param', LessonIdParam),
      async (c) => {
        const { id } = c.req.valid('param');
        try {
          const lesson = await lessons().getLesson(id);
          return c.json({ data: lesson });
        } catch (error) {
          return handleError(error);
        }
      },
    );

    // 3. POST /lessons/propose
    routes.post(
      '/lessons/propose',
      describeRoute({
        tags: ['Studio'],
        summary: 'Propose a new lesson learned',
        description:
          'Proposes a rule or mistake to remember into skills, knowledge, sensitive paths or criteria. Agent is limited to 3 proposals per run.',
        security: PERSON_OR_RUN,
        ...cliRoute({ command: 'lesson propose' }),
        responses: {
          201: { description: 'Lesson proposed successfully.' },
          ...apiErrorResponses,
        },
      }),
      apiValidator('json', ProposeLessonBody),
      async (c) => {
        const body = c.req.valid('json');
        const session = c.get('auth');
        const run = runIdentityOf(session);
        const runId = run?.run?.run ? String(run.run.run.id) : null;

        const proposedByType = runId ? 'agent' : 'user';
        const proposedById =
          runId ?? (session?.user?.id ? String(session.user.id) : null);

        try {
          const lesson = await lessons().proposeLesson({
            projectId: body.projectId,
            issueId: body.issueId,
            reviewId: body.reviewId,
            mistake: body.mistake,
            rule: body.rule,
            tag: body.tag,
            target: body.target,
            targetRef: body.targetRef,
            proposedByType,
            proposedById,
          });
          return c.json({ data: lesson }, 201);
        } catch (error) {
          return handleError(error);
        }
      },
    );

    // 4. POST /lessons/:id/decide
    routes.post(
      '/lessons/:id/decide',
      describeRoute({
        tags: ['Studio'],
        summary: 'Accept or reject a proposed lesson',
        description:
          'Managers or administrators decide whether to adopt a lesson. Accepting immediately applies the lesson.',
        security: PERSON_OR_RUN,
        ...cliRoute({ command: 'lesson decide' }),
        responses: {
          200: { description: 'Lesson decided.' },
          ...apiErrorResponses,
          403: apiErrorResponse(403),
          404: apiErrorResponse(404),
        },
      }),
      apiValidator('param', LessonIdParam),
      apiValidator('json', DecideLessonBody),
      async (c) => {
        await requireManager(c);
        const { id } = c.req.valid('param');
        const { decision } = c.req.valid('json');
        const session = c.get('auth');
        const actorId = session?.user.id ?? 'admin';

        try {
          const lesson = await lessons().decideLesson(id, decision, actorId);
          return c.json({ data: lesson });
        } catch (error) {
          return handleError(error);
        }
      },
    );

    // 5. POST /lessons/:id/apply
    routes.post(
      '/lessons/:id/apply',
      describeRoute({
        tags: ['Studio'],
        summary: 'Apply an accepted lesson to its target',
        description:
          'Propagates the lesson into skills, knowledge, sensitive paths, or criteria. Administrator or manager only.',
        security: PERSON_OR_RUN,
        ...cliRoute({ command: 'lesson apply' }),
        responses: {
          200: { description: 'Lesson applied.' },
          ...apiErrorResponses,
          403: apiErrorResponse(403),
          404: apiErrorResponse(404),
        },
      }),
      apiValidator('param', LessonIdParam),
      async (c) => {
        await requireManager(c);
        const { id } = c.req.valid('param');
        const session = c.get('auth');
        const actorId = session?.user.id ?? 'admin';

        try {
          const lesson = await lessons().applyLesson(id, actorId);
          return c.json({ data: lesson });
        } catch (error) {
          return handleError(error);
        }
      },
    );

    router.route('/', routes);
    return router;
  });
