import {
  authenticationToken,
  isServiceAccount,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization';
import { agentsToken } from '@nocobase/app-plugin-agents/server/tokens';
import type { Application } from '@nocobase/app-server/application';
import {
  ApiError,
  apiErrorResponses,
  apiValidator,
  dataResponse,
  defineApiRoutes,
  describeRoute,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { databaseManagerToken } from '@nocobase/db';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { PROJECT_MANAGER_ID } from '../agents/ids.js';
import { PROJECT_MANAGER_PRINCIPLES } from '../agents/project-manager-principles.js';
import {
  DEFAULT_PROJECT_MANAGER_SETTINGS,
  readProjectManagerSettings,
  writeProjectManagerSettings,
  type ProjectManagerSettings,
} from '../agents/project-manager-settings.js';
import { syncProjectManager } from '../providers/project-manager.js';

type Env = AuthEnv & AuthorizationEnv;

const DOMAIN = 'studio';

const Seconds = z.number().int().min(0).max(86_400);

const ProjectManagerSchema = z
  .object({
    name: z.string().min(1).max(100),
    description: z.string().max(2_000).nullable(),
    firstChoiceAgentId: z.string().nullable().meta({
      description:
        'The agent whose tool and model the project manager runs with.',
    }),
    fallbackAgentId: z.string().nullable(),
    fallbackAfterSeconds: Seconds,
    delegationQueueTimeoutSeconds: Seconds,
    commentRunLimit: z.number().int().min(1).max(1_000).meta({
      description: 'Runs agents’ comments may start on one issue in a day.',
    }),
    principles: z.string().max(100_000).nullable().meta({
      description: 'Null follows `builtInPrinciples`.',
    }),
    builtInPrinciples: z.string(),
    defaults: z
      .object({
        fallbackAfterSeconds: Seconds,
        delegationQueueTimeoutSeconds: Seconds,
        commentRunLimit: z.number().int(),
        principles: z.null(),
      })
      .meta({ description: 'What “restore defaults” sets.' }),
  })
  .meta({ ref: 'StudioProjectManager' });

const AgentOptionSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    tool: z.string().nullable(),
    model: z.string().nullable(),
  })
  .meta({ ref: 'StudioProjectManagerAgentOption' });

const PatchBody = ProjectManagerSchema.omit({
  builtInPrinciples: true,
  defaults: true,
})
  .partial()
  .strict();

function denied(message: string): ApiError {
  return new ApiError({
    status: 'PERMISSION_DENIED',
    reason: 'ACCESS_DENIED',
    domain: DOMAIN,
    message,
  });
}

function invalidAgent(field: string, message: string): ApiError {
  return new ApiError({
    status: 'INVALID_ARGUMENT',
    reason: 'AGENT_INVALID',
    domain: DOMAIN,
    message,
    fieldViolations: [{ field, description: message }],
  });
}

/**
 * The project manager's settings (`/api/projectManager`, the Studio demo's `StudioProjectManager`). People only: an API
 * key, a run token or a service account is refused. Reading needs the `agents.agents` settings item's `read`, changing
 * it `manage`.
 */
export const projectManagerRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const routes = new Hono<Env>();
    const auth = app.container.resolve(authenticationToken);
    const authz = app.container.resolve(authorizationToken);
    const database = app.container.resolve(databaseManagerToken);
    const agents = () => app.container.resolve(agentsToken);

    const requireAgents = async (
      context: Context<Env>,
      action: 'read' | 'manage',
    ): Promise<void> => {
      const session = context.get('auth');
      if (!session || session.credential || isServiceAccount(session.user))
        throw denied('Only people manage the project manager.');
      const authorization = context.get('authz');
      const allowed =
        (await authorization.snapshot()).unrestricted ||
        (await authorization.can({
          resource: { type: 'settings', id: 'agents.agents' },
          action,
        }));
      if (!allowed) throw denied(`agents.agents ${action} is required.`);
    };

    /** An agent the project manager may run as: enabled, with a tool and model, and not itself. */
    const requireAgent = async (field: string, id: string | null) => {
      if (id === null) return;
      const agent =
        id === PROJECT_MANAGER_ID
          ? null
          : await agents().agents.findWorkable(agents().tx.read(), id);
      if (!agent)
        throw invalidAgent(
          field,
          `Agent ${id} is not an enabled agent with a tool and model.`,
        );
    };

    const view = (settings: ProjectManagerSettings) => ({
      ...settings,
      builtInPrinciples: PROJECT_MANAGER_PRINCIPLES,
      defaults: {
        fallbackAfterSeconds:
          DEFAULT_PROJECT_MANAGER_SETTINGS.fallbackAfterSeconds,
        delegationQueueTimeoutSeconds:
          DEFAULT_PROJECT_MANAGER_SETTINGS.delegationQueueTimeoutSeconds,
        commentRunLimit: DEFAULT_PROJECT_MANAGER_SETTINGS.commentRunLimit,
        principles: null,
      },
    });

    routes.use('*', auth.required(), authz.middleware());

    routes.get(
      '/',
      describeRoute({
        tags: ['Studio'],
        summary: 'Get the project manager',
        operationId: 'studioGetProjectManager',
        responses: {
          '200': dataResponse(ProjectManagerSchema),
          ...apiErrorResponses,
        },
      }),
      async (context) => {
        await requireAgents(context, 'read');
        return context.json({
          data: view(await readProjectManagerSettings(database.connection())),
        });
      },
    );

    routes.get(
      '/agentOptions',
      describeRoute({
        tags: ['Studio'],
        summary: 'The agents the project manager may run as',
        description:
          'Enabled agents with a tool and model, except the project manager itself: what the first choice and the fallback may be.',
        operationId: 'studioProjectManagerAgentOptions',
        responses: {
          '200': dataResponse(z.array(AgentOptionSchema)),
          ...apiErrorResponses,
        },
      }),
      async (context) => {
        await requireAgents(context, 'read');
        const conn = agents().tx.read();
        const active = await agents().agents.listActive(conn);
        const workable = await Promise.all(
          active
            .filter((agent) => agent.id !== PROJECT_MANAGER_ID)
            .map((agent) => agents().agents.findWorkable(conn, agent.id)),
        );
        return context.json({
          data: workable.flatMap((agent) =>
            agent
              ? [
                  {
                    id: agent.id,
                    name: agent.name,
                    tool: agent.tool,
                    model: agent.model,
                  },
                ]
              : [],
          ),
        });
      },
    );

    routes.patch(
      '/',
      describeRoute({
        tags: ['Studio'],
        summary: 'Change the project manager',
        operationId: 'studioUpdateProjectManager',
        responses: {
          '200': dataResponse(ProjectManagerSchema),
          ...apiErrorResponses,
        },
      }),
      apiValidator('json', PatchBody),
      async (context) => {
        await requireAgents(context, 'manage');
        const patch = context.req.valid('json');
        const next: ProjectManagerSettings = {
          ...(await readProjectManagerSettings(database.connection())),
          ...patch,
        };
        await requireAgent('firstChoiceAgentId', next.firstChoiceAgentId);
        await requireAgent('fallbackAgentId', next.fallbackAgentId);
        const saved = await writeProjectManagerSettings(database, next);
        await syncProjectManager(agents(), saved);
        return context.json({ data: view(saved) });
      },
    );

    router.route('/projectManager', routes);
    return router;
  });
