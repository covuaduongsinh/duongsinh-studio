import {
  authenticationToken,
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
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono } from 'hono';
import { z } from 'zod';
import { gitServiceToken, publicBaseUrlOf } from '../providers/git.js';
import { releaseServiceToken } from '../providers/releases.js';
import { assertAppHost, composeNameOf } from '../releases/nb3-compose.js';
import { DOKPLOY_DRIVER } from '../releases/dokploy-driver.js';
import { nb3AppWorkflow, NB3_CI_SECRET } from '../setups/ci-workflow.js';

type Env = AuthEnv & AuthorizationEnv;

const DOMAIN = 'studio';
const APP_ID = /^[a-z0-9][a-z0-9-]{0,62}$/u;
const ROLES = ['preview', 'staging', 'production'] as const;
/** Where the Studio container writes releases and where the VPS sees the same directory (docs/trien-khai-vps.md). */
const DEFAULT_DATA_DIR = '/app/storage/nb3-apps';
const DEFAULT_HOST_DIR = '/srv/duongsinh-studio/storage/nb3-apps';
/** Places per environment: one preview or staging App at a time; production holds each of the organization's Apps. */
const MAX_APPS = { preview: 1, staging: 1, production: 4 } as const;
const PREVIEW_IDLE_MINUTES = 30;

const Body = z.object({
  repositoryId: z.string().min(1),
  appId: z.string().regex(APP_ID),
  host: z.string().min(4).max(253),
  role: z.enum(ROLES),
  database: z.enum(['sqlite', 'postgres']),
});

const fail = (
  status:
    'PERMISSION_DENIED' | 'NOT_FOUND' | 'INVALID_ARGUMENT' | 'ALREADY_EXISTS',
  reason: string,
  message: string,
): ApiError => new ApiError({ status, reason, domain: DOMAIN, message });

const ResultSchema = z
  .object({
    appId: z.string(),
    environmentId: z.string(),
    environmentCreated: z.boolean(),
    host: z.string(),
    workflow: z.object({ path: z.string(), content: z.string() }),
    secretName: z.string(),
    next: z.array(z.string()),
  })
  .meta({ ref: 'StudioNb3AppRegistration' });

/**
 * Registers a NocoBase 3 App for a repository in one step (plan V, V5.3), replacing the hand-written environment JSON: finds or
 * makes the `dokploy` release environment of the role, makes the App in it, links the App to the repository and answers the CI
 * workflow to commit. The owner only. Steps that follow the releases plugin's own writes are undone if a later one fails, so no
 * half-registered App is left. The narrow CI key is made afterwards with `POST /repositoryDeployments/{id}/ci/setup` (its secret is
 * shown once, which a registration answer must not do); DNS and the GitHub secret are not Studio's.
 */
