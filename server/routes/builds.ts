import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization';
import { scopedApiKeysToken } from '@nocobase/app-plugin-api-keys/server';
import {
  projectsAccessToken,
  projectsToken,
  type Viewer,
} from '@nocobase/app-plugin-projects/server/tokens';
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
import { databaseManagerToken } from '@nocobase/db';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { z } from 'zod';
import { str, strOrNull, type Row } from '../git/rows.js';
import type { GitRepositoryView } from '../git/service.js';
import { EXTERNAL_ENVIRONMENT } from '../providers/build-storage.js';
import { gitServiceToken, publicBaseUrlOf } from '../providers/git.js';
import { ORGANIZATION_KEYS_USER } from '../providers/organization-keys.js';
import { releaseServiceToken } from '../providers/releases.js';

type Env = AuthEnv & AuthorizationEnv;
type Ctx = Context<Env>;

const DOMAIN = 'studio';
const BUILDS = 'dsBuilds';
const CI_KEYS = 'dsRepositoryCiKeys';
const DOWNLOADS = 'dsReleaseDownloads';
const LINK_HOURS = 24;
/** A CI key lives 90 days (it was 365): a leaked secret is useful for a season, not a year. Rotation renews it. */
const CI_KEY_DAYS = 90;
const DAY_MS = 86_400_000;
const CI_SECRET = 'DS_STUDIO_API_KEY';
const APP_ID = /^[a-z0-9][a-z0-9-]{0,62}$/u;
const ROLES = ['staging', 'production'] as const;
const NOT_RUNNING =
  'Studio stores builds and does not run them: the App Host is off on this server. Deploy through Dokploy and record it.';

const fail = (
  status:
    | 'PERMISSION_DENIED'
    | 'NOT_FOUND'
    | 'INVALID_ARGUMENT'
    | 'FAILED_PRECONDITION',
  reason: string,
  message: string,
): ApiError => new ApiError({ status, reason, domain: DOMAIN, message });

const BuildSchema = z
  .object({
    id: z.string(),
    appId: z.string(),
    sha: z.string(),
    state: z.enum(['queued', 'building', 'failed', 'succeeded']),
    logsUrl: z.string().nullable(),
    message: z.string().nullable(),
    releaseId: z.string().nullable(),
    uploadedAt: z.string().nullable(),
    reportedAt: z.string(),
    updatedAt: z.string(),
  })
  .meta({ ref: 'StudioBuild' });

const DeploymentSchema = z
  .object({
    resourceId: z.string(),
    projectId: z.string().nullable(),
    apps: z.array(
      z.object({
        appId: z.string(),
        role: z.enum(ROLES).nullable(),
        name: z.string(),
        environmentId: z.string(),
      }),
    ),
    repo: z.string(),
    defaultBranch: z.string(),
    canEdit: z.boolean(),
  })
  .meta({ ref: 'StudioRepositoryDeployment' });

const CiSchema = z
  .object({
    secretName: z.string(),
    key: z
      .object({
        id: z.string(),
        start: z.string().nullable(),
        expiresAt: z.string().nullable(),
      })
      .nullable(),
    lastError: z.string().nullable(),
  })
  .meta({ ref: 'StudioCiSetup' });

const ReportBody = z.object({
  appId: z.string().regex(APP_ID),
  sha: z.string().min(7).max(64),
  repository: z.string().optional(),
  state: z.enum(['queued', 'building', 'failed', 'succeeded']),
  logsUrl: z.string().optional(),
  message: z.string().max(2000).optional(),
});
const TicketBody = z.object({
  appId: z.string().regex(APP_ID),
  sha: z.string().min(7).max(64),
  repository: z.string().optional(),
});
const RevealBody = z.object({ reveal: z.boolean().optional() });
const ResourceParams = z.object({ resourceId: z.string() });
const BuildParams = z.object({ buildId: z.string() });

const buildOf = (row: Row) => ({
  id: str(row.id),
  appId: str(row.appId),
  sha: str(row.sha),
  state: BuildSchema.shape.state.parse(str(row.state)),
  logsUrl: strOrNull(row.logsUrl),
  message: strOrNull(row.message),
  releaseId: strOrNull(row.releaseId),
  uploadedAt: row.uploadedAt
    ? new Date(row.uploadedAt as string | Date).toISOString()
    : null,
  reportedAt: new Date(row.reportedAt as string | Date).toISOString(),
  updatedAt: new Date(row.updatedAt as string | Date).toISOString(),
});

const hashOf = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

