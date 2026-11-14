import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization';
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
import {
  ROUTINES_SETTINGS,
  routinesServiceToken,
} from '../providers/routines.js';
import { ROUTINE_TEMPLATES } from '../routines/decide.js';
import { RoutineError } from '../routines/service.js';

type Env = AuthEnv & AuthorizationEnv;
type Ctx = Context<Env>;

const DOMAIN = 'studio';
const PERSON_ONLY: Record<string, string[]>[] = [
  { cookieAuth: [] },
  { apiKeyAuth: [] },
];

const RoutineSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    playbookSlug: z.string().nullable(),
    template: z.string(),
    cron: z.string(),
    enabled: z.boolean(),
    projectIds: z.array(z.string()),
    lastRunAt: z.string().nullable(),
    lastResult: z.string().nullable(),
  })
  .meta({ ref: 'StudioRoutine' });

const TemplateSchema = z
  .object({
    key: z.string(),
    name: z.string(),
    playbookSlug: z.string().nullable(),
    template: z.string(),
    cron: z.string(),
  })
  .meta({ ref: 'StudioRoutineTemplate' });

const RunSchema = z
  .object({
    created: z.array(z.object({ projectId: z.string(), issueId: z.string() })),
    skipped: z.array(
      z.object({
        projectId: z.string(),
        reason: z.string(),
        detail: z.string().optional(),
      }),
    ),
  })
  .meta({ ref: 'StudioRoutineRun' });

const RoutineBody = z
  .object({
    name: z.string().trim().min(1).max(200),
    playbookSlug: z.string().trim().min(1).max(64).nullable().optional(),
    template: z.string().trim().min(1).max(8000),
    cron: z.string().trim().min(1).max(64),
    projectIds: z.array(z.string().min(1)).min(1).max(50),
  })
  .strict();
const FromTemplateBody = z
  .object({
    key: z.string().min(1),
    projectIds: z.array(z.string().min(1)).min(1).max(50),
  })
  .strict();
const EnabledBody = z.object({ enabled: z.boolean() }).strict();
const IdParams = z.object({ routineId: z.string() });

