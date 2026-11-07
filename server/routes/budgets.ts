import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization';
import { agentsToken } from '@nocobase/app-plugin-agents/server/tokens';
import type { Application } from '@nocobase/app-server/application';
import { databaseManagerToken } from '@nocobase/db';
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
import type { Context } from 'hono';
import { Hono } from 'hono';
import { z } from 'zod';
import { BUDGET_PERIODS, BUDGET_SCOPES } from '../budgets/service.js';
import { budgetServiceToken, outboundToken } from '../providers/outbound.js';

type Env = AuthEnv & AuthorizationEnv;
type Ctx = Context<Env>;

const DOMAIN = 'studio';
const SETTINGS = 'studio.budgets';

const denied = (message: string): ApiError =>
  new ApiError({
    status: 'PERMISSION_DENIED',
    reason: 'ACCESS_DENIED',
    domain: DOMAIN,
    message,
  });

const BudgetSchema = z
  .object({
    id: z.string(),
    scope: z.enum(BUDGET_SCOPES),
    scopeId: z.string(),
    scopeName: z.string().nullable(),
    period: z.enum(BUDGET_PERIODS),
    maxRuns: z.number().int().nullable(),
    maxTokens: z.number().nullable(),
    usedRuns: z.number().int(),
    usedTokens: z.number(),
    state: z.enum(['ok', 'warning', 'blocked', 'released']),
  })
  .meta({ ref: 'StudioBudget' });

const SaveBody = z
  .object({
    scope: z.enum(BUDGET_SCOPES),
    scopeId: z.string().max(64).default(''),
    period: z.enum(BUDGET_PERIODS),
    maxRuns: z.number().int().nonnegative().nullable().default(null),
    maxTokens: z.number().int().nonnegative().nullable().default(null),
  })
  .refine((body) => body.maxRuns !== null || body.maxTokens !== null, {
    message: 'Set a limit of runs or of tokens.',
  })
  .refine((body) => (body.scope === 'global') === (body.scopeId === ''), {
    message: '`scopeId` names the project or agent, and only those.',
  });

const Preferences = z
  .object({
    emailDecisions: z.boolean(),
    emailReports: z.boolean(),
    pushDecisions: z.boolean(),
  })
  .meta({ ref: 'StudioNotificationPreferences' });

const Choices = Preferences.extend({ emailAvailable: z.boolean() }).meta({
  ref: 'StudioNotificationChoices',
});

const ScopeOption = z.object({ id: z.string(), name: z.string() });

const IdParams = z.object({ id: z.string() });

