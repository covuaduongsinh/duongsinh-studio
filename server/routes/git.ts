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
  cliRoute,
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
import {
  agentsToken,
  runIdentityOf,
  type CallerIdentity,
} from '@nocobase/app-plugin-agents/server/tokens';
import { isApiKeySession } from '@nocobase/app-plugin-api-keys/server';
import { OPEN_PR_ACTION } from '../agents/actions.js';
import { ISSUE_BRANCH_PREFIX, ISSUE_SUBJECT } from '../agents/ids.js';
import { FORCEABLE_BLOCKERS } from '../git/pull-state.js';
import { str, type Row } from '../git/rows.js';
import { gitServiceToken } from '../providers/git.js';
import {
  GitError,
  type GitConnectionView,
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

const AppSchema = z
  .object({
    appId: z.string(),
    slug: z.string(),
    htmlUrl: z.string(),
    ownerLogin: z.string().nullable(),
    installUrl: z.string().meta({
      description:
        'Where a person installs the App and picks its repositories.',
    }),
    installationId: z.string().nullable(),
    installationAccount: z.string().nullable(),
    permissionsUrl: z.string().nullable(),
    missingPermissions: z.array(z.string()).meta({
      description:
        'What Studio needs that the installation does not grant, as `name:level`.',
    }),
    webhookUrl: z.string().nullable(),
    lastDeliveryAt: z.string().nullable(),
    lastEvent: z.string().nullable(),
    lastError: z.string().nullable(),
  })
  .meta({ ref: 'StudioGitApp' });

const ConnectionSchema = z
  .object({
    id: z.string(),
    provider: z.enum(['github']),
    kind: z.enum(['token', 'app']),
    name: z.string(),
    account: z.string().nullable(),
    webUrl: z.string(),
    apiBaseUrl: z.string(),
    hasToken: z.boolean().meta({
      description:
        'Whether a token is kept (sealed), or for an App whether it is installed; a token or key is never returned.',
    }),
    webhooks: z.boolean(),
    personalMethods: z.array(z.string()),
    allowPersonalTokens: z.boolean(),
    problems: z.array(z.string()),
    usedBy: z.number().int(),
    app: AppSchema.nullable().meta({
      description:
        'The GitHub App of a connection of kind `app`; never its key or webhook secret.',
    }),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .meta({ ref: 'StudioGitConnection' });

const AppManifestStartSchema = z
  .object({
    connectionId: z.string(),
    postUrl: z.string().meta({
      description:
        'Where the browser posts the form field `manifest` (the JSON below) to create the App on GitHub.',
    }),
    manifest: z.record(z.string(), z.unknown()),
    expiresAt: z.string(),
  })
  .meta({ ref: 'StudioGitAppManifestStart' });

const StartAppManifestBody = z
  .object({
    name: z.string().trim().min(1).max(34).default('Duong Sinh Studio').meta({
      description:
        'The App’s name on GitHub (unique there, at most 34 characters).',
    }),
    organization: z
      .string()
      .regex(/^[\w-]+$/u)
      .max(100)
      .optional()
      .meta({
        description:
          'Create it in this organization; the person’s own account when left out.',
      }),
    apiBaseUrl: z.url().optional(),
  })
  .strict();

const CompleteAppManifestBody = z
  .object({
    code: z.string().min(1).max(200),
    state: z.string().regex(/^[0-9a-f]{48}$/u),
  })
  .strict();

const InstallationBody = z
  .object({
    installationId: z
      .string()
      .regex(/^\d{1,20}$/u)
      .optional()
      .meta({
        description:
          'GitHub’s `installation_id`; the App’s only installation when left out.',
      }),
  })
  .strict();

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
  durationMs: z
    .number()
    .nullable()
    .optional()
    .describe(
      'How long a reported check ran, when both its first and last report are known.',
    ),
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
    autoCompleteDisabled: z.boolean(),
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

const ConnectionChoice = z
  .object({
    id: z.string(),
    provider: z.literal('github'),
    kind: z.string(),
    name: z.string(),
    account: z.string().nullable(),
  })
  .meta({ ref: 'StudioGitConnectionChoice' });

const HostRepository = z
  .object({
    id: z.string(),
    fullName: z.string(),
    defaultBranch: z.string(),
    cloneUrl: z.string(),
    webUrl: z.string(),
    canPush: z.boolean(),
  })
  .meta({ ref: 'StudioGitRepository' });

const AuthorizationSchema = z
  .object({
    connectionId: z.string(),
    login: z.string(),
    method: z.literal('token'),
    connectedAt: z.string(),
  })
  .meta({ ref: 'StudioGitPersonalAuthorization' });

const ResourceSchema = z.object({
  repo: z.string(),
  webUrl: z.string(),
  connection: ConnectionChoice,
  branchRules: z.array(z.string()),
  wakeOnChecks: z.boolean(),
  wakeOnChecksPassed: z.boolean(),
  wakeOnConflict: z.boolean(),
  referenceChecks: z.array(z.string()),
  checksSource: ChecksSource,
  polledAt: z.string().nullable(),
  pollError: z.string().nullable(),
  pollSeconds: z.number(),
  webhookMode: z.literal('connection'),
  hasWebhookSecret: z.boolean(),
  webhookError: z.string().nullable(),
});

const CheckStatus = z.enum(['pending', 'success', 'failure']);

const ReportedCheckSchema = z
  .object({
    repo: z.string(),
    sha: z.string(),
    name: z.string(),
    status: CheckStatus,
    source: z.enum(['ci', 'agent']),
    url: z.string().nullable(),
    summary: z.string().nullable(),
    runId: z.string().nullable(),
    reportedAt: z.string(),
    startedAt: z.string().nullable(),
    completedAt: z.string().nullable(),
    durationMs: z.number().nullable(),
    pullRequests: z.array(z.object({ repo: z.string(), number: z.number() })),
  })
  .meta({ ref: 'StudioReportedCheck' });

const ReportedChecksSchema = z
  .object({
    source: z.enum(['ci', 'agent']).nullable(),
    sha: z.string().nullable(),
    lastReportAt: z.string().nullable(),
    checks: z.array(
      z.object({
        name: z.string(),
        status: CheckStatus,
        url: z.string().nullable(),
        reportedAt: z.string(),
        durationMs: z.number().nullable(),
      }),
    ),
  })
  .meta({ ref: 'StudioRepositoryReportedChecks' });

const CheckMergeSchema = z.object({
  blocker: MergeBlocker.nullable(),
  method: z.literal('squash'),
  headSha: z.string(),
  baseRef: z.string(),
  commitTitle: z.string(),
  failedChecks: z.array(
    z.object({ name: z.string(), url: z.string().nullable() }),
  ),
  referenceFailures: z.array(
    z.object({ name: z.string(), url: z.string().nullable() }),
  ),
  canForce: z.boolean(),
});

const ReportCheckBody = z.object({
  repository: z.string().optional(),
  sha: z.string().optional(),
  branch: z.string().optional(),
  changeRequest: z.number().int().optional(),
  name: z.string().min(1),
  status: CheckStatus.optional(),
  exitCode: z.number().int().optional(),
  url: z.string().optional(),
  summary: z.string().optional(),
});

const ResourceParams = z.object({ resourceId: z.string() });

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

const PullMarksQuery = z.object({
  issueIds: z.string().min(1).meta({
    description: 'Issue ids, comma separated (at most 100).',
  }),
});

/** What one issue's pull requests come to, for a list row: how many, and the state that matters most. */
const PullMarkSchema = z.object({
  count: z.number().int(),
  merged: z.boolean(),
  state: z.enum(['open', 'merged', 'closed']),
  ciState: z.enum(['pending', 'success', 'failure']).nullable(),
  url: z.string(),
});

const PullListQuery = z.object({
  issueId: z
    .string()
    .optional()
    .meta({ description: 'The issue, by id or identifier (`PM-9`).' }),
  repositoryId: z.string().optional(),
});

/** A branch name GitHub takes as a pull request's head or base. */
const BranchName = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[\w./-]+$/u)
  .refine((name) => !name.includes('..') && !name.startsWith('-'), {
    message: 'Not a branch name.',
  });

const OpenPullBody = z
  .object({
    issueId: z.string().min(1).meta({
      description: 'The issue, by id or identifier (`PM-9`).',
    }),
    title: z.string().trim().min(1).max(256),
    body: z.string().max(65_536).default('').meta({
      description:
        'Markdown; on the command line `--body-file <path>` reads it from a file.',
    }),
    base: BranchName.optional().meta({
      description:
        'The branch to merge into; the repository’s default branch when left out.',
    }),
    head: BranchName.optional().meta({
      description: `The branch with the changes; the issue’s branch (\`${ISSUE_BRANCH_PREFIX}<IDENTIFIER>\`) when left out.`,
    }),
    draft: z.boolean().default(false),
    repositoryId: z.string().optional().meta({
      description:
        'One of the repositories of the issue’s project; its primary repository when left out.',
    }),
  })
  .strict();

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

const choiceOf = (connection: GitConnectionView) => ({
  id: connection.id,
  provider: connection.provider,
  kind: connection.kind,
  name: connection.name,
  account: connection.account,
});

const hostRepositoryOf = (repo: {
  readonly id: string;
  readonly fullName: string;
  readonly defaultBranch: string;
  readonly cloneUrl: string;
  readonly webUrl: string;
  readonly canPush: boolean;
}) => ({
  id: repo.id,
  fullName: repo.fullName,
  defaultBranch: repo.defaultBranch,
  cloneUrl: repo.cloneUrl,
  webUrl: repo.webUrl,
  canPush: repo.canPush,
});

const authorizationOf = (row: Row) => ({
  connectionId: str(row.connectionId),
  login: str(row.login),
  method: 'token' as const,
  connectedAt: new Date(row.connectedAt as string | Date).toISOString(),
});

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

    /** Whether the caller holds `studio.git/open-pr` through the agents' gate: a person's own, a run's agent's. */
    const holdsOpenPr = async (context: Context<Env>): Promise<boolean> => {
      if (!container.has(agentsToken)) return true;
      const session = context.get('auth');
      if (!session) return false;
      const keyScope = context.get('authz').identity.keyScope;
      const identity: CallerIdentity = runIdentityOf(session) ?? {
        kind: 'user',
        userId: session.user.id,
        displayName: session.user.name,
        ...(keyScope ? { keyScope } : {}),
      };
      return (await container.resolve(agentsToken).gate.allowed(identity)).has(
        OPEN_PR_ACTION,
      );
    };

    // Connections are for people only; repositories and pull requests also take a run's token (each handler still
    // refuses what only a person does), which `required()` accepts only when the route opts in to scoped credentials.
    for (const path of [
      '/connections',
      '/connections/*',
      '/status',
      '/authorizations',
      '/authorizations/*',
      '/resources',
      '/resources/*',
    ])
      git.use(path, auth.required(), authz.middleware());
    for (const path of ['/checks', '/commitChecks'])
      git.use(path, auth.required({ scopedKeys: true }), authz.middleware());
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

    git.post(
      '/connections/startAppManifest',
      describeRoute({
        tags: ['Studio'],
        summary: 'Start making a GitHub App for Studio',
        description:
          'Answers the manifest the browser posts to GitHub (form field `manifest`) and where to post it. GitHub sends the person back to Settings → Git with a one-time code, valid for an hour.',
        operationId: 'studioGitStartAppManifest',
        ...cliRoute(false),
        responses: {
          '201': dataResponse(AppManifestStartSchema),
          ...apiErrorResponses,
        },
      }),
      apiValidator('json', StartAppManifestBody),
      async (context) => {
        const createdById = await requireAdmin(context);
        const body = context.req.valid('json');
        const started = await guarded(context, () =>
          service().startAppManifest({
            name: body.name,
            organization: body.organization ?? null,
            ...(body.apiBaseUrl ? { apiBaseUrl: body.apiBaseUrl } : {}),
            createdById,
          }),
        );
        return context.json(
          {
            data: {
              connectionId: started.connectionId,
              postUrl: started.postUrl,
              manifest: started.manifest,
              expiresAt: started.expiresAt,
            },
          },
          201,
        );
      },
    );

    git.post(
      '/connections/appManifest/complete',
      describeRoute({
        tags: ['Studio'],
        summary: 'Finish making a GitHub App for Studio',
        description:
          'Trades the code GitHub sent back for the App’s id, private key and webhook secret (sealed, never returned) and adds the App connection. Only the person who started it, once.',
        operationId: 'studioGitCompleteAppManifest',
        ...cliRoute(false),
        responses: {
          '201': dataResponse(ConnectionSchema),
          ...apiErrorResponses,
        },
      }),
      apiValidator('json', CompleteAppManifestBody),
      async (context) => {
        const userId = await requireAdmin(context);
        const body = context.req.valid('json');
        const created = await guarded(context, () =>
          service().completeAppManifest({
            code: body.code,
            state: body.state,
            userId,
          }),
        );
        return context.json({ data: created }, 201);
      },
    );

    git.post(
      '/connections/:connectionId/installation',
      describeRoute({
        tags: ['Studio'],
        summary: 'Record where a GitHub App is installed',
        description:
          'The installation the App connection acts through (GitHub’s `installation_id`, else the App’s only one), with its permissions read again.',
        operationId: 'studioGitSetAppInstallation',
        ...cliRoute(false),
        responses: {
          '200': dataResponse(ConnectionSchema),
          ...apiErrorResponses,
          '404': apiErrorResponse(404),
        },
      }),
      apiValidator('param', ConnectionParams),
      apiValidator('json', InstallationBody),
      async (context) => {
        await requireAdmin(context);
        const { connectionId } = context.req.valid('param');
        const body = context.req.valid('json');
        return context.json({
          data: await guarded(context, () =>
            service().setInstallation(connectionId, body.installationId),
          ),
        });
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
      '/pullRequests/marks',
      describeRoute({
        tags: ['Studio'],
        summary: 'Summarize the pull requests of several issues',
        description:
          'For the issue list: per issue the caller may see, how many pull requests it has, whether one is merged, the state that matters most (open before merged before closed) and that pull request’s checks.',
        operationId: 'studioGitPullRequestMarks',
        responses: {
          '200': dataResponse(z.record(z.string(), PullMarkSchema)),
          ...apiErrorResponses,
        },
      }),
      apiValidator('query', PullMarksQuery),
      async (context) => {
        const { viewer, seesPull } = await reader(context);
        const asked = context.req.valid('query').issueIds.split(',');
        const ids: string[] = [];
        for (const id of [...new Set(asked.map((entry) => entry.trim()))]
          .filter(Boolean)
          .slice(0, 100)) {
          const issue = await visibleIssue(viewer, id);
          if (issue) ids.push(issue.id);
        }
        const marks: Record<
          string,
          {
            count: number;
            merged: boolean;
            state: 'open' | 'merged' | 'closed';
            ciState: 'pending' | 'success' | 'failure' | null;
            url: string;
          }
        > = {};
        if (ids.length > 0)
          for (const pull of await service().listPullRequests({
            issueIds: ids,
          })) {
            if (!pull.issueId || !(await seesPull(pull))) continue;
            const known = marks[pull.issueId];
            const rank = { open: 0, merged: 1, closed: 2 } as const;
            const better = !known || rank[pull.state] < rank[known.state];
            marks[pull.issueId] = {
              count: (known?.count ?? 0) + 1,
              merged: (known?.merged ?? false) || pull.state === 'merged',
              state: better ? pull.state : (known?.state ?? pull.state),
              ciState: better ? pull.ciState : (known?.ciState ?? null),
              url: better ? pull.url : (known?.url ?? pull.url),
            };
          }
        return context.json({ data: marks });
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
        ...cliRoute({
          command: 'pr list',
          flags: {
            issueId: { name: 'issue' },
            repositoryId: { name: 'repository' },
          },
          columns: [
            'repo',
            'number',
            'state',
            'ciState',
            'mergeBlocker',
            'headRef',
            'url',
          ],
          examples: ['pr list --issue PM-9'],
          action: 'pm.issues/view',
        }),
        responses: {
          '200': listResponse(PullRequestSchema),
          ...apiErrorResponses,
        },
      }),
      apiValidator('query', PullListQuery),
      async (context) => {
        const query = context.req.valid('query');
        const { viewer, seesPull } = await reader(context);
        let issueId = query.issueId;
        // An identifier such as `PM-9` names the issue too; one the caller cannot see has no pull request to list.
        if (issueId) {
          const issue = await visibleIssue(viewer, issueId);
          if (!issue) return context.json({ data: [] });
          issueId = issue.id;
        }
        const visible: GitPullRequestView[] = [];
        for (const pull of await service().listPullRequests({
          ...(issueId ? { issueId } : {}),
          ...(query.repositoryId ? { repositoryId: query.repositoryId } : {}),
        }))
          if (await seesPull(pull)) visible.push(pull);
        return context.json({ data: visible });
      },
    );

    git.post(
      '/pullRequests',
      describeRoute({
        tags: ['Studio'],
        summary: 'Open an issue’s pull request',
        description: `Opens a pull request on the code host from the issue’s branch (\`${ISSUE_BRANCH_PREFIX}<IDENTIFIER>\`, which runs check out and push) into the default branch of the issue project’s primary repository, and links it to the issue at once. When a pull request from that branch is open already it is answered (200) instead of a new one (201). Needs \`${OPEN_PR_ACTION}\`, which whoever may edit the issue holds; a run holds it when its agent is given it. Posts nothing on the issue. The branch must be pushed first.`,
        operationId: 'studioGitOpenPullRequest',
        security: PERSON_OR_RUN,
        ...cliRoute({
          command: 'pr open',
          args: ['issueId'],
          flags: {
            issueId: { name: 'issue' },
            title: { alias: 't' },
            body: { contentFile: true, contentFileNonEmpty: true },
            repositoryId: { name: 'repository' },
          },
          examples: [
            'pr open PM-9 --title "Add the dark mode toggle" --body-file pr.md',
          ],
          action: OPEN_PR_ACTION,
        }),
        responses: {
          '200': dataResponse(PullRequestSchema),
          '201': dataResponse(PullRequestSchema),
          ...apiErrorResponses,
          '404': apiErrorResponse(404),
          '503': apiErrorResponse(503, 'When GitHub is unavailable.'),
        },
      }),
      apiValidator('json', OpenPullBody),
      async (context) => {
        const body = context.req.valid('json');
        const viewer = await viewerOf(context);
        const issue = await visibleIssue(viewer, body.issueId);
        if (!issue)
          throw new ApiError({
            status: 'NOT_FOUND',
            reason: 'ISSUE_NOT_FOUND',
            domain: DOMAIN,
            message: `Issue ${body.issueId} does not exist.`,
          });
        const editScope = viewer.permissions.scopes['pm.issues/edit'];
        if (!editScope || editScope === 'none' || !(await holdsOpenPr(context)))
          throw denied(
            'Only someone who may edit the issue opens its pull request.',
          );
        const opened = await guarded(context, () =>
          service().openPullRequest({
            issue: {
              id: issue.id,
              identifier: issue.identifier,
              projectId: issue.projectId,
            },
            title: body.title,
            body: body.body,
            draft: body.draft,
            ...(body.base ? { base: body.base } : {}),
            ...(body.head ? { head: body.head } : {}),
            ...(body.repositoryId ? { repositoryId: body.repositoryId } : {}),
          }),
        );
        const { created, ...pull } = opened;
        return context.json({ data: pull }, created ? 201 : 200);
      },
    );

    git.get(
      '/pullRequests/:pullRequestId',
      describeRoute({
        tags: ['Studio'],
        summary: 'Get a pull request',
        operationId: 'studioGitGetPullRequest',
        security: PERSON_OR_RUN,
        ...cliRoute({ command: 'pr get', action: 'pm.issues/view' }),
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
        ...cliRoute({ command: 'pr refresh' }),
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

    /** Who may decide about a pull request: the linked issue's owner, its project lead or an administrator. */
    const mayDecide = async (
      context: Context<Env>,
      pull: GitPullRequestView,
      action: 'pm.issues/close' | 'pm.issues/edit',
    ): Promise<boolean> => {
      const viewer = await viewerOf(context);
      if (!pull.issueId) return can(context, 'pm.members', 'define-roles');
      const issue = await visibleIssue(viewer, pull.issueId);
      const scope = viewer.permissions.scopes[action];
      if (!issue || !scope) return false;
      return (
        scope === 'all' ||
        reaches(scope, issue.ownerUserId) ||
        (issue.projectId !== null &&
          reaches(
            scope,
            (await projects().projects.get(viewer, issue.projectId)).lead?.id,
          ))
      );
    };

    const decidablePull = async (
      context: Context<Env>,
      id: string,
      action: 'pm.issues/close' | 'pm.issues/edit',
    ): Promise<GitPullRequestView> => {
      const pull = await readablePull(context, id);
      if (!(await mayDecide(context, pull, action)))
        throw denied(
          'Only the issue’s owner, its project lead or an administrator decides this.',
        );
      return pull;
    };

    /** A project manager of one of the repository's projects, or an administrator. */
    const requireRepositoryManager = async (
      context: Context<Env>,
      repository: GitRepositoryView,
    ): Promise<void> => {
      if (await can(context, 'pm.members', 'define-roles')) return;
      const viewer = await viewerOf(context);
      for (const link of repository.projects) {
        const access = await projects().projects.accessTo(viewer, {
          projectId: link.projectId,
        });
        if (access?.manage === true) return;
      }
      throw denied('A manager of the repository’s project changes this.');
    };

    /** A repository as `git/resources/{id}` answers it. */
    const resourceOf = async (repository: GitRepositoryView) => {
      const connection = await service().getConnection(repository.connectionId);
      return {
        repo: repository.repo,
        webUrl: repository.webUrl,
        connection: {
          id: connection.id,
          provider: connection.provider,
          kind: connection.kind,
          name: connection.name,
          account: connection.account,
        },
        branchRules: [`${repository.branchPrefix}*`],
        wakeOnChecks: false,
        wakeOnChecksPassed: false,
        wakeOnConflict: false,
        referenceChecks: repository.referenceChecks,
        checksSource: repository.checksSource,
        polledAt: repository.polledAt,
        pollError: repository.pollError,
        pollSeconds: repository.pollSeconds,
        webhookMode: 'connection' as const,
        hasWebhookSecret: false,
        webhookError: null,
      };
    };

    const seenRepository = async (
      context: Context<Env>,
      id: string,
    ): Promise<GitRepositoryView> => {
      const repository = await guarded(context, () =>
        service().getRepository(id),
      );
      // For whoever sees one of its projects; reading agents is not enough here.
      const viewer = await viewerOf(context);
      let seen = await can(context, 'pm.members', 'define-roles');
      for (const link of repository.projects) {
        if (seen) break;
        const access = await projects().projects.accessTo(viewer, {
          projectId: link.projectId,
        });
        seen = access?.visible === true;
      }
      if (!seen)
        throw new ApiError({
          status: 'NOT_FOUND',
          reason: 'GIT_REPOSITORY_NOT_FOUND',
          domain: DOMAIN,
          message: 'No such repository.',
        });
      return repository;
    };

    git.get(
      '/status',
      describeRoute({
        tags: ['Studio'],
        summary: 'Whether a code host is connected',
        description:
          'For anyone signed in: whether any connection to a code host exists, the connections to pick from, and whether the caller manages them.',
        operationId: 'studioGitStatus',
        ...cliRoute({ command: 'git status' }),
        responses: {
          '200': dataResponse(
            z.object({
              enabled: z.boolean(),
              connections: z.array(ConnectionChoice),
              canManage: z.boolean(),
            }),
          ),
          ...apiErrorResponses,
        },
      }),
      async (context) => {
        const connections = await service().listConnections();
        return context.json({
          data: {
            enabled: connections.length > 0,
            connections: connections.map(choiceOf),
            canManage: await can(context, 'pm.members', 'define-roles'),
          },
        });
      },
    );

    git.patch(
      '/connections/:connectionId',
      describeRoute({
        tags: ['Studio'],
        summary: 'Rename a connection or replace its token',
        description:
          'For whoever manages the connections. A field left out stays; a new token is checked on the host first and never returned.',
        operationId: 'studioGitUpdateConnection',
        ...cliRoute({ command: 'git connection update' }),
        responses: {
          '200': dataResponse(ConnectionSchema),
          ...apiErrorResponses,
          '404': apiErrorResponse(404),
        },
      }),
      apiValidator('param', ConnectionParams),
      apiValidator(
        'json',
        z.object({
          name: z.string().trim().min(1).max(100).optional(),
          token: z.string().trim().min(1).max(1_000).optional(),
        }),
      ),
      async (context) => {
        await requireAdmin(context);
        const { connectionId } = context.req.valid('param');
        const { name, token } = context.req.valid('json');
        return context.json({
          data: await guarded(context, () =>
            service().updateConnection(connectionId, {
              ...(name ? { name } : {}),
              ...(token ? { token } : {}),
            }),
          ),
        });
      },
    );

    git.get(
      '/connections/:connectionId/usage',
      describeRoute({
        tags: ['Studio'],
        summary: 'What goes through a connection',
        description:
          'For whoever manages the connections: the project repositories linked through it. Reads no secret.',
        operationId: 'studioGitConnectionUsage',
        ...cliRoute({ command: 'git connection usage' }),
        responses: {
          '200': dataResponse(
            z.array(
              z.object({
                resourceId: z.string(),
                projectId: z.string(),
                projectName: z.string(),
                repo: z.string(),
              }),
            ),
          ),
          ...apiErrorResponses,
          '404': apiErrorResponse(404),
        },
      }),
      apiValidator('param', ConnectionParams),
      async (context) => {
        await requireAdmin(context);
        const { connectionId } = context.req.valid('param');
        const viewer = await viewerOf(context);
        const repositories = await guarded(context, () =>
          service().connectionUsage(connectionId),
        );
        const data = [];
        for (const repository of repositories)
          for (const link of repository.projects) {
            const access = await projects().projects.accessTo(viewer, {
              projectId: link.projectId,
            });
            if (access?.visible !== true) continue;
            data.push({
              resourceId: repository.id,
              projectId: link.projectId,
              projectName: (
                await projects().projects.get(viewer, link.projectId)
              ).name,
              repo: repository.repo,
            });
          }
        return context.json({ data, meta: { total: data.length } });
      },
    );

    git.get(
      '/connections/:connectionId/repositories',
      describeRoute({
        tags: ['Studio'],
        summary: 'What a connection reaches on the code host',
        description:
          'For whoever manages the connections; read live from the code host, narrowed by name with `q`. `meta.nextPageToken` is present while there are more.',
        operationId: 'studioGitHostRepositories',
        ...cliRoute({ command: 'git repo list' }),
        responses: {
          '200': dataResponse(z.array(HostRepository)),
          ...apiErrorResponses,
          '404': apiErrorResponse(404),
        },
      }),
      apiValidator('param', ConnectionParams),
      apiValidator(
        'query',
        z.object({
          q: z.string().optional(),
          pageToken: z.coerce.number().int().positive().optional(),
        }),
      ),
      async (context) => {
        await requireAdmin(context);
        const { connectionId } = context.req.valid('param');
        const { q, pageToken } = context.req.valid('query');
        const page = pageToken ?? 1;
        const { items, more } = await guarded(context, () =>
          service().hostRepositories(connectionId, {
            page,
            ...(q ? { q } : {}),
          }),
        );
        return context.json({
          data: items.map(hostRepositoryOf),
          meta: more ? { nextPageToken: String(page + 1) } : {},
        });
      },
    );

    git.post(
      '/connections/:connectionId/repositories',
      describeRoute({
        tags: ['Studio'],
        summary: 'Create a repository on the code host',
        description:
          'For whoever manages the connections. `empty` creates it without an initial commit. Under a personal GitHub account this uses the caller’s own token (400 `GIT_PERSONAL_TOKEN_REQUIRED` until they connect one); an App’s token reaches only organizations.',
        operationId: 'studioGitCreateRepository',
        ...cliRoute({ command: 'git repo create' }),
        responses: {
          '201': dataResponse(z.object({ repo: HostRepository })),
          ...apiErrorResponses,
          '404': apiErrorResponse(404),
        },
      }),
      apiValidator('param', ConnectionParams),
      apiValidator(
        'json',
        z.object({
          owner: z.string().min(1).optional(),
          name: z.string().min(1).max(100),
          private: z.boolean(),
          description: z.string().nullable().optional(),
          empty: z.boolean().optional(),
        }),
      ),
      async (context) => {
        const userId = await requireAdmin(context);
        const { connectionId } = context.req.valid('param');
        const body = context.req.valid('json');
        const repo = await guarded(context, () =>
          service().createRepository(userId, connectionId, {
            name: body.name,
            private: body.private,
            ...(body.owner ? { owner: body.owner } : {}),
            ...(body.description !== undefined
              ? { description: body.description }
              : {}),
            ...(body.empty !== undefined ? { empty: body.empty } : {}),
          }),
        );
        return context.json({ data: { repo: hostRepositoryOf(repo) } }, 201);
      },
    );

    git.get(
      '/authorizations',
      describeRoute({
        tags: ['Studio'],
        summary: 'The connections you connected your own account through',
        description:
          'For the signed-in person: each connection, how they may connect (a personal token), and whether they did. The token is never sent back.',
        operationId: 'studioGitListAuthorizations',
        ...cliRoute({ command: 'git authorization list' }),
        responses: {
          '200': dataResponse(z.object({ hosts: z.array(z.unknown()) })),
          ...apiErrorResponses,
        },
      }),
      async (context) => {
        const userId = personId(context);
        const { connections, rows } =
          await service().listAuthorizations(userId);
        return context.json({
          data: {
            hosts: connections.map((connection) => {
              const row = rows.find(
                (item) => str(item.connectionId) === connection.id,
              );
              return {
                connection: choiceOf(connection),
                methods: ['token'],
                authorization: row ? authorizationOf(row) : null,
              };
            }),
          },
        });
      },
    );

    git.post(
      '/authorizations/:connectionId/useToken',
      describeRoute({
        tags: ['Studio'],
        summary: 'Connect your own account with a token',
        description:
          'Checks the token by calling the host as it, then stores it sealed as the caller’s authorization. The token is never sent back.',
        operationId: 'studioGitUseToken',
        ...cliRoute({ command: 'git authorization use-token' }),
        responses: {
          '200': dataResponse(AuthorizationSchema),
          ...apiErrorResponses,
          '404': apiErrorResponse(404),
        },
      }),
      apiValidator('param', ConnectionParams),
      apiValidator('json', z.object({ token: z.string().trim().min(1) })),
      async (context) => {
        const userId = personId(context);
        const { connectionId } = context.req.valid('param');
        const { token } = context.req.valid('json');
        const stored = await guarded(context, () =>
          service().useToken(userId, connectionId, token),
        );
        return context.json({
          data: {
            connectionId,
            login: stored.login,
            method: 'token' as const,
            connectedAt: stored.connectedAt,
          },
        });
      },
    );

    git.delete(
      '/authorizations/:connectionId',
      describeRoute({
        tags: ['Studio'],
        summary: 'Forget your authorization',
        operationId: 'studioGitForgetAuthorization',
        ...cliRoute({ command: 'git authorization delete' }),
        responses: {
          '204': { description: 'Forgotten.' },
          ...apiErrorResponses,
        },
      }),
      apiValidator('param', ConnectionParams),
      async (context) => {
        const userId = personId(context);
        await service().forgetAuthorization(
          userId,
          context.req.valid('param').connectionId,
        );
        return context.body(null, 204);
      },
    );

    git.get(
      '/resources/:resourceId',
      describeRoute({
        tags: ['Studio'],
        summary: 'Read a repository’s settings',
        description:
          'For whoever sees the project. `wakeOn*` stay false: Studio wakes agents through autopilot, not by these rules. No secret is sent back.',
        operationId: 'studioGitGetResource',
        ...cliRoute({ command: 'git resource get' }),
        responses: {
          '200': dataResponse(ResourceSchema),
          ...apiErrorResponses,
          '404': apiErrorResponse(404),
        },
      }),
      apiValidator('param', ResourceParams),
      async (context) =>
        context.json({
          data: await resourceOf(
            await seenRepository(
              context,
              context.req.valid('param').resourceId,
            ),
          ),
        }),
    );

    git.patch(
      '/resources/:resourceId',
      describeRoute({
        tags: ['Studio'],
        summary: 'Change a repository’s settings',
        description:
          'For the project’s managers. `branchRules` takes one rule, `<prefix>*`. Setting a `wakeOn*` rule answers 400 `WAKE_RULES_UNAVAILABLE`: Studio wakes agents through autopilot.',
        operationId: 'studioGitUpdateResource',
        ...cliRoute({ command: 'git resource update' }),
        responses: {
          '200': dataResponse(ResourceSchema),
          ...apiErrorResponses,
          '404': apiErrorResponse(404),
        },
      }),
      apiValidator('param', ResourceParams),
      apiValidator(
        'json',
        z.object({
          checksSource: ChecksSource.optional(),
          referenceChecks: z.array(z.string().min(1)).optional(),
          branchRules: z.array(z.string().min(1)).optional(),
          wakeOnChecks: z.boolean().optional(),
          wakeOnChecksPassed: z.boolean().optional(),
          wakeOnConflict: z.boolean().optional(),
        }),
      ),
      async (context) => {
        const repository = await seenRepository(
          context,
          context.req.valid('param').resourceId,
        );
        await requireRepositoryManager(context, repository);
        const body = context.req.valid('json');
        if (
          body.wakeOnChecks !== undefined ||
          body.wakeOnChecksPassed !== undefined ||
          body.wakeOnConflict !== undefined
        )
          throw new ApiError({
            status: 'INVALID_ARGUMENT',
            reason: 'WAKE_RULES_UNAVAILABLE',
            domain: DOMAIN,
            message:
              'Studio wakes agents through autopilot, not by these rules.',
          });
        let branchPrefix: string | undefined;
        if (body.branchRules) {
          const [rule] = body.branchRules;
          if (body.branchRules.length !== 1 || !rule?.endsWith('*'))
            throw new ApiError({
              status: 'INVALID_ARGUMENT',
              reason: 'BRANCH_RULE_UNSUPPORTED',
              domain: DOMAIN,
              message: 'branchRules takes one rule of the form `<prefix>*`.',
            });
          branchPrefix = rule.slice(0, -1);
        }
        return context.json({
          data: await resourceOf(
            await guarded(context, () =>
              service().updateRepository(repository.id, {
                ...(body.checksSource
                  ? { checksSource: body.checksSource }
                  : {}),
                ...(body.referenceChecks
                  ? { referenceChecks: body.referenceChecks }
                  : {}),
                ...(branchPrefix ? { branchPrefix } : {}),
              }),
            ),
          ),
        });
      },
    );

    git.get(
      '/resources/:resourceId/reportedChecks',
      describeRoute({
        tags: ['Studio'],
        summary: 'The checks reported on a repository last',
        description:
          'For whoever sees the project. The commit an external CI (`ci`) or agents’ runs (`agent`) reported checks on last, with each check’s latest report; the repository’s own source when `source` is left out. Empty while nothing was reported.',
        operationId: 'studioGitReportedChecks',
        ...cliRoute({ command: 'git resource reported-checks' }),
        responses: {
          '200': dataResponse(ReportedChecksSchema),
          ...apiErrorResponses,
          '404': apiErrorResponse(404),
        },
      }),
      apiValidator('param', ResourceParams),
      apiValidator(
        'query',
        z.object({ source: z.enum(['ci', 'agent']).optional() }),
      ),
      async (context) => {
        const repository = await seenRepository(
          context,
          context.req.valid('param').resourceId,
        );
        return context.json({
          data: await service().reportedChecksOf(
            repository.id,
            context.req.valid('query').source ?? null,
          ),
        });
      },
    );

    git.post(
      '/resources/:resourceId/repairWebhook',
      describeRoute({
        tags: ['Studio'],
        summary: 'Repair a repository’s own webhook',
        description:
          'For project managers, on a host where Studio creates one webhook per repository. On GitHub webhooks belong to the App, so this answers 400 `WEBHOOK_NOT_PER_REPOSITORY`.',
        operationId: 'studioGitRepairWebhook',
        ...cliRoute({ command: 'git resource repair-webhook' }),
        responses: {
          '200': dataResponse(ResourceSchema),
          ...apiErrorResponses,
          '404': apiErrorResponse(404),
        },
      }),
      apiValidator('param', ResourceParams),
      async (context) => {
        const repository = await seenRepository(
          context,
          context.req.valid('param').resourceId,
        );
        await requireRepositoryManager(context, repository);
        throw new ApiError({
          status: 'INVALID_ARGUMENT',
          reason: 'WEBHOOK_NOT_PER_REPOSITORY',
          domain: DOMAIN,
          message:
            'On GitHub, webhooks belong to the App, not to a repository.',
        });
      },
    );

    git.post(
      '/checks',
      describeRoute({
        tags: ['Studio'],
        summary: 'Report a check on a commit',
        description:
          'For a repository whose checks are reported rather than read from its code host: its one check source decides who may report. "External CI" takes an organization API key with `studio.checks`; "Agent self-check" takes an agent’s run on an issue, for its project’s repositories and only the head of a pull request linked to that issue. Any other source is refused (`CHECKS_FROM_HOST`, `CHECKS_FROM_EXTERNAL_CI`, `CHECKS_FROM_AGENT`). The latest report of a name on a commit replaces the one before, and the reports are the checks of the open pull requests at that head.',
        operationId: 'studioGitReportCheck',
        security: PERSON_OR_RUN,
        ...cliRoute({ command: 'check report' }),
        responses: {
          '201': dataResponse(ReportedCheckSchema),
          ...apiErrorResponses,
          '404': apiErrorResponse(404),
        },
      }),
      apiValidator('json', ReportCheckBody),
      async (context) => {
        const body = context.req.valid('json');
        const session = context.get('auth');
        const run = runIdentityOf(session);
        const refuse = (reason: string, message: string) =>
          new ApiError({
            status: 'PERMISSION_DENIED',
            reason,
            domain: DOMAIN,
            message,
          });
        const all = await service().listRepositories();
        let repository = body.repository
          ? all.find((item) => item.repo === body.repository)
          : undefined;
        let issueId: string | null = null;
        if (run?.run) {
          if (run.run.run.subjectKind !== ISSUE_SUBJECT)
            throw refuse(
              'CHECKS_FROM_AGENT',
              'Only a run on an issue reports.',
            );
          const runIssueId = run.run.run.subjectId;
          issueId = runIssueId;
          const viewer = await viewerOf(context);
          const issue = await visibleIssue(viewer, runIssueId);
          if (!issue?.projectId)
            throw refuse(
              'CHECKS_FROM_AGENT',
              'The run’s issue has no project.',
            );
          const projectId = issue.projectId;
          repository ??=
            (await service().primaryRepository(projectId)) ?? undefined;
          if (
            repository &&
            !repository.projects.some((link) => link.projectId === projectId)
          )
            throw refuse(
              'CHECKS_FROM_AGENT',
              'The repository does not serve the issue’s project.',
            );
        }
        if (!repository)
          throw new ApiError({
            status: 'NOT_FOUND',
            reason: 'GIT_REPOSITORY_NOT_FOUND',
            domain: DOMAIN,
            message: 'No such repository.',
          });
        if (repository.checksSource === 'host')
          throw refuse(
            'CHECKS_FROM_HOST',
            'This repository’s checks are read from its code host.',
          );
        if (repository.checksSource === 'external') {
          if (
            run?.run ||
            !session ||
            !isApiKeySession(session, context.req.raw.headers) ||
            !(await can(context, 'studio.checks', 'report'))
          )
            throw refuse(
              'CHECKS_FROM_EXTERNAL_CI',
              'This repository takes checks from its CI’s organization API key.',
            );
        } else if (!run?.run)
          throw refuse(
            'CHECKS_FROM_AGENT',
            'This repository takes checks from agents’ runs.',
          );
        const repositoryId = repository.id;
        const linked = issueId
          ? (await service().listPullRequests({ issueId })).filter(
              (pull) => pull.repositoryId === repositoryId,
            )
          : [];
        const sha =
          (await guarded(context, () =>
            service().resolveCommit(repositoryId, {
              ...(body.changeRequest !== undefined
                ? { changeRequest: body.changeRequest }
                : {}),
              ...(body.sha ? { sha: body.sha } : {}),
              ...(body.branch ? { branch: body.branch } : {}),
            }),
          )) ?? linked[0]?.headSha;
        if (!sha)
          throw new ApiError({
            status: 'INVALID_ARGUMENT',
            reason: 'CHECK_COMMIT_REQUIRED',
            domain: DOMAIN,
            message: 'Name the commit: changeRequest, sha or branch.',
          });
        if (run?.run && !linked.some((pull) => pull.headSha === sha))
          throw refuse(
            'CHECKS_FROM_AGENT',
            'A run reports only the head of a pull request linked to its issue.',
          );
        const status =
          body.status ??
          (body.exitCode === undefined
            ? 'pending'
            : body.exitCode === 0
              ? 'success'
              : 'failure');
        return context.json(
          {
            data: await service().reportCheck({
              repositoryId,
              sha,
              name: body.name,
              status,
              source: run?.run ? 'agent' : 'ci',
              url: body.url ?? null,
              summary: body.summary ?? null,
              runId: run?.run ? run.run.run.id : null,
            }),
          },
          201,
        );
      },
    );

    git.get(
      '/commitChecks',
      describeRoute({
        tags: ['Studio'],
        summary: 'A commit’s checks now',
        description:
          'For whoever sees the issue and its project repository. Name a repository belonging to that project and exactly one 7–40 character hexadecimal SHA or branch; the returned full SHA pins the result.',
        operationId: 'studioGitCommitChecks',
        security: PERSON_OR_RUN,
        ...cliRoute({ command: 'commit checks' }),
        responses: { '200': dataResponse(z.unknown()), ...apiErrorResponses },
      }),
      apiValidator(
        'query',
        z
          .object({
            issueId: z.string().min(1),
            resourceId: z.string().min(1),
            sha: z
              .string()
              .regex(/^[0-9a-f]{7,40}$/iu)
              .optional(),
            branch: z.string().min(1).optional(),
          })
          .refine((value) => Boolean(value.sha) !== Boolean(value.branch), {
            message: 'Name exactly one of sha and branch.',
          }),
      ),
      async (context) => {
        const query = context.req.valid('query');
        const viewer = await viewerOf(context);
        const issue = await visibleIssue(viewer, query.issueId);
        const repository = await guarded(context, () =>
          service().getRepository(query.resourceId),
        );
        if (
          !issue?.projectId ||
          !repository.projects.some(
            (link) => link.projectId === issue.projectId,
          )
        )
          throw new ApiError({
            status: 'NOT_FOUND',
            reason: 'GIT_REPOSITORY_NOT_FOUND',
            domain: DOMAIN,
            message: 'No such repository on this issue’s project.',
          });
        const sha = await guarded(context, () =>
          service().resolveCommit(repository.id, {
            ...(query.sha ? { sha: query.sha } : {}),
            ...(query.branch ? { branch: query.branch } : {}),
          }),
        );
        if (!sha)
          throw new ApiError({
            status: 'NOT_FOUND',
            reason: 'GIT_COMMIT_NOT_FOUND',
            domain: DOMAIN,
            message: 'No such branch.',
          });
        return context.json({
          data: await guarded(context, () =>
            service().commitChecks(repository.id, sha),
          ),
        });
      },
    );

    git.get(
      '/pullRequests/:pullRequestId/checks',
      describeRoute({
        tags: ['Studio'],
        summary: 'A pull request’s failed checks',
        description:
          'For whoever sees the issue. The failed checks of the pull request’s head as Studio last read them, each with its page on the host.',
        operationId: 'studioGitPullChecks',
        security: PERSON_OR_RUN,
        ...cliRoute({ command: 'pr checks' }),
        responses: {
          '200': dataResponse(
            z.object({
              headSha: z.string(),
              checks: z.array(
                z.object({
                  name: z.string(),
                  conclusion: z.string(),
                  url: z.string().nullable(),
                  reference: z.boolean(),
                }),
              ),
            }),
          ),
          ...apiErrorResponses,
          '404': apiErrorResponse(404),
        },
      }),
      apiValidator('param', PullParams),
      async (context) => {
        const pull = await readablePull(
          context,
          context.req.valid('param').pullRequestId,
        );
        const repository = await service().getRepository(pull.repositoryId);
        return context.json({
          data: {
            headSha: pull.headSha,
            checks: pull.checks
              .filter((check) => check.outcome === 'failure')
              .map((check) => ({
                name: check.name,
                conclusion: check.conclusion ?? 'failure',
                url: check.url,
                reference: repository.referenceChecks.includes(check.name),
              })),
          },
        });
      },
    );

    git.patch(
      '/pullRequests/:pullRequestId',
      describeRoute({
        tags: ['Studio'],
        summary: 'Say whether a merge moves the issue on',
        description:
          'For whoever may edit the issue. `autoCompleteDisabled` says whether the pull request counts for moving the issue on when merged.',
        operationId: 'studioGitUpdatePull',
        ...cliRoute({ command: 'pr update' }),
        responses: {
          '200': dataResponse(PullRequestSchema),
          ...apiErrorResponses,
          '404': apiErrorResponse(404),
        },
      }),
      apiValidator('param', PullParams),
      apiValidator('json', z.object({ autoCompleteDisabled: z.boolean() })),
      async (context) => {
        const { pullRequestId } = context.req.valid('param');
        await decidablePull(context, pullRequestId, 'pm.issues/edit');
        return context.json({
          data: await guarded(context, () =>
            service().setAutoComplete(
              pullRequestId,
              context.req.valid('json').autoCompleteDisabled,
            ),
          ),
        });
      },
    );

    for (const [path, operationId, summary, command] of [
      [
        '/pullRequests/:pullRequestId',
        'studioGitUnlinkPull',
        'Take a pull request off its issue',
        'pr unlink',
      ],
      [
        '/pullRequests/:pullRequestId/suggestion',
        'studioGitDismissSuggestion',
        'Dismiss a suggested pull request',
        'pr suggestion dismiss',
      ],
    ] as const)
      git.delete(
        path,
        describeRoute({
          tags: ['Studio'],
          summary,
          description:
            'For whoever may edit the issue. Polling does not link it back.',
          operationId,
          ...cliRoute({ command }),
          responses: {
            '204': { description: 'Unlinked.' },
            ...apiErrorResponses,
            '404': apiErrorResponse(404),
          },
        }),
        apiValidator('param', PullParams),
        async (context) => {
          const { pullRequestId } = context.req.valid('param');
          await decidablePull(context, pullRequestId, 'pm.issues/edit');
          await guarded(context, () =>
            service().unlinkPullRequest(pullRequestId),
          );
          return context.body(null, 204);
        },
      );

    git.post(
      '/pullRequests/:pullRequestId/checkMerge',
      describeRoute({
        tags: ['Studio'],
        summary: 'Ask whether a pull request can merge now',
        description:
          'For whoever may merge. Reads the pull request from the code host now and stores what it read; `headSha` is what `merge` expects back.',
        operationId: 'studioGitCheckMerge',
        ...cliRoute({ command: 'pr check-merge' }),
        responses: {
          '200': dataResponse(CheckMergeSchema),
          ...apiErrorResponses,
        },
      }),
      apiValidator('param', PullParams),
      async (context) => {
        const { pullRequestId } = context.req.valid('param');
        await decidablePull(context, pullRequestId, 'pm.issues/close');
        const pull = await guarded(context, () =>
          service().refreshPullRequest(pullRequestId),
        );
        const repository = await service().getRepository(pull.repositoryId);
        const failed = pull.checks.filter(
          (check) => check.outcome === 'failure',
        );
        const isReference = (name: string) =>
          repository.referenceChecks.includes(name);
        return context.json({
          data: {
            blocker: pull.mergeBlocker,
            method: 'squash' as const,
            headSha: pull.headSha,
            baseRef: pull.baseRef,
            commitTitle: `${pull.title} (#${pull.number})`,
            failedChecks: failed
              .filter((check) => !isReference(check.name))
              .map((check) => ({ name: check.name, url: check.url })),
            referenceFailures: failed
              .filter((check) => isReference(check.name))
              .map((check) => ({ name: check.name, url: check.url })),
            canForce:
              pull.mergeBlocker !== null &&
              FORCEABLE_BLOCKERS.has(pull.mergeBlocker),
          },
        });
      },
    );

    git.post(
      '/pullRequests/:pullRequestId/markMerged',
      describeRoute({
        tags: ['Studio'],
        summary: 'Record a pull request merged outside Studio',
        description:
          'For whoever may merge. Records it merged without the code host.',
        operationId: 'studioGitMarkMerged',
        ...cliRoute({ command: 'pr mark-merged' }),
        responses: {
          '200': dataResponse(PullRequestSchema),
          ...apiErrorResponses,
        },
      }),
      apiValidator('param', PullParams),
      async (context) => {
        const userId = personId(context);
        const { pullRequestId } = context.req.valid('param');
        await decidablePull(context, pullRequestId, 'pm.issues/close');
        return context.json({
          data: await guarded(context, () =>
            service().markMerged(pullRequestId, userId),
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
        ...cliRoute({ command: 'pr merge' }),
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
