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
import {
  UI_SMOKE_PROPOSAL_BRANCH,
  UI_SMOKE_WORKFLOW,
  UI_SMOKE_WORKFLOW_PATH,
} from '../setups/ui-smoke-workflow.js';

type Env = AuthEnv & AuthorizationEnv;
const DOMAIN = 'studio';
const PERSON_ONLY: Record<string, string[]>[] = [
  { cookieAuth: [] },
  { apiKeyAuth: [] },
];

const ProposalSchema = z
  .object({
    branch: z.string(),
    pullRequest: z.object({ number: z.number().int(), url: z.string() }),
  })
  .meta({ ref: 'StudioUiSmokeProposal' });

const ProjectParams = z.object({ projectId: z.string() });

/** Proposes the interface smoke test (`ds-ui-smoke`) to a project's repository as a pull request (plan T, T5). */
export const uiSmokeRoutes: AppApiRouteContribution<Application> =
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
      '/projects/:projectId/uiSmoke',
      auth.required({ scopedKeys: true }),
      authz.middleware(),
    );

    routes.post(
      '/projects/:projectId/uiSmoke',
      describeRoute({
        tags: ['Studio Git'],
        summary: 'Propose the interface smoke test to a project’s repository',
        description:
          'Opens a pull request that adds `.github/workflows/ds-ui-smoke.yml` with the caller’s own GitHub token (the GitHub App may not write workflows). It runs on GitHub Actions, uses no secret and never runs on Studio’s runner. Answers 409 when the file or the proposal’s branch exists, and 400 (`GIT_PERSONAL_TOKEN_REQUIRED`) when the caller has no personal token.',
        security: PERSON_ONLY,
        ...cliRoute({ command: 'project ui-smoke' }),
        responses: {
          '201': dataResponse(ProposalSchema),
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
              message: 'Only people who manage the project propose its checks.',
            });
        }
        const git = container.resolve(gitServiceToken);
        const repository = await git.primaryRepository(projectId);
        if (!repository)
          throw new ApiError({
            status: 'FAILED_PRECONDITION',
            reason: 'GIT_REPOSITORY_NOT_LINKED',
            domain: DOMAIN,
            message: 'The project has no repository: link one first.',
          });
        try {
          const pullRequest = await git.proposeFileAsPerson(
            viewer.userId,
            repository.connectionId,
            repository.repo,
            {
              path: UI_SMOKE_WORKFLOW_PATH,
              content: UI_SMOKE_WORKFLOW,
              message: 'ci: add the interface smoke test',
              branch: UI_SMOKE_PROPOSAL_BRANCH,
              base: repository.defaultBranch,
              title: 'ci: add the interface smoke test',
              body: 'Adds `.github/workflows/ds-ui-smoke.yml`: builds the application, starts it with a temporary database and opens the pages listed in `.nb-studio/ui-smoke-pages.json` (the home page by default) at 390 and 1280 pixels. Fails on a page error, a console error or a blank page; screenshots are an artifact of the run. It runs only on GitHub Actions and uses no secret. Opened from Dương Sinh Studio with the requester’s own token.',
            },
          );
          return context.json(
            { data: { branch: UI_SMOKE_PROPOSAL_BRANCH, pullRequest } },
            201,
          );
        } catch (failure) {
          if (failure instanceof GitError)
            throw new ApiError({
              status: failure.status,
              reason: failure.reason,
              domain: DOMAIN,
              message: failure.message,
            });
          throw failure;
        }
      },
    );

    router.route('/', routes);
    return router;
  });
