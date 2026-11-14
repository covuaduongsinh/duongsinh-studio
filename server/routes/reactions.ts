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
  listResponse,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { databaseManagerToken } from '@nocobase/db';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import {
  effectiveRules,
  issueReactions,
  saveRule,
} from '../reactions/rules.js';
import { REACTION_EVENTS } from '../reactions/service.js';

type Env = AuthEnv & AuthorizationEnv;

const DOMAIN = 'studio';
const PERSON_ONLY: Record<string, string[]>[] = [
  { cookieAuth: [] },
  { apiKeyAuth: [] },
];

const EventName = z.enum(REACTION_EVENTS as [string, ...string[]]);

const RuleSchema = z
  .object({
    event: EventName,
    enabled: z.boolean(),
    maxAttempts: z.number().int(),
    maxPerIssue: z.number().int(),
    overridden: z.boolean(),
  })
  .meta({ ref: 'StudioReactionRule' });

const UpdateRuleBody = z
  .object({
    enabled: z.boolean().optional(),
    maxAttempts: z.number().int().min(1).max(5).optional(),
    maxPerIssue: z.number().int().min(1).max(20).optional(),
  })
  .strict();

const IssueReactionSchema = z
  .object({
    id: z.string(),
    kind: z.enum(['reacted', 'blocked']),
    event: EventName.nullable(),
    attempt: z.number().int().nullable(),
    reason: z.string().nullable(),
    createdAt: z.string(),
  })
  .meta({ ref: 'StudioIssueReaction' });

const ProjectParams = z.object({ projectId: z.string() });
const ProjectEventParams = z.object({
  projectId: z.string(),
  event: EventName,
});
const IssueParams = z.object({ issueId: z.string() });

/** The reaction rules of a project (what Studio does by itself) and the reactions an issue had (plan T, T1.5). */
export const reactionRoutes: AppApiRouteContribution<Application> =
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
          message: 'Reaction rules refuse run tokens and service accounts.',
        });
      if (await auth.isScopedSession(session, context.req.raw))
        throw new ApiError({
          status: 'PERMISSION_DENIED',
          reason: 'SCOPED_KEY_FORBIDDEN',
          domain: DOMAIN,
          message: 'Reaction rules refuse scoped API keys.',
        });
      const identity = context.get('authz').identity;
      return {
        userId: session.user.id,
        actor: { type: 'user', id: session.user.id },
        permissions: await container
          .resolve(projectsAccessToken)
          .permissionsOf(identity),
      };
    };

    const requireProject = async (
      context: Context<Env>,
      projectId: string,
      action: 'view' | 'manage',
    ): Promise<Viewer> => {
      const viewer = await viewerOf(context);
      if ((await context.get('authz').snapshot()).unrestricted) return viewer;
      const access = await projects().projects.accessTo(viewer, { projectId });
      if (!access)
        throw new ApiError({
          status: 'NOT_FOUND',
          reason: 'PROJECT_NOT_FOUND',
          domain: DOMAIN,
          message: `Project ${projectId} not found.`,
        });
      if (action === 'manage' ? !access.manage : !access.visible)
        throw new ApiError({
          status: 'PERMISSION_DENIED',
          reason: 'ACCESS_DENIED',
          domain: DOMAIN,
          message: `You may not ${action} the reaction rules of project ${projectId}.`,
        });
      return viewer;
    };

    for (const path of [
      '/projects/:projectId/reactions',
      '/projects/:projectId/reactions/*',
      '/issues/:issueId/reactions',
    ])
      routes.use(path, auth.required({ scopedKeys: true }), authz.middleware());

    routes.get(
      '/projects/:projectId/reactions',
      describeRoute({
        tags: ['Studio Autopilot'],
        summary: 'List the reaction rules of a project',
        description:
          'Every event with the project’s own rule, or the built-in default when it has none.',
        security: PERSON_ONLY,
        ...cliRoute({ command: 'reactions list' }),
        responses: {
          '200': listResponse(RuleSchema),
          ...apiErrorResponses,
        },
      }),
      apiValidator('param', ProjectParams),
      async (context) => {
        const { projectId } = context.req.valid('param');
        await requireProject(context, projectId, 'view');
        return context.json({ data: await effectiveRules(conn(), projectId) });
      },
    );

    routes.put(
      '/projects/:projectId/reactions/:event',
      describeRoute({
        tags: ['Studio Autopilot'],
        summary: 'Change a project’s reaction rule',
        security: PERSON_ONLY,
        ...cliRoute({ command: 'reactions set' }),
        responses: {
          '200': dataResponse(RuleSchema),
          ...apiErrorResponses,
        },
      }),
      apiValidator('param', ProjectEventParams),
      apiValidator('json', UpdateRuleBody),
      async (context) => {
        const { projectId, event } = context.req.valid('param');
        const viewer = await requireProject(context, projectId, 'manage');
        return context.json({
          data: await saveRule(
            conn(),
            projectId,
            event as (typeof REACTION_EVENTS)[number],
            context.req.valid('json'),
            viewer.userId,
          ),
        });
      },
    );

    routes.get(
      '/issues/:issueId/reactions',
      describeRoute({
        tags: ['Studio Autopilot'],
        summary: 'List what Studio did by itself on an issue',
        security: PERSON_ONLY,
        ...cliRoute({ command: 'reactions issue' }),
        responses: {
          '200': listResponse(IssueReactionSchema),
          ...apiErrorResponses,
        },
      }),
      apiValidator('param', IssueParams),
      async (context) => {
        const { issueId } = context.req.valid('param');
        const viewer = await viewerOf(context);
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
        return context.json({ data: await issueReactions(conn(), issueId) });
      },
    );

    router.route('/', routes);
    return router;
  });
