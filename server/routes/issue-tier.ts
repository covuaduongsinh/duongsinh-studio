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
import { databaseManagerToken } from '@nocobase/db';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { TIERS, TierError, setTier, tierOf } from '../tiers/service.js';

type Env = AuthEnv & AuthorizationEnv;

const DOMAIN = 'studio';
const PERSON_ONLY: Record<string, string[]>[] = [
  { cookieAuth: [] },
  { apiKeyAuth: [] },
];

const TierSchema = z
  .object({
    tier: z.enum(TIERS as unknown as [string, ...string[]]),
    source: z.enum(['issue', 'default']),
    raisedFrom: z.enum(TIERS as unknown as [string, ...string[]]).nullable(),
    reason: z.string().nullable(),
  })
  .meta({ ref: 'StudioIssueTier' });

const SetTierBody = z
  .object({
    tier: z.enum(TIERS as unknown as [string, ...string[]]),
    reason: z.string().trim().max(500).nullable().optional(),
  })
  .strict();

const IssueParams = z.object({ issueId: z.string() });

/** An issue's tier: how much care it asks for (plan T, T10). */
export const issueTierRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const routes = new Hono<Env>();
    const { container } = app;
    const auth = container.resolve(authenticationToken);
    const authz = container.resolve(authorizationToken);
    const projects = (): Projects => container.resolve(projectsToken);
    const conn = () => container.resolve(databaseManagerToken).connection();

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

    for (const path of ['/issues/:issueId/tier'])
      routes.use(path, auth.required({ scopedKeys: true }), authz.middleware());

    routes.get(
      '/issues/:issueId/tier',
      describeRoute({
        tags: ['Studio Autopilot'],
        summary: 'Get the tier of an issue',
        security: PERSON_ONLY,
        ...cliRoute({ command: 'tier get' }),
        responses: { '200': dataResponse(TierSchema), ...apiErrorResponses },
      }),
      apiValidator('param', IssueParams),
      async (context) => {
        const { issueId } = context.req.valid('param');
        await visible(await viewerOf(context), issueId);
        return context.json({ data: await tierOf(conn(), issueId) });
      },
    );

    routes.put(
      '/issues/:issueId/tier',
      describeRoute({
        tags: ['Studio Autopilot'],
        summary: 'Choose the tier of an issue',
        description:
          'Needs the right to edit issues. An issue raised by sensitive paths is not lowered.',
        security: PERSON_ONLY,
        ...cliRoute({ command: 'tier set' }),
        responses: { '200': dataResponse(TierSchema), ...apiErrorResponses },
      }),
      apiValidator('param', IssueParams),
      apiValidator('json', SetTierBody),
      async (context) => {
        const { issueId } = context.req.valid('param');
        const body = context.req.valid('json');
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
          return context.json({
            data: await setTier(conn(), issueId, body.tier as never, {
              userId: viewer.userId,
              reason: body.reason ?? null,
            }),
          });
        } catch (error) {
          if (error instanceof TierError)
            throw new ApiError({
              status: 'FAILED_PRECONDITION',
              reason: error.reason,
              domain: DOMAIN,
              message: error.message,
            });
          throw error;
        }
      },
    );

    router.route('/', routes);
    return router;
  });
