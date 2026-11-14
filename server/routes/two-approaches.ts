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
  DomainError,
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
import { twoApproachesServiceToken } from '../providers/approaches.js';
import { ApproachError } from '../approaches/service.js';

type Env = AuthEnv & AuthorizationEnv;

const DOMAIN = 'studio';
const PERSON_ONLY: Record<string, string[]>[] = [
  { cookieAuth: [] },
  { apiKeyAuth: [] },
];

const ApproachesSchema = z
  .object({
    runs: z.array(
      z.object({
        agentId: z.string(),
        agentName: z.string(),
        runId: z.string(),
      }),
    ),
  })
  .meta({ ref: 'StudioTwoApproaches' });

const IssueParams = z.object({ issueId: z.string() });

/** Asks two agents of different providers for an approach each, on request (plan T, T12). */
export const twoApproachesRoutes: AppApiRouteContribution<Application> =
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
      if (runIdentityOf(session)?.run || isServiceAccount(session.user))
        throw new ApiError({
          status: 'PERMISSION_DENIED',
          reason: 'RUN_NOT_ALLOWED',
          domain: DOMAIN,
          message: 'Issue tiers refuse run tokens and service accounts.',
        });
      if (await auth.isScopedSession(session, context.req.raw))
        throw new ApiError({
          status: 'PERMISSION_DENIED',
          reason: 'SCOPED_KEY_FORBIDDEN',
          domain: DOMAIN,
          message: 'Issue tiers refuse scoped API keys.',
        });
      return {
        userId: session.user.id,
        actor: { type: 'user', id: session.user.id },
        permissions: await container
          .resolve(projectsAccessToken)
          .permissionsOf(context.get('authz').identity),
      };
    };

    const visible = async (viewer: Viewer, issueId: string): Promise<void> => {
      try {
        await projects().issueQueries.visible(viewer, issueId);
      } catch (error) {
        if (error instanceof DomainError)
          throw new ApiError({
            status: 'NOT_FOUND',
            reason: 'ISSUE_NOT_FOUND',
            domain: DOMAIN,
            message: `Issue ${issueId} not found.`,
          });
        throw error;
      }
    };

    routes.use(
      '/issues/:issueId/twoApproaches',
      auth.required({ scopedKeys: true }),
      authz.middleware(),
    );

    routes.post(
      '/issues/:issueId/twoApproaches',
      describeRoute({
        tags: ['Studio Agents'],
        summary: 'Ask two agents of different providers for an approach each',
        description:
          'Only when asked for. Each agent writes an approach in read-only mode; when both runs have ended, the agent that holds the issue is asked to compare them and choose, with the reason in a comment. Both runs count in the budgets. Needs the right to edit the issue.',
        security: PERSON_ONLY,
        ...cliRoute({ command: 'issue two-approaches' }),
        responses: {
          '201': dataResponse(ApproachesSchema),
          ...apiErrorResponses,
        },
      }),
      apiValidator('param', IssueParams),
      async (context) => {
        const { issueId } = context.req.valid('param');
        const viewer = await viewerOf(context);
        await visible(viewer, issueId);
        const scope = viewer.permissions.scopes['pm.issues/edit' as never] as
          string | undefined;
        if (
          !(await context.get('authz').snapshot()).unrestricted &&
          (!scope || scope === 'none')
        )
          throw new ApiError({
            status: 'PERMISSION_DENIED',
            reason: 'ACCESS_DENIED',
            domain: DOMAIN,
            message: 'You may not change this issue.',
          });
        try {
          return context.json(
            {
              data: {
                runs: await container
                  .resolve(twoApproachesServiceToken)
                  .start(issueId, viewer.userId),
              },
            },
            201,
          );
        } catch (error) {
          if (error instanceof ApproachError)
            throw new ApiError({
              status:
                error.reason === 'ISSUE_NOT_FOUND'
                  ? 'NOT_FOUND'
                  : 'FAILED_PRECONDITION',
              reason: error.reason,
              domain: DOMAIN,
              message: error.message,
              metadata: error.metadata,
            });
          throw error;
        }
      },
    );

    router.route('/', routes);
    return router;
  });