/** The CI file a repository starts from: build, then upload the archive to Studio with a one-time ticket. */
function workflowOf(input: {
  readonly appId: string;
  readonly branch: string;
  readonly apiBase: string;
}): { readonly path: string; readonly content: string } {
  const { apiBase, appId, branch } = input;
  return {
    path: `.github/workflows/ds-studio-${appId}.yml`,
    content: `name: Dương Sinh Studio ${appId}
on:
  push:
    branches: [${branch}]
jobs:
  build:
    runs-on: ubuntu-latest
    env:
      API: ${apiBase}
      KEY: \${{ secrets.${CI_SECRET} }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
      - uses: pnpm/action-setup@v4
      - run: pnpm install --frozen-lockfile
      - run: pnpm build --target linux-x64 --node-version 24
      - run: tar -czf dist.tar.gz dist config.example.yml
      - name: Upload the build to Studio
        run: |
          ticket=$(curl -fsS -X POST "$API/builds/uploadTickets" -H "x-api-key: $KEY" -H 'content-type: application/json' \\
            -d "{\\"appId\\":\\"${appId}\\",\\"sha\\":\\"$GITHUB_SHA\\",\\"repository\\":\\"$GITHUB_REPOSITORY\\"}")
          url=$(echo "$ticket" | jq -er .data.url)
          token=$(echo "$ticket" | jq -er .data.token)
          curl -fsS -X POST "$url" -H "authorization: Bearer $token" -H 'content-type: application/gzip' --data-binary @dist.tar.gz
`,
  };
}

/**
 * Builds of a repository's Apps, as far as Studio keeps them (the demo's `repositoryDeployments`, `builds` and
 * `releaseDownloads`): CI reports and uploads, Studio stores each release through the releases plugin and links it for
 * download. The App Host is off, so nothing here runs an App: `builds/deploy` says so (`docs/chenh-lech-upstream.md`).
 */
