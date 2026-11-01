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
import { reaches } from '@nocobase/app-plugin-projects/shared/access';
import type { Issue } from '@nocobase/app-plugin-projects/shared/issues';
import type { Application } from '@nocobase/app-server/application';
import { i18nToken } from '@nocobase/app-server/i18n';
import {
  ApiError,
  apiErrorResponse,
  apiErrorResponses,
  apiValidator,
  dataResponse,
  defineApiRoutes,
  describeRoute,
  emptyResponse,
  listResponse,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { APP_NS } from '@nocobase/i18n';
import { getRequestLocale } from '@nocobase/i18n/server';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { gitServiceToken } from '../providers/git.js';
import {
  GitError,
  type GitPullRequestView,
  type GitRepositoryView,
} from '../git/service.js';

type Env = AuthEnv & AuthorizationEnv;

const DOMAIN = 'studio';
/** A person (session or API key) or an agent's run (its run token), as the projects plugin's routes declare it. */
const PERSON_OR_RUN: Record<string, string[]>[] = [
  { cookieAuth: [] },
  { apiKeyAuth: [] },
  { runToken: [] },
];

const ConnectionSchema = z
  .object({
    id: z.string(),
    provider: z.enum(['github']),
    kind: z.enum(['token']),
    name: z.string(),
    account: z.string().nullable(),
    webUrl: z.string(),
    apiBaseUrl: z.string(),
    hasToken: z.boolean().meta({
      description:
        'Whether a token is kept (sealed); the token itself is never returned.',
    }),
    webhooks: z.boolean(),
    personalMethods: z.array(z.string()),
    allowPersonalTokens: z.boolean(),
    problems: z.array(z.string()),
    usedBy: z.number().int(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .meta({ ref: 'StudioGitConnection' });

const ChecksSource = z.enum(['host', 'external', 'agent']);

const RepositorySchema = z
  .object({
    id: z.string(),
    connectionId: z.string(),
    provider: z.enum(['github']),
    repo: z.string().meta({ description: '`owner/name` on its host.' }),
    cloneUrl: z.string(),
    webUrl: z.string(),
    defaultBranch: z.string(),
    branchPrefix: z.string(),
    checksSource: ChecksSource,
    requiredChecks: z.array(z.string()),
    pollSeconds: z.number().int(),
    polledAt: z.string().nullable(),
    pollError: z.string().nullable(),
    projects: z.array(
      z.object({ projectId: z.string(), isPrimary: z.boolean() }),
    ),
  })
  .meta({ ref: 'StudioGitRepository' });

const CheckSchema = z.object({
  kind: z.enum(['checkRun', 'status']),
  name: z.string(),
  status: z.string(),
  conclusion: z.string().nullable(),
  outcome: z.enum(['pending', 'success', 'failure']),
  url: z.string().nullable(),
});

const MergeBlocker = z.enum([
  'merged',
  'closed',
  'draft',
  'conflicts',
  'computing',
  'ciPending',
  'ciFailed',
  'ciMissing',
  'protected',
]);

const PullRequestSchema = z
  .object({
    id: z.string(),
    repositoryId: z.string(),
    repo: z.string(),
    provider: z.enum(['github']),
    number: z.number().int(),
    url: z.string(),
    title: z.string(),
    state: z.enum(['open', 'closed', 'merged']),
    draft: z.boolean(),
    headRef: z.string(),
    baseRef: z.string(),
    headSha: z.string(),
    mergeCommitSha: z.string().nullable(),
    authorLogin: z.string().nullable(),
    mergeability: z.enum(['clean', 'conflicts', 'blocked', 'unknown']),
    hostMergeState: z.string().nullable(),
    ciState: z.enum(['pending', 'success', 'failure']).nullable(),
    checks: z.array(CheckSchema),
    issueId: z.string().nullable(),
    linkedBy: z.string().nullable(),
    mergedAt: z.string().nullable(),
    mergedBy: z.object({ id: z.string() }).nullable(),
    mergeForcedReason: z.string().nullable(),
    closedAt: z.string().nullable(),
    snapshotAt: z.string().nullable(),
    mergeBlocker: MergeBlocker.nullable().meta({
      description:
        'Why it cannot be merged by what Studio last read; null when it looks mergeable.',
    }),
    mergeInStudio: z.boolean(),
    checksSource: ChecksSource,
    updatedAt: z.string(),
  })
  .meta({ ref: 'StudioGitPullRequest' });

const ConnectionParams = z.object({ connectionId: z.string() });
const PullParams = z.object({ pullRequestId: z.string() });
const ProjectParams = z.object({ projectId: z.string() });

const CreateConnectionBody = z
  .object({
    provider: z.literal('github').default('github'),
    kind: z.literal('token').default('token'),
    name: z.string().trim().min(1).max(100),
    token: z.string().trim().min(1).max(1_000).meta({
      description:
        'A fine-grained personal access token; sealed, never returned.',
    }),
    apiBaseUrl: z.url().optional().meta({
      description:
        'GitHub Enterprise’s API root; api.github.com when left out.',
    }),
  })
  .strict();

const LinkRepositoryBody = z
  .object({
    connectionId: z.string(),
    repo: z
      .string()
      .regex(/^[\w.-]+\/[\w.-]+$/u)
      .meta({ description: '`owner/name`.' }),
    branchPrefix: z.string().min(1).max(100).optional(),
    checksSource: ChecksSource.optional(),
    requiredChecks: z.array(z.string().min(1).max(200)).max(50).optional(),
    pollSeconds: z.number().int().min(30).max(86_400).optional(),
  })
  .strict();

const CodeLocationBody = z
  .object({
    repositoryId: z.string(),
    primary: z.boolean().optional(),
  })
  .strict();

const PullListQuery = z.object({
  issueId: z.string().optional(),
  repositoryId: z.string().optional(),
});

const MergeBody = z
  .object({
    force: z.boolean().default(false).meta({
      description:
        '"Merge anyway": overrides missing, pending or failed checks; needs `reason`.',
    }),
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .strict()
  .refine((body) => !body.force || body.reason !== undefined, {
    path: ['reason'],
    message: 'Merging anyway needs a reason.',
  });

function denied(message: string): ApiError {
  return new ApiError({
    status: 'PERMISSION_DENIED',
    reason: 'ACCESS_DENIED',
    domain: DOMAIN,
    message,
  });
}

function pullNotFound(id: string): ApiError {
  return new ApiError({
    status: 'NOT_FOUND',
    reason: 'PULL_REQUEST_NOT_FOUND',
    domain: DOMAIN,
    message: `Pull request ${id} does not exist.`,
  });
}

/**
 * Git hosting (`/api/git/*` and `/api/projects/{projectId}/codeLocations`, the Studio demo's contract): token
 * connections to GitHub, linked repositories, and pull requests with their checks and merge. Connections, linking and
 * attaching repositories need an administrator (`pm.members` `define-roles`, or unrestricted) acting in person; reading
 * pull requests needs sight of the linked issue or of a project the repository serves, or `agents.agents` `read`, and
 * a run may read; merging needs a person who may close the linked issue (its owner, the project lead or an
 * administrator).
 */
export const gitRoutes: AppApiRouteContribution<Application> = defineApiRoutes(
  (app) => {
    const router = new Hono();
    const git = new Hono<Env>();
    const codeLocations = new Hono<Env>();
    const { container } = app;
    const auth = container.resolve(authenticationToken);
    const authz = container.resolve(authorizationToken);
    const service = () => container.resolve(gitServiceToken);
    const projects = (): Projects => container.resolve(projectsToken);

    const translate = async (
      context: Context<Env>,
      key: string,
      params: Readonly<Record<string, string>>,
    ): Promise<{ locale: string; message: string } | undefined> => {
      const i18n = container.resolve(i18nToken);
      const locale = getRequestLocale(context) ?? i18n.getDefaultLocale();
      await i18n.ensureLocaleLoaded(locale);
      const message = i18n.getFixedT(APP_NS, locale)(key, params);
      return message === key ? undefined : { locale, message };
    };

    const handleError = async (
      error: unknown,
      context: Context<Env>,
    ): Promise<never> => {
      if (error instanceof GitError) {
        const localizedMessage = await translate(
          context,
          `studioGit.errors.${error.reason}`,
          error.params,
        );
        throw new ApiError({
          status: error.status,
          reason: error.reason,
          domain: DOMAIN,
          message: error.message,
          ...(localizedMessage ? { localizedMessage } : {}),
          metadata: error.metadata,
          cause: error,
        });
      }
      if (error instanceof DomainError)
        throw new ApiError({
          status:
            error.kind === 'forbidden' || error.kind === 'unauthorized'
              ? 'PERMISSION_DENIED'
              : error.kind === 'notFound'
                ? 'NOT_FOUND'
                : error.kind === 'conflict'
                  ? 'ABORTED'
                  : 'INVALID_ARGUMENT',
          reason: error.code,
          domain: error.domain ?? 'projects',
          message: error.message,
          cause: error,
        });
      throw error;
    };

    /** Runs `work`, turning the git service's and the projects plugin's refusals into API errors. */
    const guarded = async <T>(
      context: Context<Env>,
      work: () => Promise<T>,
    ): Promise<T> => {
      try {
        return await work();
      } catch (error) {
        return handleError(error, context);
      }
    };

    const personId = (context: Context<Env>): string => {
      const session = context.get('auth');
      if (!session || session.credential || isServiceAccount(session.user))
        throw denied('Only people do this.');
      return session.user.id;
    };

    const can = async (
      context: Context<Env>,
      item: string,
      action: string,
    ): Promise<boolean> => {
      const authorization = context.get('authz');
      return (
        (await authorization.snapshot()).unrestricted ||
        (await authorization.can({
          resource: { type: 'settings', id: item },
          action,
        }))
      );
    };

    const requireAdmin = async (context: Context<Env>): Promise<string> => {
      const userId = personId(context);
      if (!(await can(context, 'pm.members', 'define-roles')))
        throw denied(
          'An administrator manages git connections and repositories.',
        );
      return userId;
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

    const visibleIssue = async (
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

    /** Who may read: readers of agents, or whoever sees the pull request's issue or one of its repository's projects. */
    const reader = async (context: Context<Env>) => {
      const viewer = await viewerOf(context);
      const everything = await can(context, 'agents.agents', 'read');
      const projectCache = new Map<string, boolean>();
      const seesProject = async (projectId: string): Promise<boolean> => {
        const known = projectCache.get(projectId);
        if (known !== undefined) return known;
        const access = await projects().projects.accessTo(viewer, {
          projectId,
        });
        const visible = access?.visible === true;
        projectCache.set(projectId, visible);
        return visible;
      };
      const seesRepository = async (
        repository: Pick<GitRepositoryView, 'projects'>,
      ): Promise<boolean> => {
        if (everything) return true;
        for (const link of repository.projects)
          if (await seesProject(link.projectId)) return true;
        return false;
      };
      const seesPull = async (pull: GitPullRequestView): Promise<boolean> => {
        if (everything) return true;
        if (pull.issueId && (await visibleIssue(viewer, pull.issueId)))
          return true;
        for (const projectId of await service().projectsOf(pull.repositoryId))
          if (await seesProject(projectId)) return true;
        return false;
      };
      return { viewer, seesRepository, seesPull };
    };

    const readablePull = async (
      context: Context<Env>,
      id: string,
    ): Promise<GitPullRequestView> => {
      const { seesPull } = await reader(context);
      const pull = await guarded(context, () => service().getPullRequest(id));
      if (!(await seesPull(pull))) throw pullNotFound(id);
      return pull;
    };

    // Connections are for people only; repositories and pull requests also take a run's token (each handler still
    // refuses what only a person does), which `required()` accepts only when the route opts in to scoped credentials.
    for (const path of ['/connections', '/connections/*'])
      git.use(path, auth.required(), authz.middleware());
    for (const path of [
      '/repositories',
      '/repositories/*',
      '/pullRequests',
      '/pullRequests/*',
    ])
      git.use(path, auth.required({ scopedKeys: true }), authz.middleware());
    // `/projects/*` belongs to the projects plugin: only this application's own path gets the middleware.
    codeLocations.use(
      '/:projectId/codeLocations',
      auth.required(),
      authz.middleware(),
    );

    git.get(
      '/connections',
      describeRoute({
        tags: ['Studio'],
        summary: 'List the connections to code hosts',
        operationId: 'studioGitListConnections',
        responses: {
          '200': listResponse(ConnectionSchema),
          ...apiErrorResponses,
        },
      }),
      async (context) => {
        await requireAdmin(context);
        return context.json({ data: await service().listConnections() });
      },
    );

    git.post(
      '/connections',
      describeRoute({
        tags: ['Studio'],
        summary: 'Add a connection to a code host',
        description:
          'A GitHub token connection. The token is checked against GitHub, sealed with the secrets keys and never returned.',
        operationId: 'studioGitCreateConnection',
        responses: {
          '201': dataResponse(ConnectionSchema),
          ...apiErrorResponses,
          '503': apiErrorResponse(
            503,
            'When GitHub or the secrets keys are unavailable.',
          ),
        },
      }),
      apiValidator('json', CreateConnectionBody),
      async (context) => {
        const createdById = await requireAdmin(context);
        const body = context.req.valid('json');
        const created = await guarded(context, () =>
          service().createConnection({
            name: body.name,
            token: body.token,
            ...(body.apiBaseUrl ? { apiBaseUrl: body.apiBaseUrl } : {}),
            createdById,
          }),
        );
        return context.json({ data: created }, 201);
      },
    );

    git.get(
      '/connections/:connectionId',
      describeRoute({
        tags: ['Studio'],
        summary: 'Get a connection to a code host',
        operationId: 'studioGitGetConnection',
        responses: {
          '200': dataResponse(ConnectionSchema),
          ...apiErrorResponses,
          '404': apiErrorResponse(404),
        },
      }),
      apiValidator('param', ConnectionParams),
      async (context) => {
        await requireAdmin(context);
        const { connectionId } = context.req.valid('param');
        return context.json({
          data: await guarded(context, () =>
            service().getConnection(connectionId),
          ),
        });
      },
    );

    git.delete(
      '/connections/:connectionId',
      describeRoute({
        tags: ['Studio'],
        summary: 'Remove a connection to a code host',
        operationId: 'studioGitDeleteConnection',
        responses: {
          '204': emptyResponse(),
          ...apiErrorResponses,
          '404': apiErrorResponse(404),
        },
      }),
      apiValidator('param', ConnectionParams),
      async (context) => {
        await requireAdmin(context);
        const { connectionId } = context.req.valid('param');
        await guarded(context, () => service().deleteConnection(connectionId));
        return context.body(null, 204);
      },
    );

    git.get(
      '/repositories',
      describeRoute({
        tags: ['Studio'],
        summary: 'List the linked repositories',
        description:
          'Those of the projects the caller sees; every one for a reader of agents.',
        operationId: 'studioGitListRepositories',
        security: PERSON_OR_RUN,
        responses: {
          '200': listResponse(RepositorySchema),
          ...apiErrorResponses,
        },
      }),
      async (context) => {
        const { seesRepository } = await reader(context);
        const visible: GitRepositoryView[] = [];
        for (const repository of await service().listRepositories())
          if (await seesRepository(repository)) visible.push(repository);
        return context.json({ data: visible });
      },
    );

    git.post(
      '/repositories',
      describeRoute({
        tags: ['Studio'],
        summary: 'Link a repository through a connection',
        description:
          'Checks on GitHub that the connection’s token reaches the repository and may push to it.',
        operationId: 'studioGitLinkRepository',
        responses: {
          '201': dataResponse(RepositorySchema),
          ...apiErrorResponses,
          '404': apiErrorResponse(404),
          '409': apiErrorResponse(
            409,
            'When the repository is linked already.',
          ),
        },
      }),
      apiValidator('json', LinkRepositoryBody),
      async (context) => {
        await requireAdmin(context);
        const body = context.req.valid('json');
        const linked = await guarded(context, () =>
          service().linkRepository({
            connectionId: body.connectionId,
            fullName: body.repo,
            ...(body.branchPrefix ? { branchPrefix: body.branchPrefix } : {}),
            ...(body.checksSource ? { checksSource: body.checksSource } : {}),
            ...(body.requiredChecks
              ? { requiredChecks: body.requiredChecks }
              : {}),
            ...(body.pollSeconds ? { pollSeconds: body.pollSeconds } : {}),
          }),
        );
        return context.json({ data: linked }, 201);
      },
    );

    git.get(
      '/pullRequests',
      describeRoute({
        tags: ['Studio'],
        summary: 'List pull requests',
        description:
          'Of an issue (`issueId`) or of a repository (`repositoryId`), those the caller may read.',
        operationId: 'studioGitListPullRequests',
        security: PERSON_OR_RUN,
        responses: {
          '200': listResponse(PullRequestSchema),
          ...apiErrorResponses,
        },
      }),
      apiValidator('query', PullListQuery),
      async (context) => {
        const filter = context.req.valid('query');
        const { seesPull } = await reader(context);
        const visible: GitPullRequestView[] = [];
        for (const pull of await service().listPullRequests(filter))
          if (await seesPull(pull)) visible.push(pull);
        return context.json({ data: visible });
      },
    );

    git.get(
      '/pullRequests/:pullRequestId',
      describeRoute({
        tags: ['Studio'],
        summary: 'Get a pull request',
        operationId: 'studioGitGetPullRequest',
        security: PERSON_OR_RUN,
        responses: {
          '200': dataResponse(PullRequestSchema),
          ...apiErrorResponses,
          '404': apiErrorResponse(404),
        },
      }),
      apiValidator('param', PullParams),
      async (context) => {
        const { pullRequestId } = context.req.valid('param');
        return context.json({
          data: await readablePull(context, pullRequestId),
        });
      },
    );

    git.post(
      '/pullRequests/:pullRequestId/refresh',
      describeRoute({
        tags: ['Studio'],
        summary: 'Read a pull request from the code host now',
        operationId: 'studioGitRefreshPullRequest',
        responses: {
          '200': dataResponse(PullRequestSchema),
          ...apiErrorResponses,
          '404': apiErrorResponse(404),
          '503': apiErrorResponse(503, 'When GitHub is unavailable.'),
        },
      }),
      apiValidator('param', PullParams),
      async (context) => {
        personId(context);
        const { pullRequestId } = context.req.valid('param');
        await readablePull(context, pullRequestId);
        return context.json({
          data: await guarded(context, () =>
            service().refreshPullRequest(pullRequestId),
          ),
        });
      },
    );

    git.post(
      '/pullRequests/:pullRequestId/merge',
      describeRoute({
        tags: ['Studio'],
        summary: 'Merge a pull request',
        description:
          'Squash-merges on GitHub after reading the pull request again. Refused (400 `MERGE_BLOCKED`, `metadata.mergeBlocker`) when it is merged, closed, a draft, in conflict or its checks are missing, pending or failed; `force` with a `reason` merges anyway past the checks. People only: the linked issue’s owner, its project lead or an administrator.',
        operationId: 'studioGitMergePullRequest',
        responses: {
          '200': dataResponse(PullRequestSchema),
          ...apiErrorResponses,
          '404': apiErrorResponse(404),
          '503': apiErrorResponse(503, 'When GitHub is unavailable.'),
        },
      }),
      apiValidator('param', PullParams),
      apiValidator('json', MergeBody),
      async (context) => {
        const userId = personId(context);
        const { pullRequestId } = context.req.valid('param');
        const body = context.req.valid('json');
        const pull = await readablePull(context, pullRequestId);
        const viewer = await viewerOf(context);
        let allowed = false;
        if (pull.issueId) {
          const issue = await visibleIssue(viewer, pull.issueId);
          const scope = viewer.permissions.scopes['pm.issues/close'];
          if (issue && scope)
            allowed =
              scope === 'all' ||
              reaches(scope, issue.ownerUserId) ||
              (issue.projectId !== null &&
                reaches(
                  scope,
                  (await projects().projects.get(viewer, issue.projectId)).lead
                    ?.id,
                ));
        } else allowed = await can(context, 'pm.members', 'define-roles');
        if (!allowed)
          throw denied(
            'Only the issue’s owner, its project lead or an administrator merges its pull request.',
          );
        return context.json({
          data: await guarded(context, () =>
            service().mergePullRequest(pullRequestId, {
              byUserId: userId,
              force: body.force,
              reason: body.reason ?? null,
            }),
          ),
        });
      },
    );

    codeLocations.post(
      '/:projectId/codeLocations',
      describeRoute({
        tags: ['Studio'],
        summary: 'Add a repository to a project',
        description:
          'Makes a linked repository one of the project’s working directories (its first, or `primary`, is where runs start) so runs check it out on the issue’s branch.',
        operationId: 'studioAddCodeLocation',
        responses: {
          '201': dataResponse(RepositorySchema),
          ...apiErrorResponses,
          '404': apiErrorResponse(404),
          '409': apiErrorResponse(
            409,
            'When the repository serves the project already.',
          ),
        },
      }),
      apiValidator('param', ProjectParams),
      apiValidator('json', CodeLocationBody),
      async (context) => {
        await requireAdmin(context);
        const { projectId } = context.req.valid('param');
        const body = context.req.valid('json');
        const viewer = await viewerOf(context);
        const attached = await guarded(context, () =>
          service().attachToProject(
            viewer,
            projectId,
            body.repositoryId,
            body.primary ?? false,
          ),
        );
        return context.json({ data: attached }, 201);
      },
    );

    router.route('/git', git);
    router.route('/projects', codeLocations);
    return router;
  },
);
