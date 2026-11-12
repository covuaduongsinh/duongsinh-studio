import {
  authenticationToken,
  isServiceAccount,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization';
import { releasesToken } from '@nocobase/app-plugin-releases/server/tokens';
import type { Application } from '@nocobase/app-server/application';
import {
  ApiError,
  apiErrorResponse,
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
  JOB_COMMAND_KEYS,
  JOB_LOG_DAYS,
  commandOf,
} from '../nb3-jobs/commands.js';
import { JobError } from '../nb3-jobs/service.js';
import { nb3JobsToken } from '../providers/nb3-jobs.js';

type Env = AuthEnv & AuthorizationEnv;
type Ctx = Context<Env>;

const DOMAIN = 'studio';
const APP_ID = /^[a-z0-9][a-z0-9-]{0,62}$/u;
const SECRET_NAME = /^[A-Z][A-Z0-9_]{1,63}$/u;
const PARAM = z.object({ appId: z.string().regex(APP_ID) });

const JobSchema = z
  .object({
    id: z.string(),
    appId: z.string(),
    command: z.enum(JOB_COMMAND_KEYS),
    write: z.boolean(),
    actorType: z.string(),
    actorId: z.string(),
    status: z.enum(['running', 'succeeded', 'failed', 'timeout', 'denied']),
    exitCode: z.number().int().nullable(),
    errorCode: z.string().nullable(),
    logTail: z
      .string()
      .nullable()
      .meta({ description: 'The last 20 KB of the log, secrets hidden.' }),
    logSha256: z.string().nullable(),
    durationMs: z.number().int().nullable(),
    startedAt: z.string(),
    finishedAt: z.string().nullable(),
  })
  .meta({ ref: 'StudioNb3Job' });

const StartBody = z.object({
  command: z.enum(JOB_COMMAND_KEYS).meta({
    description:
      '`dbApply` and `larkImportCommit` change data and are for the owner; `larkImportDry` only reads and checks.',
  }),
});

const fail = (
  status:
    | 'PERMISSION_DENIED'
    | 'NOT_FOUND'
    | 'INVALID_ARGUMENT'
    | 'ALREADY_EXISTS'
    | 'UNAVAILABLE',
  reason: string,
  message: string,
): ApiError => new ApiError({ status, reason, domain: DOMAIN, message });

/**
 * Jobs in NocoBase 3 Apps (plan V, V4.3): `POST /releases/apps/{appId}/jobs` asks the host daemon to run one named command in
 * the App's job container and answers 202 at once; `GET` reads the job (status, exit code, the masked tail of the log).
 * Needs `rel.apps/operate` on the App; a command that changes data also needs the owner (Q8).
 */
export const nb3JobRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const root = new Hono();
    const jobs = new Hono<Env>();
    const { container } = app;
    const auth = container.resolve(authenticationToken);
    const authz = container.resolve(authorizationToken);
    const rel = () => container.resolve(releasesToken);
    const service = () => container.resolve(nb3JobsToken);

    for (const path of ['/', '/*'])
      jobs.use(path, auth.required({ scopedKeys: true }), authz.middleware());

    const requireOperate = async (context: Ctx, appId: string) => {
      const caller = await rel().callerOf(context.get('authz').identity);
      // `getApp` answers the App with what the caller may do (not found for one they cannot see); the guard judges `operate`.
      const view = await rel().releases.getApp(caller, appId);
      await rel().guard.requireApp(caller, 'operate', view.app);
    };

    const requireOwner = async (context: Ctx) => {
      if (!(await context.get('authz').snapshot()).unrestricted)
        throw fail(
          'PERMISSION_DENIED',
          'OWNER_ONLY',
          'Only the owner changes a job secret.',
        );
    };

    const secretFailure = (error: unknown): unknown => {
      if (error instanceof JobError && error.code === 'CHANNEL_DOWN')
        return fail('UNAVAILABLE', 'NB3_JOB_CHANNEL_DOWN', error.message);
      if (error instanceof JobError && error.code === 'REFUSED')
        return fail('INVALID_ARGUMENT', 'JOB_SECRET_REFUSED', error.message);
      return error;
    };

    jobs.post(
      '/:appId/jobs',
      describeRoute({
        tags: ['Studio'],
        summary: 'Run a command in a NocoBase 3 App',
        description:
          'Needs the `operate` action on the App. A command that changes data also needs the owner. Answers 202 with the job; read it until its status is not `running`. One job per App at a time (409 `JOB_RUNNING`); 503 `NB3_JOB_CHANNEL_DOWN` while the daemon on the server is off.',
        operationId: 'nb3JobsStart',
        security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
        ...cliRoute({ command: 'app job start' }),
        responses: {
          202: dataResponse(JobSchema),
          ...apiErrorResponses,
          404: apiErrorResponse(404),
          409: apiErrorResponse(409),
          503: apiErrorResponse(503),
        },
      }),
      apiValidator('param', PARAM),
      apiValidator('json', StartBody),
      async (context) => {
        const { appId } = context.req.valid('param');
        const { command: key } = context.req.valid('json');
        const command = commandOf(key);
        if (!command)
          throw fail('INVALID_ARGUMENT', 'UNKNOWN_COMMAND', 'Unknown command.');
        await requireOperate(context, appId);
        if (
          command.write &&
          !(await context.get('authz').snapshot()).unrestricted
        )
          throw fail(
            'PERMISSION_DENIED',
            'OWNER_ONLY',
            'Only the owner runs a command that changes data.',
          );
        const session = context.get('auth');
        if (!session)
          throw fail('PERMISSION_DENIED', 'ACCESS_DENIED', 'Sign in first.');
        try {
          const job = await service().start({
            appId,
            command,
            actor: {
              type: isServiceAccount(session.user) ? 'agent' : 'user',
              id: session.user.id,
            },
          });
          return context.json({ data: job }, 202);
        } catch (error) {
          if (error instanceof JobError && error.code === 'RUNNING')
            throw fail('ALREADY_EXISTS', 'JOB_RUNNING', error.message);
          if (error instanceof JobError && error.code === 'CHANNEL_DOWN')
            throw fail('UNAVAILABLE', 'NB3_JOB_CHANNEL_DOWN', error.message);
          throw error;
        }
      },
    );

    jobs.get(
      '/:appId/jobs',
      describeRoute({
        tags: ['Studio'],
        summary: `Recent jobs of a NocoBase 3 App (kept ${JOB_LOG_DAYS} days)`,
        operationId: 'nb3JobsList',
        security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
        ...cliRoute({ command: 'app job list' }),
        responses: {
          200: listResponse(JobSchema),
          ...apiErrorResponses,
          404: apiErrorResponse(404),
        },
      }),
      apiValidator('param', PARAM),
      async (context) => {
        const { appId } = context.req.valid('param');
        await requireOperate(context, appId);
        return context.json({ data: await service().list(appId) });
      },
    );

    jobs.get(
      '/:appId/jobs/:jobId',
      describeRoute({
        tags: ['Studio'],
        summary: 'One job of a NocoBase 3 App',
        operationId: 'nb3JobsGet',
        security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
        ...cliRoute({ command: 'app job get' }),
        responses: {
          200: dataResponse(JobSchema),
          ...apiErrorResponses,
          404: apiErrorResponse(404),
        },
      }),
      apiValidator('param', PARAM.extend({ jobId: z.string().max(64) })),
      async (context) => {
        const { appId, jobId } = context.req.valid('param');
        await requireOperate(context, appId);
        try {
          return context.json({ data: await service().get(appId, jobId) });
        } catch (error) {
          if (error instanceof JobError && error.code === 'NOT_FOUND')
            throw fail('NOT_FOUND', 'JOB_NOT_FOUND', error.message);
          throw error;
        }
      },
    );

    jobs.put(
      '/:appId/jobSecrets/:name',
      describeRoute({
        tags: ['Studio'],
        summary: 'Store a job secret for a NocoBase 3 App',
        description:
          'Owner only. The value goes to the App’s own job file on the server through the job channel and is never kept by Studio or returned; only the job container reads it, not the web service. The daemon accepts only the names it lists for the App.',
        operationId: 'nb3JobsSetSecret',
        security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
        ...cliRoute({ command: 'app job secret set' }),
        responses: {
          200: dataResponse(z.object({ name: z.string() })),
          ...apiErrorResponses,
          404: apiErrorResponse(404),
          503: apiErrorResponse(503),
        },
      }),
      apiValidator(
        'param',
        PARAM.extend({ name: z.string().regex(SECRET_NAME) }),
      ),
      apiValidator('json', z.object({ value: z.string().min(1).max(4096) })),
      async (context) => {
        const { appId, name } = context.req.valid('param');
        const { value } = context.req.valid('json');
        await requireOperate(context, appId);
        await requireOwner(context);
        try {
          await service().setSecret(appId, name, value);
          return context.json({ data: { name } });
        } catch (error) {
          throw secretFailure(error);
        }
      },
    );

    jobs.get(
      '/:appId/jobSecrets',
      describeRoute({
        tags: ['Studio'],
        summary: 'Names of the job secrets of a NocoBase 3 App (never values)',
        operationId: 'nb3JobsSecretNames',
        security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
        ...cliRoute({ command: 'app job secret list' }),
        responses: {
          200: dataResponse(z.object({ names: z.array(z.string()) })),
          ...apiErrorResponses,
          404: apiErrorResponse(404),
          503: apiErrorResponse(503),
        },
      }),
      apiValidator('param', PARAM),
      async (context) => {
        const { appId } = context.req.valid('param');
        await requireOperate(context, appId);
        try {
          return context.json({
            data: { names: await service().secretNames(appId) },
          });
        } catch (error) {
          throw secretFailure(error);
        }
      },
    );

    root.route('/releases/apps', jobs);
    return root;
  });