export const buildRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const root = new Hono();
    const deployments = new Hono<Env>();
    const builds = new Hono<Env>();
    const releaseRoutes = new Hono<Env>();
    const downloads = new Hono();
    const uploads = new Hono();
    const { container } = app;
    const auth = container.resolve(authenticationToken);
    const authz = container.resolve(authorizationToken);
    const git = () => container.resolve(gitServiceToken);
    const projects = () => container.resolve(projectsToken);
    const rel = () => container.resolve(releasesToken);
    const repositoryApps = () => container.resolve(releaseServiceToken);
    const keys = () => container.resolve(scopedApiKeysToken);
    const conn = () => container.resolve(databaseManagerToken).connection();

    const viewerOf = async (context: Ctx): Promise<Viewer> => {
      const session = context.get('auth');
      if (!session)
        throw fail('PERMISSION_DENIED', 'ACCESS_DENIED', 'Sign in first.');
      return {
        userId: session.user.id,
        actor: { type: 'user', id: session.user.id },
        permissions: await container
          .resolve(projectsAccessToken)
          .permissionsOf(context.get('authz').identity),
      };
    };

    const callerOf = (context: Ctx) =>
      rel().callerOf(context.get('authz').identity);

    const isAdmin = async (context: Ctx): Promise<boolean> => {
      const access = context.get('authz');
      if ((await access.snapshot()).unrestricted) return true;
      for (const [id, action] of [
        ['rel.environments', 'manage'],
        ['pm.members', 'define-roles'],
      ] as const)
        if (await access.can({ resource: { type: 'settings', id }, action }))
          return true;
      return false;
    };

    /** A repository of a project the caller sees, or not found. */
    const seenRepository = async (
      context: Ctx,
      id: string,
    ): Promise<GitRepositoryView> => {
      const viewer = await viewerOf(context);
      const repository = (await git().listRepositories()).find(
        (item) => item.id === id,
      );
      let seen = false;
      for (const link of repository?.projects ?? []) {
        const access = await projects().projects.accessTo(viewer, {
          projectId: link.projectId,
        });
        seen ||= access?.visible === true;
      }
      if (!repository || !seen)
        throw fail('NOT_FOUND', 'REPOSITORY_NOT_FOUND', 'No such repository.');
      return repository;
    };

    const managesRepository = async (
      context: Ctx,
      repository: GitRepositoryView,
    ): Promise<boolean> => {
      if (await isAdmin(context)) return true;
      const viewer = await viewerOf(context);
      for (const link of repository.projects) {
        const access = await projects().projects.accessTo(viewer, {
          projectId: link.projectId,
        });
        if (access?.manage === true) return true;
      }
      return false;
    };

    const requireManager = async (
      context: Ctx,
      repository: GitRepositoryView,
    ): Promise<void> => {
      if (!(await managesRepository(context, repository)))
        throw fail(
          'PERMISSION_DENIED',
          'ACCESS_DENIED',
          'A manager of the project changes this.',
        );
    };

    /** The Apps really linked to a repository; the release service also names one for each environment left unset. */
    const linkedApps = async (repositoryId: string) => {
      const rows: Row[] = await conn()
        .query.selectFrom('dsRepositoryApps')
        .select(['environmentKey', 'appId'])
        .where('repositoryId', '=', repositoryId)
        .execute();
      return rows.map((row) => ({
        environmentKey: str(row.environmentKey),
        appId: str(row.appId),
      }));
    };

    const deploymentOf = async (
      context: Ctx,
      repository: GitRepositoryView,
    ) => {
      const linked = await linkedApps(repository.id);
      return {
        resourceId: repository.id,
        projectId: repository.projects[0]?.projectId ?? null,
        apps: linked.map((item) => ({
          appId: item.appId,
          role: ROLES.find((role) => role === item.environmentKey) ?? null,
          name: item.appId,
          environmentId: item.environmentKey,
        })),
        repo: repository.repo,
        defaultBranch: repository.defaultBranch,
        canEdit: await managesRepository(context, repository),
      };
    };

    /**
     * The base of this API from outside. The router sees paths without the deployment's base path, so a request's own
     * URL would lose it; the configured public base has it.
     */
    const apiBaseOf = (context: Ctx): string => {
      const base = publicBaseUrlOf(app);
      return `${base ?? new URL(context.req.url).origin}/api`;
    };

    const ciKeyRow = async (repositoryId: string): Promise<Row | undefined> =>
      conn()
        .query.selectFrom(CI_KEYS)
        .selectAll()
        .where('repositoryId', '=', repositoryId)
        .executeTakeFirst();

    const ciOf = async (repositoryId: string) => {
      const row = await ciKeyRow(repositoryId);
      const own = row
        ? (await keys().list(ORGANIZATION_KEYS_USER)).find(
            (key) => key.id === str(row.keyId),
          )
        : undefined;
      return {
        secretName: CI_SECRET,
        key: own
          ? { id: own.id, start: own.start, expiresAt: own.expiresAt }
          : null,
        lastError: row ? strOrNull(row.lastError) : null,
      };
    };

    /** Who may report a build: whoever may upload to the App (a CI key's scope included). */
    const requireUpload = async (
      context: Ctx,
      appId: string,
    ): Promise<void> => {
      const caller = await callerOf(context);
      // `getApp` answers the App with its environment and what the caller may do; the guard judges the App itself, and a
      // key limited to some Apps compares its list with the App's id.
      const view = await rel().releases.getApp(caller, appId);
      await rel().guard.requireApp(caller, 'upload', view.app);
    };

    const repositoryNamed = async (
      name: string | undefined,
    ): Promise<GitRepositoryView | undefined> =>
      name
        ? (await git().listRepositories()).find((item) => item.repo === name)
        : undefined;

    const upsertBuild = async (input: {
      readonly appId: string;
      readonly sha: string;
      readonly repositoryId: string | null;
      readonly state: string;
      readonly logsUrl?: string | undefined;
      readonly message?: string | undefined;
    }): Promise<Row> => {
      const now = new Date();
      const existing: Row | undefined = await conn()
        .query.selectFrom(BUILDS)
        .select(['id'])
        .where('appId', '=', input.appId)
        .where('sha', '=', input.sha)
        .executeTakeFirst();
      const id = existing ? str(existing.id) : randomUUID();
      if (existing)
        await conn()
          .query.updateTable(BUILDS)
          .set({
            state: input.state,
            ...(input.repositoryId ? { repositoryId: input.repositoryId } : {}),
            ...(input.logsUrl ? { logsUrl: input.logsUrl } : {}),
            ...(input.message ? { message: input.message } : {}),
            reportedAt: now,
            updatedAt: now,
          })
          .where('id', '=', id)
          .execute();
      else
        await conn()
          .query.insertInto(BUILDS)
          .values({
            id,
            appId: input.appId,
            sha: input.sha,
            repositoryId: input.repositoryId,
            state: input.state,
            logsUrl: input.logsUrl ?? null,
            message: input.message ?? null,
            reportedAt: now,
            updatedAt: now,
          })
          .execute();
      const row: Row | undefined = await conn()
        .query.selectFrom(BUILDS)
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();
      if (!row) throw new Error('A build just written is there.');
      return row;
    };

    for (const path of ['/', '/*']) {
      deployments.use(path, auth.required(), authz.middleware());
      builds.use(path, auth.required({ scopedKeys: true }), authz.middleware());
      releaseRoutes.use(path, auth.required(), authz.middleware());
    }

    deployments.get(
      '/',
      describeRoute({
        tags: ['Studio'],
        summary: 'The repositories that build an App',
        description:
          'For whoever is signed in: the repositories that link the App `appId`, among the projects the caller may see.',
        operationId: 'repositoryDeploymentsList',
        ...cliRoute({ command: 'build repo list' }),
        responses: {
          200: listResponse(DeploymentSchema),
          ...apiErrorResponses,
        },
      }),
      apiValidator('query', z.object({ appId: z.string().min(1) })),
      async (context) => {
        const { appId } = context.req.valid('query');
        const rows: Row[] = await conn()
          .query.selectFrom('dsRepositoryApps')
          .select(['repositoryId'])
          .where('appId', '=', appId)
          .execute();
        const data = [];
        for (const row of rows) {
          try {
            data.push(
              await deploymentOf(
                context,
                await seenRepository(context, str(row.repositoryId)),
              ),
            );
          } catch (error) {
            if (!(error instanceof ApiError)) throw error;
          }
        }
        return context.json({ data, meta: { total: data.length } });
      },
    );

    deployments.get(
      '/apps/:appId/usage',
      describeRoute({
        tags: ['Studio'],
        summary: 'What deleting an App stops',
        operationId: 'repositoryDeploymentsUsage',
        ...cliRoute(false),
        responses: {
          200: dataResponse(
            z.object({
              repositories: z.array(
                z.object({
                  resourceId: z.string(),
                  repo: z.string(),
                  role: z.string(),
                }),
              ),
            }),
          ),
          ...apiErrorResponses,
        },
      }),
      async (context) => {
        const appId = context.req.param('appId');
        const rows: Row[] = await conn()
          .query.selectFrom('dsRepositoryApps')
          .select(['repositoryId', 'environmentKey'])
          .where('appId', '=', appId)
          .execute();
        const repositories = [];
        for (const row of rows) {
          try {
            const repository = await seenRepository(
              context,
              str(row.repositoryId),
            );
            repositories.push({
              resourceId: repository.id,
              repo: repository.repo,
              role: str(row.environmentKey),
            });
          } catch (error) {
            if (!(error instanceof ApiError)) throw error;
          }
        }
        return context.json({ data: { repositories } });
      },
    );

    deployments.get(
      '/ciWorkflows/environments',
      describeRoute({
        tags: ['Studio'],
        summary: 'The environments CI may build for',
        operationId: 'repositoryDeploymentsEnvironments',
        ...cliRoute({ command: 'build ci environments' }),
        responses: {
          200: listResponse(
            z.object({
              id: z.string(),
              name: z.string(),
              protected: z.boolean(),
            }),
          ),
          ...apiErrorResponses,
        },
      }),
      async (context) => {
        const data = (await repositoryApps().listEnvironments()).map(
          (environment) => ({
            id: environment.key,
            name: environment.name,
            protected: environment.protected,
          }),
        );
        return context.json({ data, meta: { total: data.length } });
      },
    );

    deployments.post(
      '/ciWorkflows/generate',
      describeRoute({
        tags: ['Studio'],
        summary: 'The CI file of one application',
        description:
          'For whoever is signed in. A GitHub Actions workflow that builds on a branch and uploads the archive to Studio. Other hosts and pull request previews are not generated yet.',
        operationId: 'repositoryDeploymentsGenerate',
        ...cliRoute({ command: 'build ci workflows' }),
        responses: {
          200: dataResponse(
            z.array(z.object({ path: z.string(), content: z.string() })),
          ),
          ...apiErrorResponses,
        },
      }),
      apiValidator(
        'json',
        z.object({
          app: z.object({ appId: z.string().regex(APP_ID) }),
          defaultBranch: z.string().min(1).optional(),
          provider: z.literal('github').optional(),
        }),
      ),
      async (context) => {
        const body = context.req.valid('json');
        const data = [
          workflowOf({
            appId: body.app.appId,
            branch: body.defaultBranch ?? 'main',
            apiBase: apiBaseOf(context),
          }),
        ];
        return context.json({ data, meta: { total: data.length, cli: '' } });
      },
    );

    deployments.get(
      '/:resourceId',
      describeRoute({
        tags: ['Studio'],
        summary: 'A repository’s Apps',
        description: 'For whoever sees the project.',
        operationId: 'repositoryDeploymentsGet',
        ...cliRoute({ command: 'build repo get' }),
        responses: {
          200: dataResponse(DeploymentSchema),
          ...apiErrorResponses,
          404: apiErrorResponse(404),
        },
      }),
      apiValidator('param', ResourceParams),
      async (context) =>
        context.json({
          data: await deploymentOf(
            context,
            await seenRepository(
              context,
              context.req.valid('param').resourceId,
            ),
          ),
        }),
    );

    deployments.put(
      '/:resourceId',
      describeRoute({
        tags: ['Studio'],
        summary: 'Set a repository’s Apps',
        description:
          'For whoever manages the project. `apps` is the complete set: a role left out is unlinked. Each App is made in the store when missing, so CI can upload to it; nothing is deployed.',
        operationId: 'repositoryDeploymentsSet',
        ...cliRoute({ command: 'build repo set' }),
        responses: {
          200: dataResponse(DeploymentSchema),
          ...apiErrorResponses,
          404: apiErrorResponse(404),
        },
      }),
      apiValidator('param', ResourceParams),
      apiValidator(
        'json',
        z.object({
          apps: z.array(
            z.object({
              appId: z.string().regex(APP_ID),
              role: z.enum(ROLES),
            }),
          ),
        }),
      ),
      async (context) => {
        const repository = await seenRepository(
          context,
          context.req.valid('param').resourceId,
        );
        await requireManager(context, repository);
        const { apps } = context.req.valid('json');
        const caller = await callerOf(context);
        for (const { appId } of apps)
          await rel()
            .releases.getApp(caller, appId)
            .catch(() =>
              rel().releases.createApp(caller, {
                id: appId,
                name: appId,
                environmentId: EXTERNAL_ENVIRONMENT,
              }),
            );
        await conn()
          .query.deleteFrom('dsRepositoryApps')
          .where('repositoryId', '=', repository.id)
          .execute();
        for (const { appId, role } of apps)
          await repositoryApps().setRepositoryApp(repository.id, {
            environmentKey: role,
            appId,
            url: null,
          });
        return context.json({ data: await deploymentOf(context, repository) });
      },
    );

    deployments.get(
      '/:resourceId/builds',
      describeRoute({
        tags: ['Studio'],
        summary: 'The builds of a repository',
        description:
          'For whoever sees the project: as CI reported them, the most recently reported first.',
        operationId: 'repositoryDeploymentsBuilds',
        ...cliRoute({ command: 'build list' }),
        responses: {
          200: listResponse(BuildSchema),
          ...apiErrorResponses,
          404: apiErrorResponse(404),
        },
      }),
      apiValidator('param', ResourceParams),
      apiValidator(
        'query',
        z.object({
          page: z.coerce.number().int().positive().default(1),
          pageSize: z.coerce.number().int().positive().max(100).default(5),
        }),
      ),
      async (context) => {
        const repository = await seenRepository(
          context,
          context.req.valid('param').resourceId,
        );
        const { page, pageSize } = context.req.valid('query');
        const rows: Row[] = await conn()
          .query.selectFrom(BUILDS)
          .selectAll()
          .where('repositoryId', '=', repository.id)
          .orderBy('reportedAt', 'desc')
          .execute();
        return context.json({
          data: rows.slice((page - 1) * pageSize, page * pageSize).map(buildOf),
          meta: { page, pageSize, total: rows.length },
        });
      },
    );

    deployments.get(
      '/:resourceId/ciWorkflow',
      describeRoute({
        tags: ['Studio'],
        summary: 'The CI file a repository starts from',
        description:
          'For whoever sees the project: one workflow per App linked to the repository.',
        operationId: 'repositoryDeploymentsWorkflow',
        ...cliRoute({ command: 'build workflow' }),
        responses: {
          200: dataResponse(
            z.object({
              files: z.array(
                z.object({ path: z.string(), content: z.string() }),
              ),
              secret: z.string(),
            }),
          ),
          ...apiErrorResponses,
          404: apiErrorResponse(404),
        },
      }),
      apiValidator('param', ResourceParams),
      async (context) => {
        const repository = await seenRepository(
          context,
          context.req.valid('param').resourceId,
        );
        const linked = await linkedApps(repository.id);
        return context.json({
          data: {
            files: linked.map((item) =>
              workflowOf({
                appId: item.appId,
                branch: repository.defaultBranch,
                apiBase: apiBaseOf(context),
              }),
            ),
            secret: CI_SECRET,
          },
        });
      },
    );

    deployments.get(
      '/:resourceId/ci',
      describeRoute({
        tags: ['Studio'],
        summary: 'The API key a repository’s CI uses',
        description: 'For whoever sees the project. Never the secret.',
        operationId: 'repositoryDeploymentsCi',
        ...cliRoute({ command: 'build ci get' }),
        responses: {
          200: dataResponse(CiSchema),
          ...apiErrorResponses,
          404: apiErrorResponse(404),
        },
      }),
      apiValidator('param', ResourceParams),
      async (context) => {
        const repository = await seenRepository(
          context,
          context.req.valid('param').resourceId,
        );
        return context.json({ data: await ciOf(repository.id) });
      },
    );

    deployments.get(
      '/:resourceId/ci/connection',
      describeRoute({
        tags: ['Studio'],
        summary: 'What CI reported for a repository',
        description:
          'For whoever sees the project: each App CI reported with its last build, and the key Studio keeps for its CI.',
        operationId: 'repositoryDeploymentsConnection',
        ...cliRoute({ command: 'build ci connection' }),
        responses: {
          200: dataResponse(
            z.object({
              apps: z.array(
                z.object({ appId: z.string(), lastBuild: BuildSchema }),
              ),
              key: CiSchema,
            }),
          ),
          ...apiErrorResponses,
          404: apiErrorResponse(404),
        },
      }),
      apiValidator('param', ResourceParams),
      async (context) => {
        const repository = await seenRepository(
          context,
          context.req.valid('param').resourceId,
        );
        const rows: Row[] = await conn()
          .query.selectFrom(BUILDS)
          .selectAll()
          .where('repositoryId', '=', repository.id)
          .orderBy('reportedAt', 'desc')
          .execute();
        const latest = new Map<string, Row>();
        for (const row of rows)
          if (!latest.has(str(row.appId))) latest.set(str(row.appId), row);
        return context.json({
          data: {
            apps: [...latest].map(([appId, row]) => ({
              appId,
              lastBuild: buildOf(row),
            })),
            key: await ciOf(repository.id),
          },
        });
      },
    );

    /** Makes the repository's CI key, or gives the one it has a new secret; the secret is answered this once. */
    const issueCiKey = async (
      context: Ctx,
      repository: GitRepositoryView,
      reveal: boolean | undefined,
    ) => {
      await requireManager(context, repository);
      if (reveal !== true)
        throw fail(
          'INVALID_ARGUMENT',
          'REVEAL_REQUIRED',
          '`reveal: true` is required: the secret is answered once.',
        );
      // The key reaches the Apps of this repository and no other: a key leaked from repository A must not upload to,
      // deploy or stop the production App of repository B.
      const appIds = [
        ...new Set((await linkedApps(repository.id)).map((app) => app.appId)),
      ].sort();
      if (appIds.length === 0)
        throw fail(
          'FAILED_PRECONDITION',
          'NO_APP_LINKED',
          'Link an App to this repository first: its CI key reaches only the Apps of the repository.',
        );
      const scope = {
        groups: {
          'releases.apps': { level: 'write', objects: appIds },
          'studio.checks': { level: 'write' },
        },
      } as const;
      const existing = await ciKeyRow(repository.id);
      const live = existing
        ? (await keys().list(ORGANIZATION_KEYS_USER)).find(
            (key) => key.id === str(existing.keyId),
          )
        : undefined;
      // Rotation keeps a key's scope and lifetime, so it fits only a key that is already limited to exactly these Apps
      // and lives at most 90 days; an older key (every App, a year) is replaced instead.
      const granted: 'all' | readonly string[] | undefined =
        live?.scope?.groups['releases.apps']?.objects;
      const sameApps =
        granted !== undefined &&
        granted !== 'all' &&
        JSON.stringify([...granted].sort()) === JSON.stringify(appIds);
      const shortLived =
        live?.expiresAt != null &&
        Date.parse(live.expiresAt) - Date.now() <=
          CI_KEY_DAYS * DAY_MS + 60_000;
      if (live && sameApps && shortLived) {
        const rotated = await keys().rotate(ORGANIZATION_KEYS_USER, live.id);
        return { secret: rotated.secret, setup: await ciOf(repository.id) };
      }
      const created = await keys().create(
        ORGANIZATION_KEYS_USER,
        {
          name: `CI ${repository.repo}`,
          description: null,
          expiresInDays: CI_KEY_DAYS,
          scope,
        },
        context.get('authz').identity,
      );
      if (existing)
        await conn()
          .query.deleteFrom(CI_KEYS)
          .where('repositoryId', '=', repository.id)
          .execute();
      await conn()
        .query.insertInto(CI_KEYS)
        .values({
          repositoryId: repository.id,
          keyId: created.key.id,
          createdAt: new Date(),
        })
        .execute();
      // The old key stops working only after the new one is in place.
      if (live) await keys().revoke(ORGANIZATION_KEYS_USER, live.id);
      return { secret: created.secret, setup: await ciOf(repository.id) };
    };

    for (const [path, operationId, summary, command] of [
      [
        '/:resourceId/ci/setup',
        'repositoryDeploymentsCiSetup',
        'Make the API key a repository’s CI uses',
        'build ci setup',
      ],
      [
        '/:resourceId/ci/rotate',
        'repositoryDeploymentsCiRotate',
        'Give a repository’s CI key a new secret',
        'build ci rotate',
      ],
    ] as const)
      deployments.post(
        path,
        describeRoute({
          tags: ['Studio'],
          summary,
          description: `For whoever manages the project. \`reveal: true\` is required: the secret is answered once. Store it as the CI secret \`${CI_SECRET}\`; Studio never writes it to the repository nor shows it again.`,
          operationId,
          ...cliRoute({ command }),
          responses: {
            200: dataResponse(
              z.object({ secret: z.string(), setup: CiSchema }),
            ),
            ...apiErrorResponses,
            404: apiErrorResponse(404),
          },
        }),
        apiValidator('param', ResourceParams),
        apiValidator('json', RevealBody),
        async (context) => {
          const repository = await seenRepository(
            context,
            context.req.valid('param').resourceId,
          );
          return context.json({
            data: await issueCiKey(
              context,
              repository,
              context.req.valid('json').reveal,
            ),
          });
        },
      );

    deployments.delete(
      '/:resourceId/ci/apps/:appId',
      describeRoute({
        tags: ['Studio'],
        summary: 'Take an App off a repository’s list',
        description:
          'For whoever manages the project. The App itself stays; CI’s next report brings it back.',
        operationId: 'repositoryDeploymentsCiRemove',
        ...cliRoute({ command: 'build ci remove' }),
        responses: {
          204: { description: 'Removed.' },
          ...apiErrorResponses,
          404: apiErrorResponse(404),
        },
      }),
      apiValidator('param', ResourceParams.extend({ appId: z.string() })),
      async (context) => {
        const { resourceId, appId } = context.req.valid('param');
        const repository = await seenRepository(context, resourceId);
        await requireManager(context, repository);
        await conn()
          .query.deleteFrom('dsRepositoryApps')
          .where('repositoryId', '=', repository.id)
          .where('appId', '=', appId)
          .execute();
        return context.body(null, 204);
      },
    );

    builds.post(
      '/report',
      describeRoute({
        tags: ['Studio'],
        summary: 'Report a build’s progress',
        description:
          'Optional, for showing a build’s progress. Requires the `upload` action on the App, which a repository’s CI key holds.',
        operationId: 'buildsReport',
        security: [{ apiKeyAuth: [] }, { cookieAuth: [] }],
        ...cliRoute({ command: 'build status' }),
        responses: {
          200: dataResponse(BuildSchema),
          ...apiErrorResponses,
          404: apiErrorResponse(404),
        },
      }),
      apiValidator('json', ReportBody),
      async (context) => {
        const body = context.req.valid('json');
        await requireUpload(context, body.appId);
        const repository = await repositoryNamed(body.repository);
        return context.json({
          data: buildOf(
            await upsertBuild({
              appId: body.appId,
              sha: body.sha,
              repositoryId: repository?.id ?? null,
              state: body.state,
              logsUrl: body.logsUrl,
              message: body.message,
            }),
          ),
        });
      },
    );

    builds.post(
      '/apps/:appId/ensure',
      describeRoute({
        tags: ['Studio'],
        summary: 'Make an App when it is missing',
        description:
          'Idempotent. Makes the App in Studio’s build store, for uploads; it is not run. Takes a credential that may create Apps when the App is missing.',
        operationId: 'buildsEnsureApp',
        security: [{ apiKeyAuth: [] }, { cookieAuth: [] }],
        ...cliRoute({ command: 'app ensure' }),
        responses: {
          200: dataResponse(
            z.object({ appId: z.string(), created: z.boolean() }),
          ),
          ...apiErrorResponses,
        },
      }),
      apiValidator('param', z.object({ appId: z.string().regex(APP_ID) })),
      async (context) => {
        const { appId } = context.req.valid('param');
        const caller = await callerOf(context);
        const found = await rel()
          .releases.getApp(caller, appId)
          .catch(() => null);
        if (found) return context.json({ data: { appId, created: false } });
        rel().guard.requireCreate(caller);
        await rel().releases.createApp(caller, {
          id: appId,
          name: appId,
          environmentId: EXTERNAL_ENVIRONMENT,
        });
        return context.json({ data: { appId, created: true } });
      },
    );

    builds.post(
      '/uploadTickets',
      describeRoute({
        tags: ['Studio'],
        summary: 'A one-time ticket to upload a build',
        description:
          'Requires the `upload` action on the App. Send the archive as the body of a POST to `url` with `Authorization: Bearer <token>` and nothing of the session. The upload answers the release; nothing is deployed.',
        operationId: 'buildsUploadTicket',
        security: [{ apiKeyAuth: [] }, { cookieAuth: [] }],
        ...cliRoute({ command: 'release upload' }),
        responses: {
          200: dataResponse(
            z.object({
              buildId: z.string(),
              method: z.literal('POST'),
              url: z.string(),
              token: z.string(),
              expiresAt: z.string(),
            }),
          ),
          ...apiErrorResponses,
          404: apiErrorResponse(404),
        },
      }),
      apiValidator('json', TicketBody),
      async (context) => {
        const body = context.req.valid('json');
        await requireUpload(context, body.appId);
        const caller = await callerOf(context);
        const ticket = await rel().tickets.create(caller, body.appId, {
          deploy: false,
        });
        const repository = await repositoryNamed(body.repository);
        const build = await upsertBuild({
          appId: body.appId,
          sha: body.sha,
          repositoryId: repository?.id ?? null,
          state: 'building',
        });
        return context.json({
          data: {
            buildId: str(build.id),
            method: 'POST' as const,
            url: `${apiBaseOf(context)}/builds/${str(build.id)}/uploadArtifact`,
            token: ticket.token,
            expiresAt: ticket.expiresAt,
          },
        });
      },
    );

    builds.post(
      '/deploy',
      describeRoute({
        tags: ['Studio'],
        summary: 'Deploy a build',
        description: `Answers 400 \`APP_HOST_OFF\`. ${NOT_RUNNING}`,
        operationId: 'buildsDeploy',
        security: [{ apiKeyAuth: [] }, { cookieAuth: [] }, { runToken: [] }],
        ...cliRoute({ command: 'deploy' }),
        responses: {
          200: dataResponse(z.unknown()),
          ...apiErrorResponses,
        },
      }),
      () => {
        throw fail('FAILED_PRECONDITION', 'APP_HOST_OFF', NOT_RUNNING);
      },
    );

    uploads.post(
      '/:buildId/uploadArtifact',
      describeRoute({
        tags: ['Studio'],
        summary: 'Upload a build’s archive',
        description:
          'No session or API key is read: the credential is the one-time ticket `POST /api/builds/uploadTickets` answered for this build, as `Authorization: Bearer`. The archive becomes a release of the build’s App, not deployed.',
        operationId: 'buildsUploadArtifact',
        security: [],
        ...cliRoute(false),
        responses: {
          200: dataResponse(
            z.object({ build: BuildSchema, releaseId: z.string() }),
          ),
          ...apiErrorResponses,
          404: apiErrorResponse(404),
        },
      }),
      apiValidator('param', BuildParams),
      async (context) => {
        const { buildId } = context.req.valid('param');
        const row: Row | undefined = await conn()
          .query.selectFrom(BUILDS)
          .selectAll()
          .where('id', '=', buildId)
          .executeTakeFirst();
        if (!row) throw fail('NOT_FOUND', 'BUILD_NOT_FOUND', 'No such build.');
        const appId = str(row.appId);
        const bearer = /^Bearer\s+(.+)$/iu.exec(
          context.req.header('authorization') ?? '',
        )?.[1];
        if (!bearer)
          throw new ApiError({
            status: 'UNAUTHENTICATED',
            reason: 'UPLOAD_TICKET_REQUIRED',
            domain: DOMAIN,
            message: 'Send the upload ticket as a bearer token.',
          });
        const body = context.req.raw.body;
        if (!body)
          throw fail(
            'INVALID_ARGUMENT',
            'ARCHIVE_REQUIRED',
            'Send the archive.',
          );
        const ticket = await rel().tickets.consume(bearer, appId);
        const release = await rel().releases.uploadRelease(
          ticket.caller,
          appId,
          {
            stream: body,
            sourceCommit: str(row.sha),
            build: buildId,
          },
        );
        await rel().tickets.recordRelease(ticket.ticketId, release.id);
        const now = new Date();
        await conn()
          .query.updateTable(BUILDS)
          .set({
            state: 'succeeded',
            releaseId: release.id,
            uploadedAt: now,
            updatedAt: now,
          })
          .where('id', '=', buildId)
          .execute();
        const updated: Row | undefined = await conn()
          .query.selectFrom(BUILDS)
          .selectAll()
          .where('id', '=', buildId)
          .executeTakeFirst();
        return context.json({
          data: { build: buildOf(updated ?? row), releaseId: release.id },
        });
      },
    );

    /** A release by its id alone, for the App it belongs to; the plugin checks the caller may view it. */
    const releaseOf = async (context: Ctx, releaseId: string) => {
      const row: Row | undefined = await conn()
        .query.selectFrom('relReleases')
        .select(['appId'])
        .where('id', '=', releaseId)
        .executeTakeFirst();
      if (!row)
        throw fail('NOT_FOUND', 'RELEASE_NOT_FOUND', 'No such release.');
      const appId = str(row.appId);
      return {
        appId,
        release: await rel().releases.getRelease(
          await callerOf(context),
          appId,
          releaseId,
        ),
      };
    };

    releaseRoutes.get(
      '/:releaseId',
      describeRoute({
        tags: ['Studio'],
        summary: 'A build stored in Studio',
        description:
          'A release of an App the caller may view. `canDownload` says whether they may make a download link.',
        operationId: 'studioReleaseDetail',
        ...cliRoute({ command: 'release show' }),
        responses: {
          200: dataResponse(z.record(z.string(), z.unknown())),
          ...apiErrorResponses,
          404: apiErrorResponse(404),
        },
      }),
      async (context) => {
        const { appId, release } = await releaseOf(
          context,
          context.req.param('releaseId'),
        );
        return context.json({
          data: {
            ...release,
            appId,
            canDownload: (await context.get('authz').snapshot()).unrestricted,
          },
        });
      },
    );

    releaseRoutes.post(
      '/:releaseId/downloadLink',
      describeRoute({
        tags: ['Studio'],
        summary: 'A link to a build’s archive',
        description: `A link that works for ${LINK_HOURS} hours without a session or an API key, for the server it is installed on. The owner in person, who records what runs on production.`,
        operationId: 'studioReleaseDownloadLink',
        ...cliRoute({ command: 'release download-link' }),
        responses: {
          200: dataResponse(
            z.object({
              url: z.string(),
              fileName: z.string(),
              expiresAt: z.string(),
            }),
          ),
          ...apiErrorResponses,
          404: apiErrorResponse(404),
        },
      }),
      async (context) => {
        const session = context.get('auth');
        if (!session || !(await context.get('authz').snapshot()).unrestricted)
          throw fail(
            'PERMISSION_DENIED',
            'ACCESS_DENIED',
            'The owner makes download links.',
          );
        const { appId, release } = await releaseOf(
          context,
          context.req.param('releaseId'),
        );
        const token = randomBytes(32).toString('base64url');
        const now = new Date();
        const expiresAt = new Date(now.getTime() + LINK_HOURS * 3_600_000);
        await conn()
          .query.insertInto(DOWNLOADS)
          .values({
            tokenHash: hashOf(token),
            appId,
            releaseId: release.id,
            createdById: session.user.id,
            expiresAt,
            createdAt: now,
          })
          .execute();
        return context.json({
          data: {
            url: `${apiBaseOf(context)}/releaseDownloads/${token}`,
            fileName: `${appId}-${release.version}.tar.gz`,
            expiresAt: expiresAt.toISOString(),
          },
        });
      },
    );

    downloads.get(
      '/:token',
      describeRoute({
        tags: ['Studio'],
        summary: 'Download a build by its link',
        description:
          'Without a session or an API key, until the link expires. An unknown or expired link answers 404 `DOWNLOAD_LINK_NOT_FOUND`.',
        operationId: 'studioReleaseDownload',
        security: [],
        ...cliRoute(false),
        responses: {
          200: { description: 'The archive.' },
          404: apiErrorResponse(404),
        },
      }),
      async (context) => {
        const row: Row | undefined = await conn()
          .query.selectFrom(DOWNLOADS)
          .selectAll()
          .where('tokenHash', '=', hashOf(context.req.param('token')))
          .executeTakeFirst();
        if (
          !row ||
          new Date(row.expiresAt as string | Date).getTime() <= Date.now()
        )
          throw fail(
            'NOT_FOUND',
            'DOWNLOAD_LINK_NOT_FOUND',
            'No such link, or it expired.',
          );
        const archive = await rel().releases.openArchive(
          rel().system,
          str(row.appId),
          str(row.releaseId),
        );
        return new Response(Readable.toWeb(archive.stream), {
          headers: {
            'content-type': 'application/gzip',
            'content-disposition': `attachment; filename="${archive.fileName}"`,
            ...(archive.size === null
              ? {}
              : { 'content-length': String(archive.size) }),
          },
        });
      },
    );

    root.route('/repositoryDeployments', deployments);
    root.route('/builds', uploads);
    root.route('/builds', builds);
    root.route('/deploys/releases', releaseRoutes);
    root.route('/releaseDownloads', downloads);
    return root;
  });
