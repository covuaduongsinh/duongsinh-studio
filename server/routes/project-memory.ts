import { authenticationToken, type AuthEnv } from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization';
import {
  projectsAccessToken,
  projectsToken,
  type Projects,
  type Viewer,
} from '@nocobase/app-plugin-projects/server/tokens';
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
import type { GitRepositoryView } from '../git/service.js';
import { MEMORY_TYPES } from '../memory/parse.js';
import { MemoryError, type RepositoryMemory } from '../memory/service.js';
import { gitServiceToken } from '../providers/git.js';
import { memoryServiceToken } from '../providers/memory.js';

type Env = AuthEnv & AuthorizationEnv;

const DOMAIN = 'studio';
const PERSON_OR_RUN: Record<string, string[]>[] = [
  { cookieAuth: [] },
  { apiKeyAuth: [] },
  { runToken: [] },
];
/** Reading memory is reading the project: what `pm.projects/view` lets an agent do. */
const VIEW_ACTION = 'pm.projects/view';

const Unavailable = z
  .enum(['noToken', 'tokenRejected', 'unreachable', 'hostUnavailable'])
  .nullable()
  .meta({ description: 'Why the repository could not be read now; null when it could.' });

const MemorySummarySchema = z.object({
  path: z.string(),
  slug: z.string(),
  sha: z.string(),
  name: z.string(),
  description: z.string(),
  type: z.enum(MEMORY_TYPES).nullable(),
  modified: z.string().nullable(),
  size: z.number().int(),
  oversize: z.boolean().meta({ description: 'Larger than 4 KB, the limit memories keep to.' }),
  problems: z.array(z.string()),
  webUrl: z.string(),
});

const ProjectRef = z.object({ id: z.string(), name: z.string() });

const RepositoryMemorySchema = z
  .object({
    project: ProjectRef,
    repositoryId: z.string(),
    repo: z.string(),
    provider: z.enum(['github']),
    branch: z.string(),
    commitSha: z.string().nullable(),
    ref: z.string().nullable().meta({ description: '`main@1a2b3c4`.' }),
    checkedAt: z.string().nullable(),
    limit: z.number().int(),
    total: z.number().int(),
    webUrl: z.string(),
    memories: z.array(MemorySummarySchema),
    unavailable: Unavailable,
  })
  .meta({ ref: 'StudioProjectMemory' });

const ProjectMemoryListSchema = z
  .object({
    project: ProjectRef,
    repos: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        provider: z.enum(['github']),
        defaultBranch: z.string(),
        memories: z.number().int(),
        ref: z.string().nullable(),
        checkedAt: z.string().nullable(),
        unavailable: Unavailable,
      }),
    ),
  })
  .meta({ ref: 'StudioProjectMemoryProject' });

const MemoryFileSchema = MemorySummarySchema.extend({
  body: z.string(),
  ref: z.string(),
  commitSha: z.string(),
}).meta({ ref: 'StudioProjectMemoryFile' });

const RepoParams = z.object({ projectId: z.string(), repoId: z.string() });
const ListQuery = z.object({ projectId: z.string().optional() });
const ReadQuery = z.object({
  fresh: z
    .enum(['true', 'false'])
    .optional()
    .meta({ description: 'Ask GitHub now instead of within the last minute.' }),
});
const FileQuery = z.object({
  path: z.string().min(1).max(300).meta({ description: '`.nb-studio/memory/<slug>.md`.' }),
});

const notFound = (message: string) =>
  new ApiError({ status: 'NOT_FOUND', reason: 'PROJECT_MEMORY_NOT_FOUND', domain: DOMAIN, message });

/**
 * Project memory (`/api/projectMemory`, the Studio demo's contract): the `.nb-studio/memory/*.md` files of each
 * project's repositories on their default branch, for whoever sees the project, a person or a run.
 */