/** The routines of Studio, for whoever holds `studio.routines` (plan T, T6). */
export const routineRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const routes = new Hono<Env>();
    const { container } = app;
    const auth = container.resolve(authenticationToken);
    const authz = container.resolve(authorizationToken);
    const service = () => container.resolve(routinesServiceToken);

    const denied = (message: string): ApiError =>
      new ApiError({
        status: 'PERMISSION_DENIED',
        reason: 'ACCESS_DENIED',
        domain: DOMAIN,
        message,
      });

    const requireHolder = async (
      context: Ctx,
      action: 'read' | 'manage',
    ): Promise<string> => {
      const session = context.get('auth');
      if (!session)
        throw new ApiError({
          status: 'UNAUTHENTICATED',
          reason: 'UNAUTHENTICATED',
          domain: DOMAIN,
          message: 'Sign in first.',
        });
      const access = context.get('authz');
      if (
        !(await access.snapshot()).unrestricted &&
        !(await access.can({
          resource: { type: 'settings', id: ROUTINES_SETTINGS },
          action,
        }))
      )
        throw denied(`${ROUTINES_SETTINGS} ${action} is required.`);
      return session.user.id;
    };

    /** A routine failure as the answer it means. */
    const guarded = async <T>(work: () => Promise<T>): Promise<T> => {
      try {
        return await work();
      } catch (error) {
        if (error instanceof RoutineError)
          throw new ApiError({
            status:
              error.reason === 'NOT_FOUND' ? 'NOT_FOUND' : 'INVALID_ARGUMENT',
            reason: error.reason,
            domain: DOMAIN,
            message: error.message,
          });
        throw error;
      }
    };

    for (const path of ['/routines', '/routines/*', '/routineTemplates'])
      routes.use(path, auth.required(), authz.middleware());

    routes.get(
      '/routines',
      describeRoute({
        tags: ['Studio Autopilot'],
        summary: 'List the routines',
        security: PERSON_ONLY,
        ...cliRoute({ command: 'routine list' }),
        responses: { '200': listResponse(RoutineSchema), ...apiErrorResponses },
      }),
      async (context) => {
        await requireHolder(context, 'read');
        return context.json({ data: await service().list() });
      },
    );

    routes.get(
      '/routineTemplates',
      describeRoute({
        tags: ['Studio Autopilot'],
        summary: 'The ready-made routines',
        security: PERSON_ONLY,
        ...cliRoute({ command: 'routine templates' }),
        responses: {
          '200': listResponse(TemplateSchema),
          ...apiErrorResponses,
        },
      }),
      async (context) => {
        await requireHolder(context, 'read');
        return context.json({ data: ROUTINE_TEMPLATES });
      },
    );

    routes.post(
      '/routines',
      describeRoute({
        tags: ['Studio Autopilot'],
        summary: 'Create a routine',
        description:
          'It is off until someone turns it on. Its issues are made with the permissions of the person who created it.',
        security: PERSON_ONLY,
        ...cliRoute({ command: 'routine create' }),
        responses: { '201': dataResponse(RoutineSchema), ...apiErrorResponses },
      }),
      apiValidator('json', RoutineBody),
      async (context) => {
        const userId = await requireHolder(context, 'manage');
        return context.json(
          {
            data: await guarded(() =>
              service().create(userId, context.req.valid('json')),
            ),
          },
          201,
        );
      },
    );

    routes.post(
      '/routines/fromTemplate',
      describeRoute({
        tags: ['Studio Autopilot'],
        summary: 'Create a routine from a ready-made one',
        security: PERSON_ONLY,
        ...cliRoute({ command: 'routine from-template' }),
        responses: { '201': dataResponse(RoutineSchema), ...apiErrorResponses },
      }),
      apiValidator('json', FromTemplateBody),
      async (context) => {
        const userId = await requireHolder(context, 'manage');
        const { key, projectIds } = context.req.valid('json');
        return context.json(
          {
            data: await guarded(() =>
              service().createFromTemplate(userId, key, projectIds),
            ),
          },
          201,
        );
      },
    );

    routes.put(
      '/routines/:routineId',
      describeRoute({
        tags: ['Studio Autopilot'],
        summary: 'Change a routine',
        security: PERSON_ONLY,
        ...cliRoute({ command: 'routine update' }),
        responses: { '200': dataResponse(RoutineSchema), ...apiErrorResponses },
      }),
      apiValidator('param', IdParams),
      apiValidator('json', RoutineBody),
      async (context) => {
        await requireHolder(context, 'manage');
        return context.json({
          data: await guarded(() =>
            service().update(
              context.req.valid('param').routineId,
              context.req.valid('json'),
            ),
          ),
        });
      },
    );

    routes.post(
      '/routines/:routineId/enabled',
      describeRoute({
        tags: ['Studio Autopilot'],
        summary: 'Turn a routine on or off',
        security: PERSON_ONLY,
        ...cliRoute({ command: 'routine enable' }),
        responses: { '200': dataResponse(RoutineSchema), ...apiErrorResponses },
      }),
      apiValidator('param', IdParams),
      apiValidator('json', EnabledBody),
      async (context) => {
        await requireHolder(context, 'manage');
        return context.json({
          data: await guarded(() =>
            service().setEnabled(
              context.req.valid('param').routineId,
              context.req.valid('json').enabled,
            ),
          ),
        });
      },
    );

    routes.post(
      '/routines/:routineId/run',
      describeRoute({
        tags: ['Studio Autopilot'],
        summary: 'Run a routine now',
        description:
          'Opens its issues as at its time, with the same rules: none while one of its issues is open, none past the project’s limit, none while a budget holds work back.',
        security: PERSON_ONLY,
        ...cliRoute({ command: 'routine run' }),
        responses: { '200': dataResponse(RunSchema), ...apiErrorResponses },
      }),
      apiValidator('param', IdParams),
      async (context) => {
        await requireHolder(context, 'manage');
        return context.json({
          data: await guarded(() =>
            service().run(context.req.valid('param').routineId),
          ),
        });
      },
    );

    routes.delete(
      '/routines/:routineId',
      describeRoute({
        tags: ['Studio Autopilot'],
        summary: 'Delete a routine',
        security: PERSON_ONLY,
        ...cliRoute({ command: 'routine delete' }),
        responses: {
          '200': dataResponse(z.object({ ok: z.literal(true) })),
          ...apiErrorResponses,
        },
      }),
      apiValidator('param', IdParams),
      async (context) => {
        await requireHolder(context, 'manage');
        await guarded(() =>
          service().remove(context.req.valid('param').routineId),
        );
        return context.json({ data: { ok: true as const } });
      },
    );

    router.route('/', routes);
    return router;
  });
