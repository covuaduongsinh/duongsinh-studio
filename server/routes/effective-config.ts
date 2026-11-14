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
import { agentsToken } from '@nocobase/app-plugin-agents/server/tokens';
import { databaseManagerToken } from '@nocobase/db';
import { budgetServiceToken } from '../providers/outbound.js';
import {
  autopilotServiceToken,
  autopilotStallDetectorToken,
} from '../providers/autopilot.js';
import { effectiveConfigRows, quotaCard } from '../effective-config/build.js';
import { effectiveRules } from '../reactions/rules.js';
import { str } from '../git/rows.js';

type Env = AuthEnv & AuthorizationEnv;
const DOMAIN = 'studio';
const PERSON_ONLY: Record<string, string[]>[] = [
  { cookieAuth: [] },
  { apiKeyAuth: [] },
];

const ConfigRowSchema = z
  .object({
    key: z.string(),
    area: z.enum(['autopilot', 'reactions', 'budgets', 'tier', 'skills']),
    value: z.string(),
    source: z.enum(['default', 'project', 'system']),
  })
  .meta({ ref: 'StudioConfigRow' });

const QuotaSchema = z
  .object({
    state: z.enum(['ok', 'warning', 'blocked']),
    waiting: z.array(
      z.object({
        projectId: z.string(),
        projectName: z.string(),
        activeUntil: z.string(),
        effectiveConcurrency: z.number().int(),
      }),
    ),
    budgets: z.array(
      z.object({
        id: z.string(),
        scope: z.string(),
        scopeId: z.string(),
        scopeName: z.string().nullable().optional(),
        period: z.string(),
        maxRuns: z.number().int().nullable(),
        maxTokens: z.number().int().nullable(),
        usedRuns: z.number().int(),
        usedTokens: z.number().int(),
        state: z.string(),
      }),
    ),
  })
  .meta({ ref: 'StudioQuotaCard' });

const ProjectParams = z.object({ projectId: z.string() });

/** The quota card of the Today page and the read-only list of what is in force for a project (plan T, T13). */
export const effectiveConfigRoutes: AppApiRouteContribution<Application> =
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

    const conn = () => container.resolve(databaseManagerToken).connection();

    routes.use(
      '/quota',
      auth.required({ scopedKeys: true }),
      authz.middleware(),
    );
    routes.use(
      '/projects/:projectId/effectiveConfig',
      auth.required({ scopedKeys: true }),
      authz.middleware(),
    );

    routes.get(
      '/quota',
      describeRoute({
        tags: ['Studio Autopilot'],
        summary: 'Quota and budgets that hold work back',
        description:
          'Projects whose queued runs wait on a tool quota, and budgets at their warning level or past their limit. For administrators.',
        security: PERSON_ONLY,
        ...cliRoute({ command: 'quota' }),
        responses: { '200': dataResponse(QuotaSchema), ...apiErrorResponses },
      }),
      async (context) => {
        await viewerOf(context);
        if (!(await context.get('authz').snapshot()).unrestricted)
          throw new ApiError({
            status: 'PERMISSION_DENIED',
            reason: 'ACCESS_DENIED',
            domain: DOMAIN,
            message: 'Only administrators read the quota.',
          });
        const stall = container.resolve(autopilotStallDetectorToken);
        const projectsList = await conn()
          .query.selectFrom('pmProjects')
          .select(['id', 'name'])
          .execute();
        const throttles = projectsList.flatMap((project) => {
          const state = stall.getQuotaThrottle(str(project.id));
          return state
            ? [
                {
                  projectId: str(project.id),
                  projectName: str(project.name),
                  activeUntil: state.activeUntil,
                  effectiveConcurrency: state.effectiveConcurrency,
                },
              ]
            : [];
        });
        return context.json({
          data: quotaCard({
            throttles,
            budgets: await container.resolve(budgetServiceToken).list(),
            now: new Date(),
          }),
        });
      },
    );

    routes.get(
      '/projects/:projectId/effectiveConfig',
      describeRoute({
        tags: ['Studio Autopilot'],
        summary:
          'What is in force for a project, and where each value comes from',
        description:
          'Autopilot, the reaction rules, the budgets that apply, the default issue tier and the skills attached, each with its source: default, project or system.',
        security: PERSON_ONLY,
        ...cliRoute({ command: 'project effective-config' }),
        responses: {
          '200': dataResponse(z.array(ConfigRowSchema)),
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
          if (!access.visible)
            throw new ApiError({
              status: 'PERMISSION_DENIED',
              reason: 'ACCESS_DENIED',
              domain: DOMAIN,
              message: 'You may not see this project.',
            });
        }
        const settings = await container
          .resolve(autopilotServiceToken)
          .getSettings(projectId);
        const attached = await container
          .resolve(agentsToken)
          .skills.attached({ scope: 'project', scopeId: projectId });
        return context.json({
          data: effectiveConfigRows({
            autopilot: settings
              ? {
                  configured: true,
                  enabled: settings.enabled,
                  autoMergeStages: settings.autoMergeStages,
                  maxActiveIssues: settings.maxActiveIssues ?? null,
                  stallMinutes: settings.stallMinutes,
                  sensitivePolicy: settings.sensitivePolicy,
                  autoMergeOnGithub: settings.autoMergeOnGithub,
                  defaultTier: settings.defaultTier,
                }
              : { configured: false },
            reactions: await effectiveRules(conn(), projectId),
            budgets: await container.resolve(budgetServiceToken).list(),
            projectId,
            skillCount: attached.length,
          }),
        });
      },
    );

    router.route('/', routes);
    return router;
  });