/** Budgets of runs and tokens (for whoever holds `studio.budgets`), and each person's own outside notifications. */
export const budgetRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const root = new Hono();
    const budgets = new Hono<Env>();
    const preferences = new Hono<Env>();
    const { container } = app;
    const auth = container.resolve(authenticationToken);
    const authz = container.resolve(authorizationToken);
    const service = () => container.resolve(budgetServiceToken);

    const requireHolder = async (
      context: Ctx,
      action: 'read' | 'manage',
    ): Promise<string> => {
      const session = context.get('auth');
      if (!session) throw denied('Sign in first.');
      const access = context.get('authz');
      if (
        !(await access.snapshot()).unrestricted &&
        !(await access.can({
          resource: { type: 'settings', id: SETTINGS },
          action,
        }))
      )
        throw denied(`${SETTINGS} ${action} is required.`);
      return session.user.id;
    };

    for (const path of ['/', '/*'])
      budgets.use(path, auth.required(), authz.middleware());
    preferences.use('/', auth.required(), authz.middleware());

    budgets.get(
      '/',
      describeRoute({
        tags: ['Studio'],
        summary: 'List the budgets with what they used',
        operationId: 'studioBudgetsList',
        ...cliRoute({
          command: 'budget list',
          columns: [
            'scope',
            'scopeId',
            'period',
            'state',
            'usedRuns',
            'usedTokens',
          ],
        }),
        responses: { 200: listResponse(BudgetSchema), ...apiErrorResponses },
      }),
      async (context) => {
        await requireHolder(context, 'read');
        return context.json({ data: await service().list() });
      },
    );

    budgets.get(
      '/scopeOptions',
      describeRoute({
        tags: ['Studio'],
        summary: 'What a budget can be set on',
        operationId: 'studioBudgetsScopeOptions',
        ...cliRoute(false),
        responses: {
          200: dataResponse(
            z.object({
              projects: z.array(ScopeOption),
              agents: z.array(ScopeOption),
            }),
          ),
          ...apiErrorResponses,
        },
      }),
      async (context) => {
        await requireHolder(context, 'read');
        const conn = container.resolve(databaseManagerToken).connection();
        const [projects, agents] = await Promise.all([
          conn.query
            .selectFrom('pmProjects')
            .select(['id', 'name'])
            .orderBy('name')
            .execute(),
          container.resolve(agentsToken).agents.listActive(conn),
        ]);
        return context.json({
          data: {
            projects: projects.map(({ id, name }) => ({
              id: String(id),
              name: String(name),
            })),
            agents: agents.map(({ id, name }) => ({ id, name })),
          },
        });
      },
    );

    budgets.put(
      '/',
      describeRoute({
        tags: ['Studio'],
        summary: 'Set a budget',
        description:
          'A scope and period have one budget. At 80% the owners are told in their inbox; at 100% work stops being queued until the period turns or someone releases it.',
        operationId: 'studioBudgetsSave',
        ...cliRoute({ command: 'budget set' }),
        responses: { 200: dataResponse(BudgetSchema), ...apiErrorResponses },
      }),
      apiValidator('json', SaveBody),
      async (context) => {
        const byUserId = await requireHolder(context, 'manage');
        return context.json({
          data: await service().save({
            ...context.req.valid('json'),
            byUserId,
          }),
        });
      },
    );

    budgets.delete(
      '/:id',
      describeRoute({
        tags: ['Studio'],
        summary: 'Remove a budget',
        operationId: 'studioBudgetsRemove',
        ...cliRoute({ command: 'budget remove' }),
        responses: {
          204: { description: 'Removed.' },
          ...apiErrorResponses,
          404: apiErrorResponse(404),
        },
      }),
      apiValidator('param', IdParams),
      async (context) => {
        await requireHolder(context, 'manage');
        if (!(await service().remove(context.req.valid('param').id)))
          throw new ApiError({
            status: 'NOT_FOUND',
            reason: 'BUDGET_NOT_FOUND',
            domain: DOMAIN,
            message: 'No such budget.',
          });
        return context.body(null, 204);
      },
    );

    budgets.post(
      '/:id/release',
      describeRoute({
        tags: ['Studio'],
        summary: 'Let work be queued again this period',
        operationId: 'studioBudgetsRelease',
        ...cliRoute({ command: 'budget release' }),
        responses: {
          200: dataResponse(BudgetSchema),
          ...apiErrorResponses,
          404: apiErrorResponse(404),
        },
      }),
      apiValidator('param', IdParams),
      async (context) => {
        const byUserId = await requireHolder(context, 'manage');
        const view = await service().release(
          context.req.valid('param').id,
          byUserId,
        );
        if (!view)
          throw new ApiError({
            status: 'NOT_FOUND',
            reason: 'BUDGET_NOT_FOUND',
            domain: DOMAIN,
            message: 'No such budget.',
          });
        return context.json({ data: view });
      },
    );

    const personOf = (context: Ctx): string => {
      const session = context.get('auth');
      if (!session) throw denied('Sign in first.');
      return session.user.id;
    };

    preferences.get(
      '/',
      describeRoute({
        tags: ['Studio'],
        summary: 'What you want sent outside Studio',
        operationId: 'studioNotificationPreferencesGet',
        ...cliRoute(false),
        responses: { 200: dataResponse(Choices), ...apiErrorResponses },
      }),
      async (context) => {
        const outbound = container.resolve(outboundToken);
        return context.json({
          data: {
            ...(await outbound.preferencesOf(personOf(context))),
            emailAvailable: outbound.emailAvailable(),
          },
        });
      },
    );

    preferences.put(
      '/',
      describeRoute({
        tags: ['Studio'],
        summary: 'Choose what is sent outside Studio',
        description:
          'Each person chooses for themselves. A field left out stays.',
        operationId: 'studioNotificationPreferencesSet',
        ...cliRoute(false),
        responses: { 200: dataResponse(Choices), ...apiErrorResponses },
      }),
      apiValidator('json', Preferences.partial()),
      async (context) => {
        const body = context.req.valid('json');
        const outbound = container.resolve(outboundToken);
        return context.json({
          data: {
            ...(await outbound.setPreferences(personOf(context), {
              ...(body.emailDecisions !== undefined
                ? { emailDecisions: body.emailDecisions }
                : {}),
              ...(body.emailReports !== undefined
                ? { emailReports: body.emailReports }
                : {}),
              ...(body.pushDecisions !== undefined
                ? { pushDecisions: body.pushDecisions }
                : {}),
            })),
            emailAvailable: outbound.emailAvailable(),
          },
        });
      },
    );

    root.route('/budgets', budgets);
    root.route('/notificationPreferences', preferences);
    return root;
  });