export const nb3AppsRegisterRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const root = new Hono();
    const routes = new Hono<Env>();
    const { container } = app;
    const auth = container.resolve(authenticationToken);
    const authz = container.resolve(authorizationToken);
    const rel = () => container.resolve(releasesToken);
    const apiBaseOf = (requestUrl: string): string =>
      `${publicBaseUrlOf(app) ?? new URL(requestUrl).origin}/api`;

    routes.use(
      '/nb3Apps/*',
      auth.required({ scopedKeys: true }),
      authz.middleware(),
    );

    routes.post(
      '/nb3Apps/register',
      describeRoute({
        tags: ['Studio'],
        summary: 'Register a NocoBase 3 App for a repository',
        description:
          'Owner only. Makes (or reuses) the `nb3-<role>` release environment on the `dokploy` driver, creates the App, links it to the repository and answers the CI workflow file. 409 `APP_EXISTS` / `HOST_TAKEN` / `DATABASE_MISMATCH`; nothing is left behind when a step fails.',
        operationId: 'nb3AppsRegister',
        security: [{ cookieAuth: [] }, { apiKeyAuth: [] }],
        ...cliRoute({ command: 'app register' }),
        responses: {
          201: dataResponse(ResultSchema),
          ...apiErrorResponses,
          404: apiErrorResponse(404),
          409: apiErrorResponse(409),
        },
      }),
      apiValidator('json', Body),
      async (context) => {
        if (!(await context.get('authz').snapshot()).unrestricted)
          throw fail(
            'PERMISSION_DENIED',
            'OWNER_ONLY',
            'Only the owner registers an App.',
          );
        const body = context.req.valid('json');
        try {
          assertAppHost(body.host);
          composeNameOf(body.appId);
        } catch (error) {
          throw fail(
            'INVALID_ARGUMENT',
            'INVALID_HOST',
            error instanceof Error ? error.message : 'Invalid host.',
          );
        }
        const repository = await container
          .resolve(gitServiceToken)
          .getRepository(body.repositoryId)
          .catch(() => null);
        if (!repository)
          throw fail(
            'NOT_FOUND',
            'REPOSITORY_NOT_FOUND',
            'No such repository.',
          );

        const { system, environments, releases } = rel();
        if (await releases.getApp(system, body.appId).catch(() => null))
          throw fail(
            'ALREADY_EXISTS',
            'APP_EXISTS',
            `The App ${body.appId} already exists.`,
          );

        const environmentId = `nb3-${body.role}`;
        const all = await environments.list(system);
        const found = all.find((item) => item.id === environmentId);
        // A host belongs to one App across every NocoBase 3 environment.
        for (const item of all.filter(
          (entry) => entry.driver === DOKPLOY_DRIVER,
        )) {
          const hosts = (item.config['hosts'] ?? {}) as Record<string, unknown>;
          if (Object.values(hosts).includes(body.host))
            throw fail(
              'ALREADY_EXISTS',
              'HOST_TAKEN',
              `The host ${body.host} is used by another App.`,
            );
        }
        if (found && found.driver !== DOKPLOY_DRIVER)
          throw fail(
            'ALREADY_EXISTS',
            'ENVIRONMENT_CONFLICT',
            `${environmentId} exists on another driver.`,
          );
        if (found && (found.config['database'] ?? 'sqlite') !== body.database)
          throw fail(
            'ALREADY_EXISTS',
            'DATABASE_MISMATCH',
            `${environmentId} uses ${found.config['database'] === 'postgres' ? 'postgres' : 'sqlite'}: one environment, one database kind.`,
          );

        // Undo list for the steps that write.
        const undo: (() => Promise<void>)[] = [];
        try {
          const sibling = all.find((item) => item.driver === DOKPLOY_DRIVER);
          const base = {
            dataDir:
              process.env['NB3_APPS_DATA_DIR'] ??
              (sibling?.config['dataDir'] as string | undefined) ??
              DEFAULT_DATA_DIR,
            hostDir:
              process.env['NB3_APPS_HOST_DIR'] ??
              (sibling?.config['hostDir'] as string | undefined) ??
              DEFAULT_HOST_DIR,
            database: body.database,
            basePath: '/',
            maxApps: MAX_APPS[body.role],
          };
          if (found) {
            const before = found.config;
            await environments.update(system, environmentId, {
              config: {
                ...before,
                hosts: {
                  ...((before['hosts'] ?? {}) as Record<string, string>),
                  [body.appId]: body.host,
                },
              },
            });
            undo.push(async () => {
              await environments.update(system, environmentId, {
                config: before,
              });
            });
          } else {
            await environments.create(system, {
              id: environmentId,
              name: `NocoBase 3 ${body.role}`,
              driver: DOKPLOY_DRIVER,
              config: { ...base, hosts: { [body.appId]: body.host } },
              protected: body.role === 'production',
              purpose: body.role === 'preview' ? 'preview' : 'test',
              maxApps: MAX_APPS[body.role],
            });
            undo.push(async () => {
              await environments.remove(system, environmentId);
            });
          }
          await releases.createApp(system, {
            id: body.appId,
            name: body.appId,
            environmentId,
            ...(body.role === 'preview'
              ? { idleStopMinutes: PREVIEW_IDLE_MINUTES }
              : {}),
          });
          undo.push(async () => {
            await releases.deleteApp(system, body.appId, {
              confirm: body.appId,
            });
          });
          await container
            .resolve(releaseServiceToken)
            .setRepositoryApp(repository.id, {
              environmentKey: body.role,
              appId: body.appId,
            });
        } catch (error) {
          for (const step of undo.reverse())
            await step().catch(() => undefined);
          throw error;
        }

        const workflow = nb3AppWorkflow({
          appId: body.appId,
          role: body.role,
          branch: repository.defaultBranch || 'main',
          apiBase: apiBaseOf(context.req.url),
        });
        return context.json(
          {
            data: {
              appId: body.appId,
              environmentId,
              environmentCreated: !found,
              host: body.host,
              workflow,
              secretName: NB3_CI_SECRET,
              next: ['dns', 'ciKey', 'githubSecret', 'workflowPush'],
            },
          },
          201,
        );
      },
    );

    root.route('/', routes);
    return root;
  });
