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
  cliRoute,
  dataResponse,
  defineApiRoutes,
  describeRoute,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { databaseManagerToken } from '@nocobase/db';
import { Hono } from 'hono';
import { z } from 'zod';
import { createNb3Store } from '../providers/nb3-apps.js';
import { hostAvailableMb } from '../previews/service.js';

type Env = AuthEnv & AuthorizationEnv;

/** Memory each NocoBase 3 App may use (`mem_limit` in `server/releases/nb3-compose.ts`). */
export const APP_MEMORY_LIMIT_MB = 1024;

const HostLoadSchema = z
  .object({
    availableMb: z.number().int().nullable().meta({
      description: 'Memory the server still has available; null if unreadable.',
    }),
    minAvailableMb: z.number().int().meta({
      description: 'An App is not started below this (`NB3_MIN_AVAILABLE_MB`).',
    }),
    appMemoryLimitMb: z.number().int(),
    runningApps: z.array(
      z.object({ appId: z.string(), version: z.string().nullable() }),
    ),
  })
  .meta({ ref: 'StudioHostLoad' });

/**
 * The "Server" card of the Releases page (plan V, V5.1b): how much memory is free and which NocoBase 3 Apps Studio runs.
 * For the owner and for people who may view, deploy or operate Apps (`rel.apps`).
 */
export const hostLoadRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const root = new Hono();
    const routes = new Hono<Env>();
    const { container } = app;
    const auth = container.resolve(authenticationToken);
    const authz = container.resolve(authorizationToken);
    const database = container.resolve(databaseManagerToken);

    routes.use(
      '/hostLoad',
      auth.required({ scopedKeys: true }),
      authz.middleware(),
    );

    routes.get(
      '/hostLoad',
      describeRoute({
        tags: ['Studio'],
        summary:
          'Free memory of the server and the NocoBase 3 Apps running on it',
        operationId: 'hostLoadGet',
        security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
        ...cliRoute({ command: 'host load' }),
        responses: { 200: dataResponse(HostLoadSchema), ...apiErrorResponses },
      }),
      async (context) => {
        const authorization = context.get('authz');
        let allowed = (await authorization.snapshot()).unrestricted;
        for (const action of ['view.all', 'deploy.all', 'operate.all'])
          allowed ||= await authorization.can({
            resource: { type: 'rel', id: 'rel.apps' },
            action,
          });
        if (!allowed)
          throw new ApiError({
            status: 'PERMISSION_DENIED',
            reason: 'ACCESS_DENIED',
            domain: 'studio',
            message: 'Viewing the server needs access to Apps.',
          });
        const store = createNb3Store(() => database.connection());
        const rows = (await database.collections().getPhysical('dsNb3Apps'))
          ? await store.list()
          : [];
        return context.json({
          data: {
            availableMb: await hostAvailableMb(),
            minAvailableMb: Number(process.env['NB3_MIN_AVAILABLE_MB']) || 1200,
            appMemoryLimitMb: APP_MEMORY_LIMIT_MB,
            runningApps: rows
              .filter((row) => row.desiredState === 'running')
              .map((row) => ({ appId: row.appId, version: row.version })),
          },
        });
      },
    );

    root.route('/', routes);
    return root;
  });
