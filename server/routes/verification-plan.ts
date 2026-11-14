import {
  authenticationToken,
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
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { databaseManagerToken } from '@nocobase/db';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { z } from 'zod';
import { str, strOrNull } from '../git/rows.js';

type Env = AuthEnv & AuthorizationEnv;
type Ctx = Context<Env>;

const PERSON_OR_RUN: Record<string, string[]>[] = [
  { cookieAuth: [] },
  { apiKeyAuth: [] },
  { runToken: [] },
];

const IssueParam = z.object({ issueId: z.string() });

export const VerificationPlanSchema = z.object({
  issueId: z.string(),
  /** The head of the issue's open pull request: the commit to verify. Null while there is none. */
  headSha: z.string().nullable(),
  criteria: z.array(
    z.object({
      id: z.string(),
      text: z.string(),
      checkKind: z.enum(['test', 'command', 'ci', 'human']),
      /** The command Studio fixed for a `test` or `command` criterion; null for the others. */
      command: z.string().nullable(),
    }),
  ),
});

/**
 * What an agent must run to verify an issue, from Studio (plan T, T2): the commands are the ones the issue's criteria
 * fixed, not ones the agent chooses, and the head to verify is the open pull request's. The agent runs each command and
 * submits its exit code and output (`ds-studio verify submit`); Studio derives every result from the exit code.
 */
export const verificationPlanRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const auth = app.container.resolve(authenticationToken);
    const authz = app.container.resolve(authorizationToken);

    const viewerOf = async (context: Ctx): Promise<Viewer> => {
      const session = context.get('auth');
      if (!session)
        throw new ApiError({
          status: 'UNAUTHENTICATED',
          reason: 'UNAUTHENTICATED',
          domain: 'verifications',
          message: 'Sign in first.',
        });
      const identity = context.get('authz').identity;
      const scoped = identity.keyScope?.objects('pm.projects') ?? 'all';
      const caller = runIdentityOf(session);
      const runId = caller?.run?.run ? str(caller.run.run.id) : null;
      const userId = session.user?.id
        ? str(session.user.id)
        : (runId ?? 'anonymous');
      return {
        userId,
        actor: runId
          ? { type: 'agent', id: runId }
          : { type: 'user', id: userId },
        permissions: await app.container
          .resolve(projectsAccessToken)
          .permissionsOf(identity),
        ...(scoped === 'all' ? {} : { projectIds: scoped }),
      };
    };

    const routes = new Hono<Env>();
    routes.use(
      '/issues/:issueId/verificationPlan',
      auth.required({ scopedKeys: true }),
      authz.middleware(),
    );

    routes.get(
      '/issues/:issueId/verificationPlan',
      describeRoute({
        description:
          'Lists the commands to run and the commit to verify for an issue, from its criteria and open pull request.',
        security: PERSON_OR_RUN,
        ...cliRoute({ command: 'verify plan' }),
        responses: {
          '200': dataResponse(VerificationPlanSchema),
          ...apiErrorResponses,
          403: apiErrorResponse(403),
          404: apiErrorResponse(404),
        },
      }),
      apiValidator('param', IssueParam),
      async (c) => {
        const { issueId } = c.req.valid('param');
        const viewer = await viewerOf(c);
        try {
          await app.container
            .resolve(projectsToken)
            .issueQueries.visible(viewer, issueId);
        } catch {
          throw new ApiError({
            status: 'NOT_FOUND',
            reason: 'NOT_FOUND',
            domain: 'verifications',
            message: 'Issue not found.',
          });
        }
        const connection = app.container
          .resolve(databaseManagerToken)
          .connection();
        const rows = await connection.query
          .selectFrom('dsIssueCriteria')
          .selectAll()
          .where('issueId', '=', issueId)
          .orderBy('position', 'asc')
          .execute();
        const openPr = await connection.query
          .selectFrom('dsPullRequests')
          .select('headSha')
          .where('issueId', '=', issueId)
          .where('state', '=', 'open')
          .executeTakeFirst();
        return c.json({
          data: {
            issueId,
            headSha: openPr?.headSha ? str(openPr.headSha) : null,
            criteria: rows.map((row) => {
              const checkKind = str(row.checkKind) as
                'test' | 'command' | 'ci' | 'human';
              return {
                id: str(row.id),
                text: str(row.text),
                checkKind,
                command:
                  checkKind === 'test' || checkKind === 'command'
                    ? strOrNull(row.checkValue)
                    : null,
              };
            }),
          },
        });
      },
    );

    router.route('/', routes);
    return router;
  });
