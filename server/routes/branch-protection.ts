import {
  authenticationToken,
  isServiceAccount,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization';
import { runIdentityOf } from '@nocobase/app-plugin-agents/server/tokens';
import {
  projectsAccessToken,
  projectsToken,
  type Projects,
  type Viewer,
} from '@nocobase/app-plugin-projects/server/tokens';
import type { Application } from '@nocobase/app-server/application';
import {
  ApiError,
  apiErrorResponses,
  apiValidator,
  cliRoute,
  dataResponse,
  defineApiRoutes,
  describeRoute,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { gitServiceToken } from '../providers/git.js';
import { GitError } from '../git/service.js';
import { GitHubError } from '../git/github.js';

type Env = AuthEnv & AuthorizationEnv;
const DOMAIN = 'studio';
const PERSON_ONLY: Record<string, string[]>[] = [
  { cookieAuth: [] },
  { apiKeyAuth: [] },
];

const ProtectionSchema = z
  .object({
    status: z.enum(['read', 'unreadable', 'noRepository']),
    repository: z.string().nullable(),
    branch: z.string().nullable(),
    verdict: z.enum(['ok', 'problem', 'unknown']).nullable(),
    problems: z.array(
      z.enum(['noRequiredCheck', 'pushAllowed', 'reviewRequired']),
    ),
    unknowns: z.array(z.enum(['pullRequestUnknown'])),
    requiredChecks: z.array(z.string()),
    rulesReadable: z.boolean(),
    httpStatus: z.number().int().nullable(),
  })
  .meta({ ref: 'StudioBranchProtection' });

const ProjectParams = z.object({ projectId: z.string() });

/** How the project's repository protects its default branch, and what to press to fix it (plan T, T3a). */
export const branchProtectionRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const routes = new Hono<Env>();
    const { container } = app;
    const auth = container.resolve(authenticationToken);
    const authz = container.resolve(authorizationToken);
    const projects = (): Projects => container.resolve(projectsToken);

    const viewerOf = async (context: Context<Env>): Promise<Viewer> => {
      const session = context.get('auth');
      if (!session)
        throw new ApiError({
          status: 'UNAUTHENTICATED',
          reason: 'UNAUTHENTICATED',
          domain: DOMAIN,
          message: 'Sign in first.',
        });
      if (
        runIdentityOf(session)?.run ||
        isServiceAccount(session.user) ||
        (await auth.isScopedSession(session, context.req.raw))
      )
        throw new ApiError({
          status: 'PERMISSION_DENIED',
          reason: 'RUN_NOT_ALLOWED',
          domain: DOMAIN,
          message:
            'Branch protection is read by people, not by runs or scoped keys.',
        });
      return {
        userId: session.user.id,
        actor: { type: 'user', id: session.user.id },
        permissions: await container
          .resolve(projectsAccessToken)
          .permissionsOf(context.get('authz').identity),
      };
    };

    routes.use(
      '/projects/:projectId/branchProtection',
      auth.required({ scopedKeys: true }),
      authz.middleware(),
    );

    routes.get(
      '/projects/:projectId/branchProtection',
      describeRoute({
        tags: ['Studio Git'],
        summary: 'Read how a project’s default branch is protected',
        description:
          'Reads the primary repository’s default branch with the GitHub App’s own token, without Administration. `unreadable` means GitHub refused to say, which is not the same as unprotected. For people who may manage the project.',
        security: PERSON_ONLY,
        ...cliRoute({ command: 'project branch-protection' }),
        responses: {
          '200': dataResponse(ProtectionSchema),
          ...apiErrorResponses,
        },
      }),
      apiValidator('param', ProjectParams),
      async (context) => {
        const { projectId } = context.req.valid('param');
        const viewer = await viewerOf(context);
        if (!(await context.get('authz').snapshot()).unrestricted) {
          const access = await projects().projects.accessTo(viewer, {
            projectId,
          });
          if (!access)
            throw new ApiError({
              status: 'NOT_FOUND',
              reason: 'PROJECT_NOT_FOUND',
              domain: DOMAIN,
              message: `Project ${projectId} not found.`,
            });
          if (!access.manage)
            throw new ApiError({
              status: 'PERMISSION_DENIED',
              reason: 'ACCESS_DENIED',
              domain: DOMAIN,
              message:
                'Only people who manage the project read its branch protection.',
            });
        }
        let result;
        try {
          result = await container
            .resolve(gitServiceToken)
            .readBranchProtection(projectId);
        } catch (error) {
          if (error instanceof GitError || error instanceof GitHubError)
            throw new ApiError({
              status: 'FAILED_PRECONDITION',
              reason: 'GIT_UNAVAILABLE',
              domain: DOMAIN,
              message: error.message,
            });
          throw error;
        }
        const empty = {
          repository: null,
          branch: null,
          verdict: null,
          problems: [],
          unknowns: [],
          requiredChecks: [],
          rulesReadable: false,
          httpStatus: null,
        } as const;
        if (result.status === 'noRepository')
          return context.json({ data: { status: 'noRepository', ...empty } });
        if (result.status === 'unreadable')
          return context.json({
            data: {
              ...empty,
              status: 'unreadable',
              repository: result.repository,
              branch: result.branch,
              httpStatus: result.httpStatus,
            },
          });
        return context.json({
          data: {
            status: 'read',
            repository: result.repository,
            branch: result.branch,
            verdict: result.verdict,
            problems: result.problems,
            unknowns: result.unknowns,
            requiredChecks: [...result.read.requiredChecks],
            rulesReadable: result.rulesReadable,
            httpStatus: null,
          },
        });
      },
    );

    router.route('/', routes);
    return router;
  });
