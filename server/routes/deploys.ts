import {
  authenticationToken,
  isServiceAccount,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization';
import {
  DomainError,
  projectsAccessToken,
  projectsToken,
  type Projects,
  type Viewer,
} from '@nocobase/app-plugin-projects/server/tokens';
import type { Issue } from '@nocobase/app-plugin-projects/shared/issues';
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
import { GitError, type GitRepositoryView } from '../git/service.js';
import { gitServiceToken } from '../providers/git.js';
import { releaseServiceToken } from '../providers/releases.js';
import { ReleaseError, type IssueMark } from '../releases/service.js';
import {
  agentsToken,
  runIdentityOf,
} from '@nocobase/app-plugin-agents/server/tokens';
import { PREVIEWS_MANAGE_ACTION } from '../agents/actions.js';
import { ISSUE_SUBJECT } from '../agents/ids.js';
import { DokployError, DokployRefused } from '../previews/dokploy.js';
import { PreviewError } from '../previews/service.js';
import { previewServiceToken } from '../providers/previews.js';

type Env = AuthEnv & AuthorizationEnv;

const DOMAIN = 'studio';
const PERSON_OR_RUN: Record<string, string[]>[] = [
  { cookieAuth: [] },
  { apiKeyAuth: [] },
  { runToken: [] },
];
const PERSON: Record<string, string[]>[] = [
  { cookieAuth: [] },
  { apiKeyAuth: [] },
];
/** What an agent needs to read where versions are (`rel.apps/view`, on by default). */
const VIEW_ACTION = 'rel.apps/view';

const EnvironmentSchema = z
  .object({
    key: z.string(),
    name: z.string(),
    purpose: z
      .string()
      .meta({ description: '`preview`, `test` or `production`.' }),
    runsOn: z
      .string()
      .meta({ description: '`external`: outside Studio (the VPS, Dokploy).' }),
    recordOnly: z.boolean().meta({
      description: 'Studio records what runs there; it deploys nothing.',
    }),
    protected: z.boolean(),
    approvers: z.array(z.string()),
    maxApps: z.number().int().nullable(),
    idleStopMinutes: z.number().int().nullable(),
    removeOnClose: z.boolean(),
    publicUrlPattern: z.string().nullable(),
    description: z.string().nullable(),
    position: z.number().int(),
  })
  .meta({ ref: 'StudioEnvironment' });

const ReleaseLineSchema = z
  .object({
    repositoryId: z.string(),
    lineKey: z.string(),
    branch: z.string(),
    pattern: z
      .string()
      .meta({ description: 'Which tags are versions, such as `v*`.' }),
    stripPrefix: z.string().nullable(),
    syncedAt: z.string().nullable(),
    syncError: z.string().nullable(),
  })
  .meta({ ref: 'StudioReleaseLine' });

const RepositoryAppSchema = z
  .object({
    environmentKey: z.string(),
    appId: z.string(),
    url: z.string().nullable(),
  })
  .meta({ ref: 'StudioRepositoryApp' });

const VersionSchema = z
  .object({
    id: z.string(),
    repositoryId: z.string(),
    repo: z.string(),
    lineKey: z.string(),
    tag: z.string(),
    version: z.string(),
    sha: z.string(),
    committedAt: z.string().nullable(),
    previousVersionId: z.string().nullable(),
    taskCount: z.number().int(),
    issueIds: z.array(z.string()),
    discoveredAt: z.string(),
    deleted: z.boolean().meta({
      description:
        'The tag is gone from the repository; the version is kept with its marks.',
    }),
    current: z.object({ staging: z.boolean(), production: z.boolean() }),
    reached: z.object({ staging: z.boolean(), production: z.boolean() }),
  })
  .meta({ ref: 'StudioVersion' });

const IssueRef = z.object({
  id: z.string(),
  identifier: z.string(),
  title: z.string(),
  projectId: z.string().nullable(),
  statusKey: z.string(),
});

const MarkSchema = z
  .object({
    issueId: z.string(),
    where: z.enum(['merged', 'released', 'staging', 'production']),
    repositoryId: z.string(),
    version: z.object({ id: z.string(), tag: z.string() }).nullable(),
    staging: z.object({ tag: z.string(), at: z.string() }).nullable(),
    production: z.object({ tag: z.string(), at: z.string() }).nullable(),
    mergedAt: z.string().nullable(),
    pullRequest: z
      .object({ number: z.number().int(), url: z.string() })
      .nullable(),
    issue: IssueRef.nullable(),
  })
  .meta({ ref: 'StudioIssueDeploymentMark' });

const RecordSchema = z
  .object({
    id: z.string(),
    repositoryId: z.string(),
    versionId: z.string(),
    tag: z.string(),
    environmentKey: z.string(),
    kind: z.enum(['deployed', 'rolledBack']),
    note: z.string(),
    markedById: z.string(),
    requestId: z.string().nullable(),
    createdAt: z.string(),
  })
  .meta({ ref: 'StudioDeploymentRecord' });

const RequestSchema = z
  .object({
    id: z.string(),
    repositoryId: z.string(),
    repo: z.string(),
    versionId: z.string(),
    tag: z.string(),
    environmentKey: z.string(),
    kind: z.enum(['deployed', 'rolledBack']),
    appId: z.string().meta({ description: 'What the approver types again.' }),
    note: z.string(),
    requestedById: z.string(),
    status: z.enum(['pending', 'approved', 'rejected', 'cancelled']),
    decidedById: z.string().nullable(),
    decisionNote: z.string().nullable(),
    createdAt: z.string(),
    decidedAt: z.string().nullable(),
  })
  .meta({ ref: 'StudioDeploymentRequest' });

const HubSchema = z
  .object({
    project: z.object({ id: z.string(), name: z.string() }),
    repositories: z.array(
      z.object({
        id: z.string(),
        repo: z.string(),
        line: ReleaseLineSchema,
        latest: z.object({ id: z.string(), tag: z.string() }).nullable(),
        staging: z.object({ id: z.string(), tag: z.string() }).nullable(),
        production: z.object({ id: z.string(), tag: z.string() }).nullable(),
        pendingCount: z.number().int(),
        versionCount: z.number().int(),
      }),
    ),
  })
  .meta({ ref: 'StudioReleaseProject' });

const AttentionSchema = z
  .object({
    count: z.number().int(),
    reasons: z.array(
      z.object({
        reason: z.string(),
        count: z.number().int(),
        path: z.string(),
      }),
    ),
  })
  .meta({ ref: 'StudioAttention' });

const RepositoryParams = z.object({ repositoryId: z.string() });
const VersionParams = z.object({ versionId: z.string() });
const RequestParams = z.object({ requestId: z.string() });
const ProjectQuery = z.object({
  projectId: z.string().optional(),
  repositoryId: z.string().optional(),
});
const MarksQuery = z.object({
  issueIds: z
    .string()
    .min(1)
    .max(4000)
    .meta({ description: 'Issue ids, comma-separated (at most 200).' }),
});
const RequestsQuery = z.object({
  status: z.enum(['pending', 'approved', 'rejected', 'cancelled']).optional(),
  awaitingMe: z.enum(['true', 'false']).optional(),
});
const LineBody = z
  .object({
    branch: z.string().trim().min(1).max(255).optional(),
    pattern: z.string().trim().min(1).max(100).optional(),
    stripPrefix: z.string().trim().max(32).nullable().optional(),
  })
  .strict();
const AppBody = z
  .object({
    appId: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .regex(/^[\w.-]+$/u),
    url: z.url().nullable().optional(),
  })
  .strict();
const MarkBody = z
  .object({
    environmentKey: z.enum(['staging', 'production']),
    kind: z.enum(['deployed', 'rolledBack']).default('deployed'),
    note: z.string().trim().min(1).max(2000),
  })
  .strict();
const RequestBody = z
  .object({
    environmentKey: z.enum(['production']).default('production'),
    kind: z.enum(['deployed', 'rolledBack']).default('deployed'),
    note: z.string().trim().min(1).max(2000),
  })
  .strict();
const ApproveBody = z
  .object({
    confirmAppId: z.string().trim().min(1).max(100),
    note: z.string().trim().max(2000).optional(),
  })
  .strict();
const RejectBody = z
  .object({ note: z.string().trim().min(1).max(2000) })
  .strict();

const PreviewSchema = z
  .object({
    id: z.string(),
    slot: z.enum(['preview', 'staging']),
    repositoryId: z.string(),
    pullNumber: z.number().int().nullable(),
    pullRequestId: z.string().nullable(),
    issueId: z.string().nullable(),
    branch: z.string(),
    sha: z.string(),
    runId: z.number().int().nullable(),
    logsUrl: z
      .string()
      .nullable()
      .meta({ description: 'The workflow run that built the plugins.' }),
    status: z.enum([
      'waiting',
      'deploying',
      'ready',
      'stopped',
      'blocked',
      'failed',
      'destroyed',
    ]),
    reason: z.string().nullable().meta({
      description:
        'Why it is blocked, failed or gone (`slotBusy: …`, `resources: …`).',
    }),
    url: z.string().nullable(),
    readyAt: z.string().nullable(),
    lastUsedAt: z.string().nullable(),
    stoppedAt: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .meta({ ref: 'StudioPreview' });
const PreviewCredentialsSchema = z
  .object({
    url: z.string(),
    basicUser: z
      .string()
      .meta({ description: 'The basic auth in front of the pages.' }),
    basicPassword: z.string(),
    account: z.string().meta({
      description: 'The generated root account of the sample NocoBase.',
    }),
    password: z.string(),
  })
  .meta({ ref: 'StudioPreviewCredentials' });
const PreviewParams = z.object({ previewId: z.string() });
const PreviewQuery = z.object({
  projectId: z.string().optional(),
  repositoryId: z.string().optional(),
  issueId: z.string().optional(),
});
const StagingBody = z.object({ repositoryId: z.string().min(1) }).strict();
const ReportBody = z
  .object({
    token: z.string().min(16).max(200),
    status: z.enum(['ready', 'failed']),
    reason: z.string().max(2000).nullable().optional(),
  })
  .strict();

const PageQuery = z.object({
  projectId: z.string().optional(),
  repoId: z.string().optional(),
  q: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(50),
});
const IdParams = z.object({ id: z.string() });
const TaskRow = z
  .object({
    id: z.string(),
    projectId: z.string().nullable(),
    identifier: z.string(),
    title: z.string(),
    statusKey: z.string(),
    where: z.enum(['merged', 'released', 'staging', 'production']),
    merged: z.number(),
    published: z.number(),
    inTest: z.boolean(),
    tested: z.number(),
    pullRequests: z.array(
      z.object({
        number: z.number().int(),
        url: z.string(),
        mergedAt: z.string().nullable(),
      }),
    ),
  })
  .meta({ ref: 'StudioVersionTask' });
const DeploymentRow = z
  .object({
    id: z.string(),
    versionId: z.string().nullable(),
    environmentId: z.string().nullable(),
    appId: z.string(),
    version: z.string(),
    sha: z.string().nullable(),
    note: z.string().nullable(),
    markedBy: z.string().nullable(),
    markedAt: z.string(),
  })
  .meta({ ref: 'StudioVersionDeployment' });
const LineCard = z
  .object({
    repoId: z.string().nullable(),
    resourceId: z.string(),
    name: z.string(),
    webUrl: z.string().nullable(),
    connected: z.boolean(),
    lines: z.array(
      z.object({
        id: z.string(),
        branch: z.string(),
        pattern: z.string(),
        stripPrefix: z.string(),
      }),
    ),
    defaultRef: z.string().nullable(),
    state: z.string(),
    error: z.string().nullable(),
    canManage: z.boolean(),
  })
  .meta({ ref: 'StudioReleaseLineCard' });
const PreviewStatus = z
  .object({
    issueId: z.string(),
    identifier: z.string(),
    previews: z.array(PreviewSchema),
    blocker: z.literal('noRepository').nullable(),
    canEdit: z.boolean(),
  })
  .meta({ ref: 'StudioIssuePreviews' });

const denied = (message: string): ApiError =>
  new ApiError({
    status: 'PERMISSION_DENIED',
    reason: 'ACCESS_DENIED',
    domain: DOMAIN,
    message,
  });
const notFound = (message: string): ApiError =>
  new ApiError({
    status: 'NOT_FOUND',
    reason: 'RELEASE_NOT_FOUND',
    domain: DOMAIN,
    message,
  });

/**
 * Releases (`/api/deploys/*`, `/api/attention`): Dương Sinh's environments, each repository's release line and App ids,
 * versions from tags with the issues they bring, where each issue is, and the marks and requests that say what runs on
 * staging and production. Reading needs sight of a project the repository serves (a run may read with `rel.apps/view`);
 * configuring repositories and marking staging need an administrator in person; marking production is the owner's,
 * directly or by approving a request in the inbox.
 */
export const deployRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono<Env>();
    const attention = new Hono<Env>();
    const { container } = app;
    const auth = container.resolve(authenticationToken);
    const authz = container.resolve(authorizationToken);
    const git = () => container.resolve(gitServiceToken);
    const releases = () => container.resolve(releaseServiceToken);
    const projects = (): Projects => container.resolve(projectsToken);

    const guarded = async <T>(work: () => Promise<T>): Promise<T> => {
      try {
        return await work();
      } catch (error) {
        if (error instanceof ReleaseError || error instanceof GitError)
          throw new ApiError({
            status: error.status,
            reason: error.reason,
            domain: DOMAIN,
            message: error.message,
            metadata: error.params,
            cause: error,
          });
        throw error;
      }
    };

    /** A person acting in person (a session or their own API key, never a run or a service account). */
    const personId = (context: Context<Env>): string => {
      const session = context.get('auth');
      if (!session || session.credential || isServiceAccount(session.user))
        throw denied('Only people do this.');
      return session.user.id;
    };

    const unrestricted = async (context: Context<Env>): Promise<boolean> =>
      (await context.get('authz').snapshot()).unrestricted;

    const holdsSettings = async (
      context: Context<Env>,
      item: string,
      action: string,
    ): Promise<boolean> =>
      (await unrestricted(context)) ||
      (await context
        .get('authz')
        .can({ resource: { type: 'settings', id: item }, action }));

    /** An administrator in person: manages releases settings (`rel.environments` `manage`) or the members. */
    const requireAdmin = async (context: Context<Env>): Promise<string> => {
      const userId = personId(context);
      if (
        !(await holdsSettings(context, 'rel.environments', 'manage')) &&
        !(await holdsSettings(context, 'pm.members', 'define-roles'))
      )
        throw denied('An administrator configures releases and marks staging.');
      return userId;
    };

    /** The owner in person: production is theirs to mark and to approve. */
    const requireOwner = async (context: Context<Env>): Promise<string> => {
      const userId = personId(context);
      if (!(await unrestricted(context)))
        throw denied(
          'Only the owner marks production or decides its requests.',
        );
      return userId;
    };

    /** Whoever may deploy Apps (`rel.apps/deploy`, any level) may ask the owner to mark production. */
    const requireDeployer = async (context: Context<Env>): Promise<string> => {
      const userId = personId(context);
      if (await unrestricted(context)) return userId;
      const authorization = context.get('authz');
      for (const action of ['deploy.all', 'deploy.related'])
        if (
          await authorization.can({
            resource: { type: 'rel', id: 'rel.apps' },
            action,
          })
        )
          return userId;
      throw denied(
        'Asking to mark production needs the deploy action on Apps.',
      );
    };

    const viewerOf = async (context: Context<Env>): Promise<Viewer> => {
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

    /** The repositories the caller sees (through a visible project), with those projects' names. */
    const visible = async (
      context: Context<Env>,
    ): Promise<{
      viewer: Viewer;
      repositories: GitRepositoryView[];
      projectNames: ReadonlyMap<string, { readonly name: string }>;
    }> => {
      const viewer = await viewerOf(context);
      const all = await git().listRepositories();
      const projectIds = [
        ...new Set(
          all.flatMap((repository) =>
            repository.projects.map((link) => link.projectId),
          ),
        ),
      ];
      const projectNames: ReadonlyMap<string, { readonly name: string }> =
        projectIds.length === 0
          ? new Map<string, { name: string }>()
          : await projects().projects.targetNames(
              viewer,
              'project',
              projectIds,
            );
      return {
        viewer,
        repositories: all.filter((repository) =>
          repository.projects.some((link) => projectNames.has(link.projectId)),
        ),
        projectNames,
      };
    };

    const scopedRepositories = async (
      context: Context<Env>,
      filter: { projectId?: string; repositoryId?: string },
    ): Promise<GitRepositoryView[]> => {
      const { repositories } = await visible(context);
      return repositories.filter(
        (repository) =>
          (!filter.repositoryId || repository.id === filter.repositoryId) &&
          (!filter.projectId ||
            repository.projects.some(
              (link) => link.projectId === filter.projectId,
            )),
      );
    };

    const visibleRepository = async (
      context: Context<Env>,
      repositoryId: string,
    ): Promise<GitRepositoryView> => {
      const [repository] = await scopedRepositories(context, { repositoryId });
      if (!repository)
        throw notFound(
          `Repository ${repositoryId} is not linked to a project you see.`,
        );
      return repository;
    };

    const visibleVersion = async (context: Context<Env>, versionId: string) => {
      const { repositories } = await visible(context);
      const found = (
        await releases().listVersions(
          repositories.map((repository) => repository.id),
        )
      ).find((version) => version.id === versionId);
      if (!found) throw notFound(`Version ${versionId} does not exist.`);
      return found;
    };

    const issueOf = async (
      viewer: Viewer,
      issueId: string,
    ): Promise<Issue | null> => {
      try {
        return await projects().issueQueries.visible(viewer, issueId);
      } catch (error) {
        if (error instanceof DomainError) return null;
        throw error;
      }
    };

    /** The marks of issues the viewer sees, with each issue's identifier and title. */
    const withIssues = async (viewer: Viewer, marks: readonly IssueMark[]) => {
      const answer = [];
      for (const mark of marks) {
        const issue = await issueOf(viewer, mark.issueId);
        if (!issue) continue;
        answer.push({
          ...mark,
          issue: {
            id: issue.id,
            identifier: issue.identifier,
            title: issue.title,
            projectId: issue.projectId ?? null,
            statusKey: issue.statusKey,
          },
        });
      }
      return answer;
    };

    for (const path of ['/', '/*'])
      router.use(path, auth.required({ scopedKeys: true }), authz.middleware());
    attention.use('/', auth.required(), authz.middleware());

    router.get(
      '/me',
      describeRoute({
        tags: ['Studio'],
        summary: 'What the caller may do with releases',
        operationId: 'studioReleasesMe',
        security: PERSON,
        ...cliRoute(false),
        responses: {
          '200': dataResponse(
            z.object({
              userId: z.string(),
              owner: z.boolean(),
              admin: z.boolean(),
              deployer: z.boolean(),
            }),
          ),
          ...apiErrorResponses,
        },
      }),
      async (context) => {
        const userId = personId(context);
        const yes = async (
          check: (context: Context<Env>) => Promise<string>,
        ) => {
          try {
            await check(context);
            return true;
          } catch {
            return false;
          }
        };
        return context.json({
          data: {
            userId,
            owner: await unrestricted(context),
            admin: await yes(requireAdmin),
            deployer: await yes(requireDeployer),
          },
        });
      },
    );

    router.get(
      '/environments',
      describeRoute({
        tags: ['Studio'],
        summary: 'List the hosted environments',
        description:
          'Preview, staging and production as Dương Sinh runs them: outside Studio, recorded here.',
        operationId: 'studioListEnvironments',
        security: PERSON_OR_RUN,
        ...cliRoute({
          command: 'environment list',
          columns: ['key', 'name', 'purpose', 'protected'],
          action: VIEW_ACTION,
        }),
        responses: {
          '200': listResponse(EnvironmentSchema),
          ...apiErrorResponses,
        },
      }),
      async (context) => {
        await viewerOf(context);
        return context.json({ data: await releases().listEnvironments() });
      },
    );

    router.get(
      '/releases',
      describeRoute({
        tags: ['Studio'],
        summary: 'List the projects with their release lines',
        description:
          'For each project the caller sees, its repositories with the latest version, what runs on staging and production, and how many merged issues wait for production.',
        operationId: 'studioListReleases',
        security: PERSON_OR_RUN,
        ...cliRoute({ command: 'release list', action: VIEW_ACTION }),
        responses: { '200': listResponse(HubSchema), ...apiErrorResponses },
      }),
      async (context) => {
        const { repositories, projectNames } = await visible(context);
        const versions = await releases().listVersions(
          repositories.map((repository) => repository.id),
        );
        const pending = await releases().pendingRelease(
          repositories.map((repository) => repository.id),
        );
        const data = [];
        for (const [projectId, { name }] of projectNames) {
          const repos = [];
          for (const repository of repositories.filter((item) =>
            item.projects.some((link) => link.projectId === projectId),
          )) {
            const own = versions.filter(
              (version) =>
                version.repositoryId === repository.id && !version.deleted,
            );
            const pick = (
              match: (version: (typeof own)[number]) => boolean,
            ) => {
              const found = own.find(match);
              return found ? { id: found.id, tag: found.tag } : null;
            };
            repos.push({
              id: repository.id,
              repo: repository.repo,
              line: await releases().releaseLine(repository.id),
              latest: own[0] ? { id: own[0].id, tag: own[0].tag } : null,
              staging: pick((version) => version.current.staging),
              production: pick((version) => version.current.production),
              pendingCount: pending.filter(
                (mark) => mark.repositoryId === repository.id,
              ).length,
              versionCount: own.length,
            });
          }
          data.push({ project: { id: projectId, name }, repositories: repos });
        }
        return context.json({ data });
      },
    );

    router.get(
      '/versions',
      describeRoute({
        tags: ['Studio'],
        summary: 'List versions',
        description:
          'Tags of each repository’s release line, newest first, with the issues each brings.',
        operationId: 'studioListVersions',
        security: PERSON_OR_RUN,
        ...cliRoute({
          command: 'version list',
          flags: {
            projectId: { name: 'project' },
            repositoryId: { name: 'repository' },
          },
          columns: ['repo', 'tag', 'taskCount', 'committedAt'],
          action: VIEW_ACTION,
        }),
        responses: { '200': listResponse(VersionSchema), ...apiErrorResponses },
      }),
      apiValidator('query', ProjectQuery),
      async (context) => {
        const repositories = await scopedRepositories(
          context,
          context.req.valid('query'),
        );
        return context.json({
          data: await releases().listVersions(
            repositories.map((repository) => repository.id),
          ),
        });
      },
    );

    router.get(
      '/pending',
      describeRoute({
        tags: ['Studio'],
        summary: 'List issues merged but not on production',
        operationId: 'studioListPendingRelease',
        security: PERSON_OR_RUN,
        ...cliRoute({
          command: 'release pending',
          flags: { projectId: { name: 'project' } },
          action: VIEW_ACTION,
        }),
        responses: { '200': listResponse(MarkSchema), ...apiErrorResponses },
      }),
      apiValidator('query', ProjectQuery),
      async (context) => {
        const viewer = await viewerOf(context);
        const repositories = await scopedRepositories(
          context,
          context.req.valid('query'),
        );
        const marks = await releases().pendingRelease(
          repositories.map((repository) => repository.id),
        );
        return context.json({ data: await withIssues(viewer, marks) });
      },
    );

    router.get(
      '/marks',
      describeRoute({
        tags: ['Studio'],
        summary: 'Where issues are',
        description:
          'For each issue merged through a linked repository: merged, in a version, on staging or on production.',
        operationId: 'studioListIssueMarks',
        security: PERSON_OR_RUN,
        ...cliRoute(false),
        responses: { '200': listResponse(MarkSchema), ...apiErrorResponses },
      }),
      apiValidator('query', MarksQuery),
      async (context) => {
        const viewer = await viewerOf(context);
        const ids = context.req
          .valid('query')
          .issueIds.split(',')
          .map((id) => id.trim())
          .filter(Boolean)
          .slice(0, 200);
        return context.json({
          data: await withIssues(viewer, await releases().issueMarks(ids)),
        });
      },
    );

    router.get(
      '/records',
      describeRoute({
        tags: ['Studio'],
        summary: 'List the deployment records',
        operationId: 'studioListDeploymentRecords',
        security: PERSON_OR_RUN,
        ...cliRoute(false),
        responses: { '200': listResponse(RecordSchema), ...apiErrorResponses },
      }),
      apiValidator('query', ProjectQuery),
      async (context) => {
        const repositories = await scopedRepositories(
          context,
          context.req.valid('query'),
        );
        return context.json({
          data: await releases().listRecords(
            repositories.map((repository) => repository.id),
          ),
        });
      },
    );

    /** A page of `rows`, as the demo's lists answer. */
    const paged = <T>(
      rows: readonly T[],
      query: { page: number; pageSize: number },
    ) => ({
      data: rows.slice(
        (query.page - 1) * query.pageSize,
        query.page * query.pageSize,
      ),
      meta: { page: query.page, pageSize: query.pageSize, total: rows.length },
    });

    const repositoriesOfQuery = (
      context: Context<Env>,
      query: { projectId?: string; repoId?: string },
    ) =>
      scopedRepositories(context, {
        ...(query.projectId ? { projectId: query.projectId } : {}),
        ...(query.repoId ? { repositoryId: query.repoId } : {}),
      });

    /** Issues as the demo's release lists show them, with where each one has got to. */
    const taskRows = async (viewer: Viewer, marks: readonly IssueMark[]) =>
      (await withIssues(viewer, marks)).map((mark) => ({
        id: mark.issue.id,
        projectId: mark.issue.projectId,
        identifier: mark.issue.identifier,
        title: mark.issue.title,
        statusKey: mark.issue.statusKey,
        where: mark.where,
        merged: 1,
        published: mark.where === 'merged' ? 0 : 1,
        inTest: mark.where === 'staging' || mark.where === 'production',
        tested: mark.where === 'production' ? 1 : 0,
        pullRequests: mark.pullRequest
          ? [
              {
                number: mark.pullRequest.number,
                url: mark.pullRequest.url,
                mergedAt: mark.mergedAt,
              },
            ]
          : [],
      }));

    const deploymentRow = (record: {
      readonly id: string;
      readonly versionId: string;
      readonly environmentKey: string;
      readonly tag: string;
      readonly note: string;
      readonly markedById: string;
      readonly createdAt: string;
    }) => ({
      id: record.id,
      versionId: record.versionId,
      environmentId: record.environmentKey,
      appId: record.environmentKey,
      version: record.tag,
      sha: null,
      note: record.note,
      markedBy: record.markedById,
      markedAt: record.createdAt,
    });

    const lineCard = async (
      context: Context<Env>,
      repository: GitRepositoryView,
    ) => {
      const line = await releases().releaseLine(repository.id);
      return {
        repoId: repository.id,
        resourceId: repository.id,
        name: repository.repo,
        webUrl: repository.webUrl,
        connected: true,
        lines: [
          {
            id: line.lineKey,
            branch: line.branch,
            pattern: line.pattern,
            stripPrefix: line.stripPrefix ?? '',
          },
        ],
        defaultRef: repository.defaultBranch,
        state: line.syncError ? 'failed' : 'ready',
        error: line.syncError,
        canManage:
          (await holdsSettings(context, 'rel.environments', 'manage')) ||
          (await holdsSettings(context, 'pm.members', 'define-roles')),
      };
    };

    router.get(
      '/versions/:id',
      describeRoute({
        tags: ['Studio'],
        summary: 'Read a tag version and its counts',
        operationId: 'studioGetVersion',
        security: PERSON_OR_RUN,
        ...cliRoute({ command: 'version get', action: VIEW_ACTION }),
        responses: {
          '200': dataResponse(
            VersionSchema.extend({ deploymentCount: z.number().int() }),
          ),
          ...apiErrorResponses,
          '404': apiErrorResponse(404),
        },
      }),
      apiValidator('param', IdParams),
      async (context) => {
        const version = await visibleVersion(
          context,
          context.req.valid('param').id,
        );
        const records = await releases().listRecords([version.repositoryId]);
        return context.json({
          data: {
            ...version,
            deploymentCount: records.filter(
              (record) => record.versionId === version.id,
            ).length,
          },
        });
      },
    );

    router.get(
      '/versions/:id/tasks',
      describeRoute({
        tags: ['Studio'],
        summary: 'List the issues a version brings',
        operationId: 'studioVersionTasks',
        security: PERSON_OR_RUN,
        ...cliRoute({ command: 'version tasks', action: VIEW_ACTION }),
        responses: {
          '200': dataResponse(z.array(TaskRow)),
          ...apiErrorResponses,
          '404': apiErrorResponse(404),
        },
      }),
      apiValidator('param', IdParams),
      apiValidator('query', PageQuery),
      async (context) => {
        const version = await visibleVersion(
          context,
          context.req.valid('param').id,
        );
        const viewer = await viewerOf(context);
        return context.json(
          paged(
            await taskRows(
              viewer,
              await releases().issueMarks(version.issueIds, [
                version.repositoryId,
              ]),
            ),
            context.req.valid('query'),
          ),
        );
      },
    );

    router.get(
      '/versions/:id/deployments',
      describeRoute({
        tags: ['Studio'],
        summary: 'List recorded deployments of a version',
        operationId: 'studioVersionDeployments',
        security: PERSON_OR_RUN,
        ...cliRoute({ command: 'version deployments', action: VIEW_ACTION }),
        responses: {
          '200': dataResponse(z.array(DeploymentRow)),
          ...apiErrorResponses,
          '404': apiErrorResponse(404),
        },
      }),
      apiValidator('param', IdParams),
      apiValidator('query', PageQuery),
      async (context) => {
        const version = await visibleVersion(
          context,
          context.req.valid('param').id,
        );
        const records = await releases().listRecords([version.repositoryId]);
        return context.json(
          paged(
            records
              .filter((record) => record.versionId === version.id)
              .map(deploymentRow),
            context.req.valid('query'),
          ),
        );
      },
    );

    router.get(
      '/deploymentRecords',
      describeRoute({
        tags: ['Studio'],
        summary: 'List deployment records',
        operationId: 'studioDeploymentRecords',
        security: PERSON_OR_RUN,
        ...cliRoute({ command: 'release records', action: VIEW_ACTION }),
        responses: {
          '200': dataResponse(z.array(DeploymentRow)),
          ...apiErrorResponses,
        },
      }),
      apiValidator('query', PageQuery),
      async (context) => {
        const query = context.req.valid('query');
        const repositories = await repositoriesOfQuery(context, query);
        const records = await releases().listRecords(
          repositories.map((repository) => repository.id),
        );
        return context.json(paged(records.map(deploymentRow), query));
      },
    );

    router.post(
      '/deploymentRecords',
      describeRoute({
        tags: ['Studio'],
        summary: 'Record a deployment',
        description:
          'Studio only keeps the record. `environmentId` is `staging` (an administrator) or `production` (the owner); `versionId` names the version, or `version` its tag in the project’s repository.',
        operationId: 'studioRecordDeployment',
        security: PERSON,
        ...cliRoute({ command: 'release record' }),
        responses: {
          '201': dataResponse(DeploymentRow),
          ...apiErrorResponses,
          '404': apiErrorResponse(404),
        },
      }),
      apiValidator(
        'json',
        z.object({
          projectId: z.string(),
          repoId: z.string().optional(),
          versionId: z.string().optional(),
          environmentId: z.enum(['staging', 'production']),
          version: z.string().min(1),
          note: z.string().trim().min(1).max(2000),
        }),
      ),
      async (context) => {
        const body = context.req.valid('json');
        const userId =
          body.environmentId === 'production'
            ? await requireOwner(context)
            : await requireAdmin(context);
        const repositories = await scopedRepositories(context, {
          projectId: body.projectId,
          ...(body.repoId ? { repositoryId: body.repoId } : {}),
        });
        const found = (
          await releases().listVersions(
            repositories.map((repository) => repository.id),
          )
        ).find((version) =>
          body.versionId
            ? version.id === body.versionId
            : version.tag === body.version,
        );
        if (!found)
          throw notFound(
            `Version ${body.version} does not exist in this project.`,
          );
        const { record } = await guarded(() =>
          releases().mark({
            versionId: found.id,
            environmentKey: body.environmentId,
            kind: 'deployed',
            note: body.note,
            markedById: userId,
          }),
        );
        return context.json({ data: deploymentRow(record) }, 201);
      },
    );

    router.get(
      '/versionProgress',
      describeRoute({
        tags: ['Studio'],
        summary: 'Read release progress for up to 100 issues',
        operationId: 'studioVersionProgress',
        security: PERSON_OR_RUN,
        ...cliRoute(false),
        responses: {
          '200': dataResponse(z.array(TaskRow)),
          ...apiErrorResponses,
        },
      }),
      apiValidator('query', MarksQuery),
      async (context) => {
        const viewer = await viewerOf(context);
        const ids = context.req
          .valid('query')
          .issueIds.split(',')
          .map((id) => id.trim())
          .filter(Boolean)
          .slice(0, 100);
        return context.json({
          data: await taskRows(viewer, await releases().issueMarks(ids)),
        });
      },
    );

    for (const [path, operationId, summary, command] of [
      [
        '/pendingVersionTasks',
        'studioPendingVersionTasks',
        'List merged issues waiting for a release tag',
        'release pending-tasks',
      ],
      [
        '/unreleasedTasks',
        'studioUnreleasedTasks',
        'List finished issues not on production yet',
        'release unreleased',
      ],
    ] as const)
      router.get(
        path,
        describeRoute({
          tags: ['Studio'],
          summary,
          operationId,
          security: PERSON_OR_RUN,
          ...cliRoute({ command, action: VIEW_ACTION }),
          responses: {
            '200': dataResponse(z.array(TaskRow)),
            ...apiErrorResponses,
          },
        }),
        apiValidator('query', PageQuery),
        async (context) => {
          const query = context.req.valid('query');
          const viewer = await viewerOf(context);
          const repositories = await repositoriesOfQuery(context, query);
          const marks = await releases().pendingRelease(
            repositories.map((repository) => repository.id),
          );
          const wanted =
            path === '/pendingVersionTasks'
              ? marks.filter((mark) => mark.where === 'merged')
              : marks;
          return context.json(paged(await taskRows(viewer, wanted), query));
        },
      );

    router.get(
      '/hubCounts',
      describeRoute({
        tags: ['Studio'],
        summary: 'Counts for the release hub',
        description:
          '`test` counts versions on staging, `previews` the live previews. `releases` stays 0 until Studio hosts builds of its own.',
        operationId: 'studioHubCounts',
        security: PERSON_OR_RUN,
        ...cliRoute({ command: 'release hub-counts', action: VIEW_ACTION }),
        responses: {
          '200': dataResponse(
            z.object({
              tagVersions: z.number().int(),
              pendingVersionTasks: z.number().int(),
              test: z.number().int(),
              previews: z.number().int(),
              releases: z.number().int(),
              unreleased: z.number().int(),
            }),
          ),
          ...apiErrorResponses,
        },
      }),
      apiValidator('query', z.object({ projectId: z.string().optional() })),
      async (context) => {
        const { projectId } = context.req.valid('query');
        const repositories = await scopedRepositories(
          context,
          projectId ? { projectId } : {},
        );
        const ids = repositories.map((repository) => repository.id);
        const [versions, marks, live] = await Promise.all([
          releases().listVersions(ids),
          releases().pendingRelease(ids),
          container.resolve(previewServiceToken).list({ repositoryIds: ids }),
        ]);
        const own = versions.filter((version) => !version.deleted);
        return context.json({
          data: {
            tagVersions: own.length,
            pendingVersionTasks: marks.filter((mark) => mark.where === 'merged')
              .length,
            test: own.filter((version) => version.current.staging).length,
            previews: live.filter(
              (preview) =>
                preview.slot === 'preview' && preview.status !== 'destroyed',
            ).length,
            releases: 0,
            unreleased: marks.length,
          },
        });
      },
    );

    router.get(
      '/projects/:projectId/unreleasedIssues',
      describeRoute({
        tags: ['Studio'],
        summary: 'A project’s finished issues not on production yet',
        operationId: 'studioUnreleasedIssues',
        security: PERSON_OR_RUN,
        ...cliRoute({
          command: 'release project-pending',
          action: VIEW_ACTION,
        }),
        responses: {
          '200': dataResponse(
            z.object({
              projectId: z.string(),
              hasProduction: z.boolean(),
              hasPreview: z.boolean(),
              items: z.array(
                z.object({
                  id: z.string(),
                  identifier: z.string(),
                  title: z.string(),
                  statusKey: z.string(),
                  staging: z.boolean(),
                }),
              ),
            }),
          ),
          ...apiErrorResponses,
        },
      }),
      apiValidator('param', z.object({ projectId: z.string() })),
      async (context) => {
        const { projectId } = context.req.valid('param');
        const viewer = await viewerOf(context);
        const repositories = await scopedRepositories(context, { projectId });
        const ids = repositories.map((repository) => repository.id);
        const marks = await withIssues(
          viewer,
          await releases().pendingRelease(ids),
        );
        const apps = (
          await Promise.all(ids.map((id) => releases().repositoryApps(id)))
        ).flat();
        return context.json({
          data: {
            projectId,
            hasProduction: apps.some(
              (item) => item.environmentKey === 'production',
            ),
            hasPreview: apps.some((item) => item.environmentKey === 'preview'),
            items: marks.map((mark) => ({
              id: mark.issue.id,
              identifier: mark.issue.identifier,
              title: mark.issue.title,
              statusKey: mark.issue.statusKey,
              staging: mark.where === 'staging',
            })),
          },
        });
      },
    );

    router.get(
      '/releaseLines/:id',
      describeRoute({
        tags: ['Studio'],
        summary: 'Read a repository’s release lines',
        description: 'Studio keeps one line per repository.',
        operationId: 'studioReleaseLines',
        security: PERSON_OR_RUN,
        ...cliRoute({ command: 'release line get', action: VIEW_ACTION }),
        responses: {
          '200': dataResponse(LineCard),
          ...apiErrorResponses,
          '404': apiErrorResponse(404),
        },
      }),
      apiValidator('param', IdParams),
      async (context) => {
        const repository = await visibleRepository(
          context,
          context.req.valid('param').id,
        );
        return context.json({ data: await lineCard(context, repository) });
      },
    );

    router.put(
      '/releaseLines/:id',
      describeRoute({
        tags: ['Studio'],
        summary: 'Confirm a repository’s release line',
        description:
          'For administrators. Studio keeps one line per repository, so `lines` holds exactly one.',
        operationId: 'studioSetReleaseLines',
        security: PERSON,
        ...cliRoute({ command: 'release line set' }),
        responses: {
          '200': dataResponse(LineCard),
          ...apiErrorResponses,
          '404': apiErrorResponse(404),
        },
      }),
      apiValidator('param', IdParams),
      apiValidator(
        'json',
        z.object({
          lines: z
            .array(
              z.object({
                id: z.string(),
                branch: z.string().trim().min(1).max(255).optional(),
                pattern: z.string().trim().min(1).max(100),
                stripPrefix: z.string().trim().max(32).optional(),
              }),
            )
            .length(1),
        }),
      ),
      async (context) => {
        await requireAdmin(context);
        const repository = await visibleRepository(
          context,
          context.req.valid('param').id,
        );
        const [line] = context.req.valid('json').lines;
        if (!line) throw notFound('A line is required.');
        await guarded(() =>
          releases().setReleaseLine(repository.id, {
            pattern: line.pattern,
            ...(line.branch ? { branch: line.branch } : {}),
            ...(line.stripPrefix !== undefined
              ? { stripPrefix: line.stripPrefix || null }
              : {}),
          }),
        );
        return context.json({ data: await lineCard(context, repository) });
      },
    );

    router.get(
      '/releaseLines/:id/tags',
      describeRoute({
        tags: ['Studio'],
        summary: 'Read recent tags of a repository',
        description:
          'At most 100 recent tags from the code host, without storing anything.',
        operationId: 'studioReleaseLineTags',
        security: PERSON_OR_RUN,
        ...cliRoute({ command: 'release line tags', action: VIEW_ACTION }),
        responses: {
          '200': dataResponse(
            z.object({
              tags: z.array(z.object({ name: z.string(), sha: z.string() })),
              limit: z.number().int(),
            }),
          ),
          ...apiErrorResponses,
          '404': apiErrorResponse(404),
        },
      }),
      apiValidator('param', IdParams),
      async (context) => {
        const repository = await visibleRepository(
          context,
          context.req.valid('param').id,
        );
        const limit = 100;
        const tags = await guarded(async () =>
          (await git().clientForRepository(repository.id)).tags(
            repository.repo,
            limit,
          ),
        );
        return context.json({
          data: {
            tags: tags.map((tag) => ({ name: tag.name, sha: tag.sha })),
            limit,
          },
        });
      },
    );

    router.post(
      '/productionMarks',
      describeRoute({
        tags: ['Studio'],
        summary: 'Record a version running on production',
        description:
          'Studio only keeps the record. `releaseId` is the version: Studio has no builds of its own yet. The owner in person.',
        operationId: 'studioProductionMark',
        security: PERSON,
        ...cliRoute({ command: 'release mark-production' }),
        responses: {
          '201': dataResponse(DeploymentRow),
          ...apiErrorResponses,
          '404': apiErrorResponse(404),
        },
      }),
      apiValidator(
        'json',
        z.object({
          projectId: z.string(),
          releaseId: z.string(),
          note: z.string().trim().min(1).max(2000),
        }),
      ),
      async (context) => {
        const userId = await requireOwner(context);
        const body = context.req.valid('json');
        const version = await visibleVersion(context, body.releaseId);
        const repositories = await scopedRepositories(context, {
          projectId: body.projectId,
        });
        if (
          !repositories.some(
            (repository) => repository.id === version.repositoryId,
          )
        )
          throw notFound('That version does not belong to this project.');
        const { record } = await guarded(() =>
          releases().mark({
            versionId: version.id,
            environmentKey: 'production',
            kind: 'deployed',
            note: body.note,
            markedById: userId,
          }),
        );
        return context.json({ data: deploymentRow(record) }, 201);
      },
    );

    router.get(
      '/repositories/:repositoryId/releaseLine',
      describeRoute({
        tags: ['Studio'],
        summary: 'Get a repository’s release line',
        operationId: 'studioGetReleaseLine',
        security: PERSON_OR_RUN,
        ...cliRoute(false),
        responses: {
          '200': dataResponse(ReleaseLineSchema),
          ...apiErrorResponses,
          '404': apiErrorResponse(404),
        },
      }),
      apiValidator('param', RepositoryParams),
      async (context) => {
        const repository = await visibleRepository(
          context,
          context.req.valid('param').repositoryId,
        );
        return context.json({
          data: await releases().releaseLine(repository.id),
        });
      },
    );

    router.put(
      '/repositories/:repositoryId/releaseLine',
      describeRoute({
        tags: ['Studio'],
        summary: 'Change a repository’s release line',
        operationId: 'studioSetReleaseLine',
        security: PERSON,
        ...cliRoute(false),
        responses: {
          '200': dataResponse(ReleaseLineSchema),
          ...apiErrorResponses,
        },
      }),
      apiValidator('param', RepositoryParams),
      apiValidator('json', LineBody),
      async (context) => {
        await requireAdmin(context);
        const { repositoryId } = context.req.valid('param');
        return context.json({
          data: await guarded(() =>
            releases().setReleaseLine(repositoryId, context.req.valid('json')),
          ),
        });
      },
    );

    router.post(
      '/repositories/:repositoryId/sync',
      describeRoute({
        tags: ['Studio'],
        summary: 'Read a repository’s tags now',
        description:
          'Records new tags as versions, counts every version’s issues again and marks tags gone as deleted.',
        operationId: 'studioSyncReleaseLine',
        security: PERSON,
        ...cliRoute(false),
        responses: {
          '200': dataResponse(
            z.object({
              added: z.array(z.string()),
              deleted: z.array(z.string()),
            }),
          ),
          ...apiErrorResponses,
        },
      }),
      apiValidator('param', RepositoryParams),
      async (context) => {
        await requireAdmin(context);
        const { repositoryId } = context.req.valid('param');
        return context.json({
          data: await guarded(() =>
            releases().syncRepository(repositoryId, { recountAll: true }),
          ),
        });
      },
    );

    router.get(
      '/repositories/:repositoryId/apps',
      describeRoute({
        tags: ['Studio'],
        summary: 'Get a repository’s App id in each environment',
        operationId: 'studioListRepositoryApps',
        security: PERSON_OR_RUN,
        ...cliRoute(false),
        responses: {
          '200': listResponse(RepositoryAppSchema),
          ...apiErrorResponses,
        },
      }),
      apiValidator('param', RepositoryParams),
      async (context) => {
        const repository = await visibleRepository(
          context,
          context.req.valid('param').repositoryId,
        );
        return context.json({
          data: await releases().repositoryApps(repository.id),
        });
      },
    );

    router.put(
      '/repositories/:repositoryId/apps/:environmentKey',
      describeRoute({
        tags: ['Studio'],
        summary: 'Set a repository’s App id in an environment',
        operationId: 'studioSetRepositoryApp',
        security: PERSON,
        ...cliRoute(false),
        responses: {
          '200': listResponse(RepositoryAppSchema),
          ...apiErrorResponses,
        },
      }),
      apiValidator(
        'param',
        RepositoryParams.extend({ environmentKey: z.string() }),
      ),
      apiValidator('json', AppBody),
      async (context) => {
        await requireAdmin(context);
        const { repositoryId, environmentKey } = context.req.valid('param');
        const body = context.req.valid('json');
        return context.json({
          data: await guarded(() =>
            releases().setRepositoryApp(repositoryId, {
              environmentKey,
              appId: body.appId,
              url: body.url ?? null,
            }),
          ),
        });
      },
    );

    router.post(
      '/versions/:versionId/marks',
      describeRoute({
        tags: ['Studio'],
        summary: 'Mark a version as running on an environment',
        description:
          'Staging: an administrator. Production: the owner only (a recorded deployment through Dokploy, never a deployment by Studio). `rolledBack` records a rollback and answers the issues to consider reopening.',
        operationId: 'studioMarkVersion',
        security: PERSON,
        ...cliRoute(false),
        responses: {
          '201': dataResponse(
            z.object({
              record: RecordSchema,
              reopenSuggestions: z.array(z.string()),
            }),
          ),
          ...apiErrorResponses,
        },
      }),
      apiValidator('param', VersionParams),
      apiValidator('json', MarkBody),
      async (context) => {
        const body = context.req.valid('json');
        const userId =
          body.environmentKey === 'production'
            ? await requireOwner(context)
            : await requireAdmin(context);
        const version = await visibleVersion(
          context,
          context.req.valid('param').versionId,
        );
        const result = await guarded(() =>
          releases().mark({
            versionId: version.id,
            environmentKey: body.environmentKey,
            kind: body.kind,
            note: body.note,
            markedById: userId,
          }),
        );
        return context.json({ data: result }, 201);
      },
    );

    router.post(
      '/versions/:versionId/requests',
      describeRoute({
        tags: ['Studio'],
        summary: 'Ask the owner to mark a version on production',
        operationId: 'studioRequestProductionMark',
        security: PERSON,
        ...cliRoute(false),
        responses: { '201': dataResponse(RequestSchema), ...apiErrorResponses },
      }),
      apiValidator('param', VersionParams),
      apiValidator('json', RequestBody),
      async (context) => {
        const userId = await requireDeployer(context);
        const body = context.req.valid('json');
        const version = await visibleVersion(
          context,
          context.req.valid('param').versionId,
        );
        const created = await guarded(() =>
          releases().request({
            versionId: version.id,
            environmentKey: body.environmentKey,
            kind: body.kind,
            note: body.note,
            requestedById: userId,
          }),
        );
        return context.json({ data: created }, 201);
      },
    );

    router.get(
      '/requests',
      describeRoute({
        tags: ['Studio'],
        summary: 'List production mark requests',
        description:
          '`awaitingMe=true`: the pending requests the caller decides (the owner, for others’ requests).',
        operationId: 'studioListDeploymentRequests',
        security: PERSON,
        ...cliRoute(false),
        responses: { '200': listResponse(RequestSchema), ...apiErrorResponses },
      }),
      apiValidator('query', RequestsQuery),
      async (context) => {
        const userId = personId(context);
        const query = context.req.valid('query');
        const owner = await unrestricted(context);
        if (query.awaitingMe === 'true') {
          if (!owner) return context.json({ data: [] });
          const waiting = await releases().listRequests({ status: 'pending' });
          return context.json({
            data: waiting.filter((request) => request.requestedById !== userId),
          });
        }
        const { repositories } = await visible(context);
        const list = await releases().listRequests({
          ...(query.status ? { status: query.status } : {}),
          repositoryIds: repositories.map((repository) => repository.id),
        });
        return context.json({
          data: owner
            ? list
            : list.filter((request) => request.requestedById === userId),
        });
      },
    );

    router.get(
      '/requests/:requestId',
      describeRoute({
        tags: ['Studio'],
        summary: 'Get a production mark request',
        operationId: 'studioGetDeploymentRequest',
        security: PERSON,
        ...cliRoute(false),
        responses: {
          '200': dataResponse(RequestSchema),
          ...apiErrorResponses,
          '404': apiErrorResponse(404),
        },
      }),
      apiValidator('param', RequestParams),
      async (context) => {
        const userId = personId(context);
        const found = await guarded(() =>
          releases().getRequest(context.req.valid('param').requestId),
        );
        if (!(await unrestricted(context)) && found.requestedById !== userId)
          throw notFound('The request does not exist.');
        return context.json({ data: found });
      },
    );

    router.post(
      '/requests/:requestId/approve',
      describeRoute({
        tags: ['Studio'],
        summary: 'Approve a production mark request',
        description:
          'The owner, typing the App id again. Records the mark as the owner.',
        operationId: 'studioApproveDeploymentRequest',
        security: PERSON,
        ...cliRoute(false),
        responses: {
          '200': dataResponse(
            z.object({
              request: RequestSchema,
              record: RecordSchema.nullable(),
            }),
          ),
          ...apiErrorResponses,
        },
      }),
      apiValidator('param', RequestParams),
      apiValidator('json', ApproveBody),
      async (context) => {
        const userId = await requireOwner(context);
        const body = context.req.valid('json');
        return context.json({
          data: await guarded(() =>
            releases().decide({
              requestId: context.req.valid('param').requestId,
              approve: true,
              deciderId: userId,
              confirmAppId: body.confirmAppId,
              ...(body.note ? { note: body.note } : {}),
            }),
          ),
        });
      },
    );

    router.post(
      '/requests/:requestId/reject',
      describeRoute({
        tags: ['Studio'],
        summary: 'Reject a production mark request',
        operationId: 'studioRejectDeploymentRequest',
        security: PERSON,
        ...cliRoute(false),
        responses: {
          '200': dataResponse(
            z.object({
              request: RequestSchema,
              record: RecordSchema.nullable(),
            }),
          ),
          ...apiErrorResponses,
        },
      }),
      apiValidator('param', RequestParams),
      apiValidator('json', RejectBody),
      async (context) => {
        const userId = await requireOwner(context);
        return context.json({
          data: await guarded(() =>
            releases().decide({
              requestId: context.req.valid('param').requestId,
              approve: false,
              deciderId: userId,
              note: context.req.valid('json').note,
            }),
          ),
        });
      },
    );

    router.post(
      '/requests/:requestId/cancel',
      describeRoute({
        tags: ['Studio'],
        summary: 'Withdraw your production mark request',
        operationId: 'studioCancelDeploymentRequest',
        security: PERSON,
        ...cliRoute(false),
        responses: { '200': dataResponse(RequestSchema), ...apiErrorResponses },
      }),
      apiValidator('param', RequestParams),
      async (context) => {
        const userId = personId(context);
        return context.json({
          data: await guarded(() =>
            releases().cancelRequest(
              context.req.valid('param').requestId,
              userId,
            ),
          ),
        });
      },
    );

    attention.get(
      '/',
      describeRoute({
        tags: ['Studio'],
        summary: 'What waits on me',
        description:
          'Counts for badges: production requests to decide (owner), and merged issues not on production.',
        operationId: 'studioAttention',
        security: PERSON,
        ...cliRoute(false),
        responses: {
          '200': dataResponse(AttentionSchema),
          ...apiErrorResponses,
        },
      }),
      async (context) => {
        const userId = personId(context);
        const reasons: { reason: string; count: number; path: string }[] = [];
        if (await unrestricted(context)) {
          const waiting = (
            await releases().listRequests({ status: 'pending' })
          ).filter((request) => request.requestedById !== userId).length;
          if (waiting > 0)
            reasons.push({
              reason: 'deployment_requested',
              count: waiting,
              path: '/inbox?kind=decision',
            });
        }
        const { repositories } = await visible(context);
        const pending = (
          await releases().pendingRelease(
            repositories.map((repository) => repository.id),
          )
        ).length;
        if (pending > 0)
          reasons.push({
            reason: 'pendingRelease',
            count: pending,
            path: '/releases?tab=pending',
          });
        return context.json({
          data: {
            count: reasons.reduce((sum, item) => sum + item.count, 0),
            reasons,
          },
        });
      },
    );

    // Previews and staging (S5.6): `/api/previews/*`. The setup container's report carries its own one-time token and no
    // session; every other route needs a person or, for reading and for an agent's own pull request, a run.
    const previews = new Hono<Env>();
    const previewReports = new Hono();
    const previewService = () => container.resolve(previewServiceToken);

    const previewGuarded = async <T>(work: () => Promise<T>): Promise<T> =>
      guarded(async () => {
        try {
          return await work();
        } catch (error) {
          if (error instanceof PreviewError)
            throw new ApiError({
              status: error.status,
              reason: error.reason,
              domain: DOMAIN,
              message: error.message,
              cause: error,
            });
          if (error instanceof DokployRefused)
            throw new ApiError({
              status: 'PERMISSION_DENIED',
              reason: 'DOKPLOY_REFUSED',
              domain: DOMAIN,
              message: error.message,
              cause: error,
            });
          if (error instanceof DokployError)
            throw new ApiError({
              status: 'UNAVAILABLE',
              reason: 'DOKPLOY_UNAVAILABLE',
              domain: DOMAIN,
              message: error.message,
              cause: error,
            });
          throw error;
        }
      });

    const visiblePreview = async (context: Context<Env>, previewId: string) => {
      const { repositories, viewer } = await visible(context);
      const preview = await previewGuarded(() =>
        previewService().get(previewId),
      );
      if (
        !repositories.some(
          (repository) => repository.id === preview.repositoryId,
        )
      )
        throw notFound(`Preview ${previewId} does not exist.`);
      return { preview, viewer };
    };

    /** Whoever may edit the preview's issue in person, or an administrator; staging (no issue) is administrators'. */
    const mayManagePreview = async (
      context: Context<Env>,
      viewer: Viewer,
      issueId: string | null,
    ): Promise<boolean> => {
      if (
        (await unrestricted(context)) ||
        (await holdsSettings(context, 'rel.environments', 'manage'))
      )
        return true;
      if (!issueId) return false;
      const edit = viewer.permissions.scopes['pm.issues/edit'];
      return Boolean(
        edit && edit !== 'none' && (await issueOf(viewer, issueId)),
      );
    };

    /** A run may take down or retry only the preview of the issue it works on, when its agent holds the action. */
    const runMayManagePreview = async (
      context: Context<Env>,
      issueId: string | null,
    ): Promise<boolean | null> => {
      const session = context.get('auth');
      const run = runIdentityOf(session);
      if (!run?.run) return null;
      if (
        !issueId ||
        run.run.run.subjectKind !== ISSUE_SUBJECT ||
        run.run.run.subjectId !== issueId
      )
        return false;
      if (!container.has(agentsToken)) return false;
      return (await container.resolve(agentsToken).gate.allowed(run)).has(
        PREVIEWS_MANAGE_ACTION,
      );
    };

    const requirePreviewManager = async (
      context: Context<Env>,
      previewId: string,
    ) => {
      const { preview, viewer } = await visiblePreview(context, previewId);
      const asRun = await runMayManagePreview(context, preview.issueId);
      if (
        asRun === false ||
        (asRun === null &&
          !(await mayManagePreview(context, viewer, preview.issueId)))
      )
        throw denied(
          'Only someone who may edit the issue (or its own run, given the previews action) manages its preview.',
        );
      return preview;
    };

    for (const path of ['/status', '/down', '/retry'])
      previews.use(
        path,
        auth.required({ scopedKeys: true }),
        authz.middleware(),
      );
    for (const path of [
      '/',
      '/staging',
      '/:previewId',
      '/:previewId/open',
      '/:previewId/credentials',
      '/:previewId/retry',
      '/:previewId/down',
    ])
      previews.use(
        path,
        auth.required({ scopedKeys: true }),
        authz.middleware(),
      );

    previews.get(
      '/',
      describeRoute({
        tags: ['Studio'],
        summary: 'List previews and staging deploys',
        description:
          'The NocoBase 2 previews of pull requests labelled `preview` and the staging deploys of the default branch, newest first, of the repositories the caller sees. Credentials are never listed.',
        operationId: 'studioPreviewsList',
        security: PERSON_OR_RUN,
        ...cliRoute({ command: 'preview list', action: VIEW_ACTION }),
        responses: { '200': listResponse(PreviewSchema), ...apiErrorResponses },
      }),
      apiValidator('query', PreviewQuery),
      async (context) => {
        const query = context.req.valid('query');
        const repositories = await scopedRepositories(context, query);
        return context.json({
          data: await previewService().list({
            repositoryIds: repositories.map((repository) => repository.id),
            ...(query.issueId ? { issueId: query.issueId } : {}),
          }),
        });
      },
    );

    previews.post(
      '/staging',
      describeRoute({
        tags: ['Studio'],
        summary: 'Deploy staging again',
        description:
          'Builds staging again from the newest build of the default branch. An administrator in person.',
        operationId: 'studioPreviewsDeployStaging',
        security: PERSON,
        ...cliRoute(false),
        responses: { '200': dataResponse(PreviewSchema), ...apiErrorResponses },
      }),
      apiValidator('json', StagingBody),
      async (context) => {
        const userId = await requireAdmin(context);
        const { repositoryId } = context.req.valid('json');
        await visibleRepository(context, repositoryId);
        return context.json({
          data: await previewGuarded(() =>
            previewService().deployStaging(repositoryId, userId),
          ),
        });
      },
    );

    /** The issue's previews as `previews/status` answers, for whoever sees it. */
    const issuePreviews = async (context: Context<Env>, issueId: string) => {
      const viewer = await viewerOf(context);
      const issue = await issueOf(viewer, issueId);
      if (!issue) throw notFound(`Issue ${issueId} does not exist.`);
      const { repositories } = await visible(context);
      const served = issue.projectId
        ? repositories.filter((repository) =>
            repository.projects.some(
              (link) => link.projectId === issue.projectId,
            ),
          )
        : [];
      return {
        issueId: issue.id,
        identifier: issue.identifier,
        previews: await previewService().list({
          repositoryIds: repositories.map((repository) => repository.id),
          issueId: issue.id,
        }),
        blocker: served.length === 0 ? ('noRepository' as const) : null,
        canEdit: await mayManagePreview(context, viewer, issue.id),
      };
    };

    previews.get(
      '/status',
      describeRoute({
        tags: ['Studio'],
        summary: 'The previews of an issue’s pull requests',
        description:
          'For whoever sees the issue. Studio previews one App per pull request and keeps no per-issue opt-out.',
        operationId: 'studioPreviewsStatus',
        security: PERSON_OR_RUN,
        ...cliRoute({ command: 'preview status', action: VIEW_ACTION }),
        responses: {
          '200': dataResponse(PreviewStatus),
          ...apiErrorResponses,
          '404': apiErrorResponse(404),
        },
      }),
      apiValidator('query', z.object({ issueId: z.string().min(1) })),
      async (context) =>
        context.json({
          data: await issuePreviews(
            context,
            context.req.valid('query').issueId,
          ),
        }),
    );

    for (const [path, operationId, summary, act] of [
      [
        '/down',
        'studioPreviewsDownByIssue',
        'Take down the previews of an issue',
        'down',
      ],
      [
        '/retry',
        'studioPreviewsRetryByIssue',
        'Build the previews of an issue again',
        'retry',
      ],
    ] as const)
      previews.post(
        path,
        describeRoute({
          tags: ['Studio'],
          summary,
          description: `Someone who may edit the issue, or the issue’s own run when its agent holds \`${PREVIEWS_MANAGE_ACTION}\`.`,
          operationId,
          security: PERSON_OR_RUN,
          ...cliRoute({
            command: `preview ${act} issue`,
            action: PREVIEWS_MANAGE_ACTION,
          }),
          responses: {
            '200': dataResponse(PreviewStatus),
            ...apiErrorResponses,
            '404': apiErrorResponse(404),
          },
        }),
        apiValidator('json', z.object({ issueId: z.string().min(1) })),
        async (context) => {
          const { issueId } = context.req.valid('json');
          const state = await issuePreviews(context, issueId);
          for (const preview of state.previews) {
            if (preview.status === 'destroyed') continue;
            const manageable = await requirePreviewManager(context, preview.id);
            await previewGuarded(() =>
              act === 'down'
                ? previewService().destroy(manageable.id, 'taken down')
                : previewService().retry(manageable.id),
            );
          }
          return context.json({ data: await issuePreviews(context, issueId) });
        },
      );

    previews.get(
      '/:previewId',
      describeRoute({
        tags: ['Studio'],
        summary: 'Get a preview',
        operationId: 'studioPreviewsGet',
        security: PERSON_OR_RUN,
        ...cliRoute({ command: 'preview get', action: VIEW_ACTION }),
        responses: {
          '200': dataResponse(PreviewSchema),
          ...apiErrorResponses,
          '404': apiErrorResponse(404),
        },
      }),
      apiValidator('param', PreviewParams),
      async (context) =>
        context.json({
          data: (
            await visiblePreview(context, context.req.valid('param').previewId)
          ).preview,
        }),
    );

    previews.post(
      '/:previewId/open',
      describeRoute({
        tags: ['Studio'],
        summary: 'Open a preview',
        description:
          'Counts as use (a ready preview stops after 30 minutes unused) and starts a stopped one again.',
        operationId: 'studioPreviewsOpen',
        security: PERSON,
        ...cliRoute(false),
        responses: { '200': dataResponse(PreviewSchema), ...apiErrorResponses },
      }),
      apiValidator('param', PreviewParams),
      async (context) => {
        personId(context);
        const { preview } = await visiblePreview(
          context,
          context.req.valid('param').previewId,
        );
        return context.json({
          data: await previewGuarded(() => previewService().open(preview.id)),
        });
      },
    );

    previews.get(
      '/:previewId/credentials',
      describeRoute({
        tags: ['Studio'],
        summary: "A preview's sign-in",
        description:
          'The generated root account of the sample NocoBase. Only someone who may edit the issue, in person.',
        operationId: 'studioPreviewsCredentials',
        security: PERSON,
        ...cliRoute(false),
        responses: {
          '200': dataResponse(PreviewCredentialsSchema.nullable()),
          ...apiErrorResponses,
        },
      }),
      apiValidator('param', PreviewParams),
      async (context) => {
        personId(context);
        const { preview, viewer } = await visiblePreview(
          context,
          context.req.valid('param').previewId,
        );
        if (!(await mayManagePreview(context, viewer, preview.issueId)))
          throw denied(
            "Only someone who may edit the issue sees its preview's sign-in.",
          );
        return context.json({
          data: await previewGuarded(() =>
            previewService().credentials(preview.id),
          ),
        });
      },
    );

    previews.post(
      '/:previewId/retry',
      describeRoute({
        tags: ['Studio'],
        summary: 'Build a preview again',
        description: `The same build again, from empty data. Someone who may edit the issue, or the issue's own run when its agent holds \`${PREVIEWS_MANAGE_ACTION}\`.`,
        operationId: 'studioPreviewsRetry',
        security: PERSON_OR_RUN,
        ...cliRoute({
          command: 'preview retry',
          action: PREVIEWS_MANAGE_ACTION,
        }),
        responses: { '200': dataResponse(PreviewSchema), ...apiErrorResponses },
      }),
      apiValidator('param', PreviewParams),
      async (context) => {
        const preview = await requirePreviewManager(
          context,
          context.req.valid('param').previewId,
        );
        return context.json({
          data: await previewGuarded(() => previewService().retry(preview.id)),
        });
      },
    );

    previews.post(
      '/:previewId/down',
      describeRoute({
        tags: ['Studio'],
        summary: 'Take a preview down',
        description: `Removes the preview with its data; a pull request waiting for the slot takes it. Same callers as retry.`,
        operationId: 'studioPreviewsDown',
        security: PERSON_OR_RUN,
        ...cliRoute({
          command: 'preview down',
          action: PREVIEWS_MANAGE_ACTION,
        }),
        responses: { '200': dataResponse(PreviewSchema), ...apiErrorResponses },
      }),
      apiValidator('param', PreviewParams),
      async (context) => {
        const preview = await requirePreviewManager(
          context,
          context.req.valid('param').previewId,
        );
        return context.json({
          data: await previewGuarded(() =>
            previewService().destroy(preview.id, 'taken down'),
          ),
        });
      },
    );

    previewReports.post(
      '/:previewId/report',
      describeRoute({
        tags: ['Studio'],
        summary: "A preview setup's report",
        description:
          'Called by the setup container of a preview with the one-time token it was given. Not for people.',
        operationId: 'studioPreviewsReport',
        security: [],
        ...cliRoute(false),
        responses: {
          '204': { description: 'Recorded.' },
          '401': apiErrorResponse(401),
        },
      }),
      async (context) => {
        const previewId = context.req.param('previewId') ?? '';
        const raw: unknown = await context.req.json().catch(() => null);
        const parsed = ReportBody.safeParse(raw);
        if (!parsed.success)
          return context.json({ error: 'invalid report' }, 400);
        const accepted = await previewService().report({
          id: previewId,
          ...parsed.data,
          reason: parsed.data.reason ?? null,
        });
        return accepted
          ? context.body(null, 204)
          : context.json({ error: 'unknown preview or token' }, 401);
      },
    );

    const root = new Hono();
    root.route('/deploys', router);
    root.route('/attention', attention);
    root.route('/previews', previewReports);
    root.route('/previews', previews);
    return root;
  });
