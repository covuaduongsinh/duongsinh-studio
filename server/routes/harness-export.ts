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
import { harnessExportServiceToken } from '../providers/harness-export.js';
import { HarnessExportError } from '../harness-export/service.js';

type Env = AuthEnv & AuthorizationEnv;
const DOMAIN = 'studio';
const PERSON_ONLY: Record<string, string[]>[] = [
  { cookieAuth: [] },
  { apiKeyAuth: [] },
];

const StatusSchema = z
  .object({
    repository: z.string().nullable(),
    branch: z.string().nullable(),
    files: z.number().int(),
    missing: z.array(z.string()),
    edited: z.array(z.string()),
    outdated: z.boolean(),
    state: z.enum(['noRepository', 'notExported', 'inSync', 'drifted']),
  })
  .meta({ ref: 'StudioHarnessExportStatus' });

const ExportSchema = z
  .object({
    number: z.number().int(),
    url: z.string(),
    files: z.number().int(),
  })
  .meta({ ref: 'StudioHarnessExport' });

const ProjectParams = z.object({ projectId: z.string() });

/** Writes the rules Studio keeps for a project into its repository, and says when the copy there has drifted (plan T, T4). */
export const harnessExportRoutes: AppApiRouteContribution<Application> =
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

    const requireManager = async (
      context: Context<Env>,
      projectId: string,
    ): Promise<void> => {
      const viewer = await viewerOf(context);
      if ((await context.get('authz').snapshot()).unrestricted) return;
      const access = await projects().projects.accessTo(viewer, { projectId });
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
          message: 'Only people who manage the project export its rules.',
        });
    };

    routes.use(
      '/projects/:projectId/harnessExport',
      auth.required({ scopedKeys: true }),
      authz.middleware(),
    );

    routes.get(
      '/projects/:projectId/harnessExport',
      describeRoute({
        tags: ['Studio Git'],
        summary:
          'Compare the repository’s harness files with what Studio would write',
        security: PERSON_ONLY,
        ...cliRoute({ command: 'harness status' }),
        responses: { '200': dataResponse(StatusSchema), ...apiErrorResponses },
      }),
      apiValidator('param', ProjectParams),
      async (context) => {
        const { projectId } = context.req.valid('param');
        await requireManager(context, projectId);
        return context.json({
          data: await container
            .resolve(harnessExportServiceToken)
            .status(projectId),
        });
      },
    );

    routes.post(
      '/projects/:projectId/harnessExport',
      describeRoute({
        tags: ['Studio Git'],
        summary:
          'Open a pull request with the rules Studio keeps for the project',
        description:
          'Writes `.nb-studio/harness/` and `.agents/rules/ds-harness.md` and adds one row to the Index of `AGENTS.md`; never `.agents/skills/`. Refuses, saying how many texts matched and in which files but never the text, when anything looks like a secret.',
        security: PERSON_ONLY,
        ...cliRoute({ command: 'harness export' }),
        responses: { '201': dataResponse(ExportSchema), ...apiErrorResponses },
      }),
      apiValidator('param', ProjectParams),
      async (context) => {
        const { projectId } = context.req.valid('param');
        await requireManager(context, projectId);
        try {
          return context.json(
            {
              data: await container
                .resolve(harnessExportServiceToken)
                .exportToRepository(projectId),
            },
            201,
          );
        } catch (error) {
          if (error instanceof HarnessExportError)
            throw new ApiError({
              status: 'FAILED_PRECONDITION',
              reason: error.reason,
              domain: DOMAIN,
              message: error.message,
              metadata: Object.fromEntries(
                Object.entries(error.metadata).map(([k, v]) => [
                  k,
                  JSON.stringify(v),
                ]),
              ),
            });
          throw error;
        }
      },
    );

    router.route('/', routes);
    return router;
  });