export const projectMemoryRoutes: AppApiRouteContribution<Application> = defineApiRoutes((app) => {
  const router = new Hono<Env>();
  const { container } = app;
  const auth = container.resolve(authenticationToken);
  const authz = container.resolve(authorizationToken);
  const git = () => container.resolve(gitServiceToken);
  const memory = () => container.resolve(memoryServiceToken);
  const projects = (): Projects => container.resolve(projectsToken);

  const viewerOf = async (context: Context<Env>): Promise<Viewer> => {
    const session = context.get('auth');
    if (!session)
      throw new ApiError({ status: 'PERMISSION_DENIED', reason: 'ACCESS_DENIED', domain: DOMAIN, message: 'Sign in first.' });
    const identity = context.get('authz').identity;
    const scoped = identity.keyScope?.objects('pm.projects') ?? 'all';
    return {
      userId: session.user.id,
      actor: { type: 'user', id: session.user.id },
      permissions: await container.resolve(projectsAccessToken).permissionsOf(identity),
      ...(scoped === 'all' ? {} : { projectIds: scoped }),
    };
  };

  /** The visible projects among `ids`, with their names. */
  const visibleProjects = async (viewer: Viewer, ids: readonly string[]) =>
    ids.length === 0 ? new Map<string, { name: string }>() : await projects().projects.targetNames(viewer, 'project', ids);

  const repositoryIn = async (
    context: Context<Env>,
    projectId: string,
    repoId: string,
  ): Promise<{ project: { id: string; name: string }; repository: GitRepositoryView }> => {
    const viewer = await viewerOf(context);
    const project = (await visibleProjects(viewer, [projectId])).get(projectId);
    if (!project) throw notFound(`Project ${projectId} does not exist.`);
    const repository = (await git().listRepositories()).find(
      (candidate) => candidate.id === repoId && candidate.projects.some((link) => link.projectId === projectId),
    );
    if (!repository) throw notFound(`Repository ${repoId} does not serve project ${projectId}.`);
    return { project: { id: projectId, name: project.name }, repository };
  };

  const guarded = async <T>(work: () => Promise<T>): Promise<T> => {
    try {
      return await work();
    } catch (error) {
      if (error instanceof MemoryError)
        throw new ApiError({ status: error.status, reason: error.reason, domain: DOMAIN, message: error.message, cause: error });
      throw error;
    }
  };

  for (const path of ['/', '/*']) router.use(path, auth.required({ scopedKeys: true }), authz.middleware());

  router.get(
    '/',
    describeRoute({
      tags: ['Studio'],
      summary: 'List the projects’ repositories with project memory',
      description: 'The projects the caller sees that have repositories, each repository with how many memories its default branch keeps.',
      operationId: 'studioListProjectMemory',
      security: PERSON_OR_RUN,
      ...cliRoute({ command: 'memory list', flags: { projectId: { name: 'project' } }, action: VIEW_ACTION }),
      responses: { '200': listResponse(ProjectMemoryListSchema), ...apiErrorResponses },
    }),
    apiValidator('query', ListQuery),
    async (context) => {
      const { projectId } = context.req.valid('query');
      const viewer = await viewerOf(context);
      const repositories = await git().listRepositories();
      const byProject = new Map<string, GitRepositoryView[]>();
      for (const repository of repositories)
        for (const link of repository.projects) {
          if (projectId && link.projectId !== projectId) continue;
          const list = byProject.get(link.projectId) ?? [];
          if (link.isPrimary) list.unshift(repository);
          else list.push(repository);
          byProject.set(link.projectId, list);
        }
      const names = await visibleProjects(viewer, [...byProject.keys()]);
      const data = [];
      for (const [id, list] of byProject) {
        const project = names.get(id);
        if (!project) continue;
        const repos = [];
        for (const repository of list) {
          const read: RepositoryMemory = await memory().readRepository(repository);
          repos.push({
            id: repository.id,
            name: repository.repo,
            provider: 'github' as const,
            defaultBranch: repository.defaultBranch,
            memories: read.memories.length,
            ref: read.ref,
            checkedAt: read.checkedAt,
            unavailable: read.unavailable,
          });
        }
        data.push({ project: { id, name: project.name }, repos });
      }
      data.sort((a, b) => a.project.name.localeCompare(b.project.name));
      return context.json({ data });
    },
  );

  router.get(
    '/:projectId/repos/:repoId',
    describeRoute({
      tags: ['Studio'],
      summary: 'Read a repository’s project memory',
      description: 'The memories of the repository’s default branch (at most 50), newest first.',
      operationId: 'studioGetProjectMemory',
      security: PERSON_OR_RUN,
      ...cliRoute({ command: 'memory get', columns: ['type', 'name', 'modified', 'path'], action: VIEW_ACTION }),
      responses: { '200': dataResponse(RepositoryMemorySchema), ...apiErrorResponses, '404': apiErrorResponse(404) },
    }),
    apiValidator('param', RepoParams),
    apiValidator('query', ReadQuery),
    async (context) => {
      const { projectId, repoId } = context.req.valid('param');
      const { fresh } = context.req.valid('query');
      const { project, repository } = await repositoryIn(context, projectId, repoId);
      const read = await memory().readRepository(repository, { fresh: fresh === 'true' });
      return context.json({ data: { project, ...read } });
    },
  );

  router.get(
    '/:projectId/repos/:repoId/file',
    describeRoute({
      tags: ['Studio'],
      summary: 'Read one memory',
      operationId: 'studioReadProjectMemory',
      security: PERSON_OR_RUN,
      ...cliRoute({
        command: 'memory read',
        examples: ['memory read <projectId> <repoId> --path .nb-studio/memory/<slug>.md'],
        action: VIEW_ACTION,
      }),
      responses: {
        '200': dataResponse(MemoryFileSchema),
        ...apiErrorResponses,
        '404': apiErrorResponse(404),
        '503': apiErrorResponse(503, 'When GitHub is unavailable.'),
      },
    }),
    apiValidator('param', RepoParams),
    apiValidator('query', FileQuery),
    async (context) => {
      const { projectId, repoId } = context.req.valid('param');
      const { path } = context.req.valid('query');
      const { repository } = await repositoryIn(context, projectId, repoId);
      return context.json({ data: await guarded(() => memory().readFile(repository, path)) });
    },
  );

  const root = new Hono();
  root.route('/projectMemory', router);
  return root;
});
