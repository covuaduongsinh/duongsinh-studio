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
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import {
  autopilotServiceToken,
  autopilotSchedulerToken,
  autopilotDigestToken,
} from '../providers/autopilot.js';

type Env = AuthEnv & AuthorizationEnv;

const DOMAIN = 'studio';

const PERSON_ONLY: Record<string, string[]>[] = [
  { cookieAuth: [] },
  { apiKeyAuth: [] },
];

const AutopilotSettingsSchema = z
  .object({
    projectId: z.string(),
    enabled: z.boolean(),
    mergeMethod: z.string(),
    maxMergesPerDay: z.number().int().nullable(),
    maxActiveIssues: z.number().int().nullable(),
    stallMinutes: z.number().int(),
    sensitivePaths: z.array(z.string()).nullable(),
    sensitivePolicy: z.enum(['extraReview', 'human']),
    pausedReason: z.string().nullable(),
    updatedAt: z.string(),
    updatedById: z.string().nullable(),
  })
  .meta({ ref: 'StudioAutopilotSettings' });

/** A path pattern inside the repository; a web address there matches no changed file and silently disables the guard. */
const SensitivePath = z
  .string()
  .trim()
  .min(1)
  .refine((value) => !/^[a-z][a-z0-9+.-]*:\/\//iu.test(value), {
    message: 'A sensitive path is a path in the repository, not a URL.',
  });

const UpdateAutopilotSettingsBody = z
  .object({
    enabled: z.boolean().optional(),
    mergeMethod: z.enum(['squash', 'merge', 'rebase']).optional(),
    maxMergesPerDay: z.number().int().min(1).nullable().optional(),
    maxActiveIssues: z.number().int().min(1).nullable().optional(),
    stallMinutes: z.number().int().min(1).optional(),
    sensitivePaths: z.array(SensitivePath).nullable().optional().meta({
      description:
        'Repository path patterns such as `database/**`. Null or empty means the defaults; a URL is refused.',
    }),
    sensitivePolicy: z.enum(['extraReview', 'human']).optional(),
    pausedReason: z.string().nullable().optional(),
  })
  .strict();

const PauseAutopilotBody = z
  .object({
    reason: z.string().trim().min(1).meta({
      description: 'Reason for pausing autopilot.',
    }),
  })
  .strict();

const StopAllAutopilotBody = z
  .object({
    reason: z.string().trim().min(1).meta({
      description: 'Reason for stopping autopilot across all projects.',
    }),
  })
  .strict();

const AutopilotEventSchema = z
  .object({
    id: z.string(),
    projectId: z.string(),
    issueId: z.string().nullable(),
    pullRequestId: z.string().nullable(),
    kind: z.enum([
      'merged',
      'skipped',
      'opened',
      'stalled',
      'blocked',
      'paused',
    ]),
    reason: z.string().nullable(),
    data: z.record(z.string(), z.unknown()).nullable(),
    createdAt: z.string(),
  })
  .meta({ ref: 'StudioAutopilotEvent' });

const AutopilotEvaluationSchema = z
  .object({
    eligible: z.boolean(),
    reasons: z.array(z.string()),
    issueId: z.string(),
    projectId: z.string().optional(),
  })
  .meta({ ref: 'StudioAutopilotEvaluation' });

const IssueFlagSchema = z
  .object({
    issueId: z.string(),
    allowAutoStart: z.boolean(),
    inheritFromParent: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .meta({ ref: 'StudioAutopilotIssueFlag' });

const UpdateIssueFlagBody = z
  .object({
    allowAutoStart: z.boolean().optional(),
    inheritFromParent: z.boolean().optional(),
  })
  .strict();

const ProjectParams = z.object({ projectId: z.string() });
const IssueParams = z.object({ issueId: z.string() });
const EventsQuery = z.object({
  projectId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

export const autopilotRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const routes = new Hono<Env>();
    const { container } = app;
    const auth = container.resolve(authenticationToken);
    const authz = container.resolve(authorizationToken);
    const projects = (): Projects => container.resolve(projectsToken);
    const autopilot = () => container.resolve(autopilotServiceToken);
    const scheduler = () => container.resolve(autopilotSchedulerToken);

    const requirePerson = async (context: Context<Env>) => {
      const session = context.get('auth');
      if (!session) {
        throw new ApiError({
          status: 'UNAUTHENTICATED',
          reason: 'UNAUTHENTICATED',
          domain: DOMAIN,
          message: 'Sign in first.',
        });
      }
      const run = runIdentityOf(session);
      if (run?.run || isServiceAccount(session.user)) {
        throw new ApiError({
          status: 'PERMISSION_DENIED',
          reason: 'RUN_NOT_ALLOWED',
          domain: DOMAIN,
          message:
            'Autopilot endpoints refuse run tokens and service accounts.',
        });
      }
      if (await auth.isScopedSession(session, context.req.raw)) {
        throw new ApiError({
          status: 'PERMISSION_DENIED',
          reason: 'SCOPED_KEY_FORBIDDEN',
          domain: DOMAIN,
          message: 'Autopilot endpoints refuse scoped API keys.',
        });
      }
      return session;
    };

    const viewerOf = async (context: Context<Env>): Promise<Viewer> => {
      const session = await requirePerson(context);
      const identity = context.get('authz').identity;
      const scoped = identity.keyScope?.objects('pm.projects') ?? 'all';
      return {
        userId: session.user.id,
        actor: { type: 'user', id: session.user.id },
        permissions: await container
          .resolve(projectsAccessToken)
          .permissionsOf(identity),
        ...(scoped === 'all' ? {} : { projectIds: scoped }),
      };
    };

    const requireProjectAccess = async (
      context: Context<Env>,
      projectId: string,
      action: 'view' | 'manage',
    ): Promise<{ viewer: Viewer }> => {
      const viewer = await viewerOf(context);
      const authorization = context.get('authz');
      const snapshot = await authorization.snapshot();
      if (snapshot.unrestricted) {
        return { viewer };
      }
      const access = await projects().projects.accessTo(viewer, { projectId });
      if (!access) {
        throw new ApiError({
          status: 'NOT_FOUND',
          reason: 'PROJECT_NOT_FOUND',
          domain: DOMAIN,
          message: `Project ${projectId} not found.`,
        });
      }
      if (action === 'manage' && !access.manage) {
        throw new ApiError({
          status: 'PERMISSION_DENIED',
          reason: 'ACCESS_DENIED',
          domain: DOMAIN,
          message: `You do not have permission to manage autopilot for project ${projectId}.`,
        });
      }
      if (action === 'view' && !access.visible) {
        throw new ApiError({
          status: 'PERMISSION_DENIED',
          reason: 'ACCESS_DENIED',
          domain: DOMAIN,
          message: `You do not have permission to view autopilot for project ${projectId}.`,
        });
      }
      return { viewer };
    };

    // Only the paths this router owns: it mounts at the API root, where `*` would also require a session on everything
    // registered after it, public webhooks and run-token routes included.
    for (const path of [
      '/projects/:projectId/autopilot/*',
      '/autopilot/*',
      '/issues/:issueId/autopilot',
      '/issues/:issueId/autopilot-flag',
    ])
      routes.use(path, auth.required({ scopedKeys: true }), authz.middleware());

    routes.get(
      '/projects/:projectId/autopilot',
      describeRoute({
        tags: ['Studio Autopilot'],
        summary: 'Get project autopilot settings',
        security: PERSON_ONLY,
        ...cliRoute({ command: 'autopilot get' }),
        responses: {
          '200': dataResponse(AutopilotSettingsSchema),
          ...apiErrorResponses,
        },
      }),
      apiValidator('param', ProjectParams),
      async (context) => {
        const { projectId } = context.req.valid('param');
        await requireProjectAccess(context, projectId, 'view');
        const settings = (await autopilot().getSettings(projectId)) ?? {
          projectId,
          enabled: false,
          mergeMethod: 'squash',
          maxMergesPerDay: null,
          maxActiveIssues: null,
          stallMinutes: 30,
          sensitivePaths: null,
          sensitivePolicy: 'extraReview',
          pausedReason: null,
          updatedAt: new Date().toISOString(),
          updatedById: null,
        };
        return context.json({ data: settings });
      },
    );

    routes.put(
      '/projects/:projectId/autopilot',
      describeRoute({
        tags: ['Studio Autopilot'],
        summary: 'Update project autopilot settings',
        security: PERSON_ONLY,
        ...cliRoute({ command: 'autopilot set' }),
        responses: {
          '200': dataResponse(AutopilotSettingsSchema),
          ...apiErrorResponses,
        },
      }),
      apiValidator('param', ProjectParams),
      apiValidator('json', UpdateAutopilotSettingsBody),
      async (context) => {
        const { projectId } = context.req.valid('param');
        const { viewer } = await requireProjectAccess(
          context,
          projectId,
          'manage',
        );
        const body = context.req.valid('json');
        const updated = await autopilot().saveSettings(
          projectId,
          body,
          viewer.userId,
        );
        return context.json({ data: updated });
      },
    );

    routes.post(
      '/projects/:projectId/autopilot/pause',
      describeRoute({
        tags: ['Studio Autopilot'],
        summary: 'Pause autopilot for a project',
        security: PERSON_ONLY,
        ...cliRoute({ command: 'autopilot pause' }),
        responses: {
          '200': dataResponse(AutopilotSettingsSchema),
          ...apiErrorResponses,
        },
      }),
      apiValidator('param', ProjectParams),
      apiValidator('json', PauseAutopilotBody),
      async (context) => {
        const { projectId } = context.req.valid('param');
        const { viewer } = await requireProjectAccess(
          context,
          projectId,
          'manage',
        );
        const { reason } = context.req.valid('json');
        await autopilot().pause(projectId, reason, viewer.userId);
        const settings = await autopilot().getSettings(projectId);
        return context.json({ data: settings });
      },
    );

    routes.post(
      '/projects/:projectId/autopilot/resume',
      describeRoute({
        tags: ['Studio Autopilot'],
        summary: 'Resume autopilot for a project',
        security: PERSON_ONLY,
        ...cliRoute({ command: 'autopilot resume' }),
        responses: {
          '200': dataResponse(AutopilotSettingsSchema),
          ...apiErrorResponses,
        },
      }),
      apiValidator('param', ProjectParams),
      async (context) => {
        const { projectId } = context.req.valid('param');
        const { viewer } = await requireProjectAccess(
          context,
          projectId,
          'manage',
        );
        await autopilot().resume(projectId, viewer.userId);
        const settings = await autopilot().getSettings(projectId);
        return context.json({ data: settings });
      },
    );

    routes.get(
      '/autopilot/events',
      describeRoute({
        tags: ['Studio Autopilot'],
        summary: 'List autopilot events',
        security: PERSON_ONLY,
        ...cliRoute({ command: 'autopilot events' }),
        responses: {
          '200': listResponse(AutopilotEventSchema),
          ...apiErrorResponses,
        },
      }),
      apiValidator('query', EventsQuery),
      async (context) => {
        const { projectId, limit } = context.req.valid('query');
        if (projectId) {
          await requireProjectAccess(context, projectId, 'view');
        } else {
          await requirePerson(context);
          const snapshot = await context.get('authz').snapshot();
          if (!snapshot.unrestricted) {
            throw new ApiError({
              status: 'PERMISSION_DENIED',
              reason: 'ACCESS_DENIED',
              domain: DOMAIN,
              message:
                'Listing events across all projects requires administrative privileges.',
            });
          }
        }
        const events = await autopilot().listEvents({ projectId, limit });
        return context.json({ data: events });
      },
    );

    routes.post(
      '/autopilot/stop-all',
      describeRoute({
        tags: ['Studio Autopilot'],
        summary: 'Emergency stop of autopilot across all projects',
        security: PERSON_ONLY,
        ...cliRoute({ command: 'autopilot stop-all' }),
        responses: {
          '200': dataResponse(z.object({ stopped: z.boolean() })),
          ...apiErrorResponses,
        },
      }),
      apiValidator('json', StopAllAutopilotBody),
      async (context) => {
        const session = await requirePerson(context);
        const snapshot = await context.get('authz').snapshot();
        if (!snapshot.unrestricted) {
          throw new ApiError({
            status: 'PERMISSION_DENIED',
            reason: 'ACCESS_DENIED',
            domain: DOMAIN,
            message:
              'Only administrators or owners can stop autopilot across all projects.',
          });
        }
        const { reason } = context.req.valid('json');
        await autopilot().stopAll(reason, session.user.id);
        return context.json({ data: { stopped: true } });
      },
    );

    routes.get(
      '/issues/:issueId/autopilot',
      describeRoute({
        tags: ['Studio Autopilot'],
        summary: 'Get autopilot merge evaluation for an issue',
        security: PERSON_ONLY,
        ...cliRoute({ command: 'autopilot check' }),
        responses: {
          '200': dataResponse(AutopilotEvaluationSchema),
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
          if (error instanceof DomainError) {
            throw new ApiError({
              status: 'NOT_FOUND',
              reason: 'ISSUE_NOT_FOUND',
              domain: DOMAIN,
              message: `Issue ${issueId} not found.`,
            });
          }
          throw error;
        }
        const evaluation = await autopilot().evaluate(issueId);
        return context.json({
          data: {
            eligible: evaluation.eligible,
            reasons: evaluation.reasons,
            issueId: evaluation.issueId,
            projectId: evaluation.projectId,
          },
        });
      },
    );

    routes.get(
      '/issues/:issueId/autopilot-flag',
      describeRoute({
        tags: ['Studio Autopilot'],
        summary: 'Get autopilot flag of an issue',
        security: PERSON_ONLY,
        ...cliRoute({ command: 'autopilot flag get' }),
        responses: {
          '200': dataResponse(IssueFlagSchema.nullable()),
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
          if (error instanceof DomainError) {
            throw new ApiError({
              status: 'NOT_FOUND',
              reason: 'ISSUE_NOT_FOUND',
              domain: DOMAIN,
              message: `Issue ${issueId} not found.`,
            });
          }
          throw error;
        }
        const flag = await scheduler().getIssueFlag(issueId);
        return context.json({ data: flag });
      },
    );

    routes.put(
      '/issues/:issueId/autopilot-flag',
      describeRoute({
        tags: ['Studio Autopilot'],
        summary: 'Set autopilot flag for an issue or epic',
        security: PERSON_ONLY,
        ...cliRoute({ command: 'autopilot flag' }),
        responses: {
          '200': dataResponse(IssueFlagSchema),
          ...apiErrorResponses,
        },
      }),
      apiValidator('param', IssueParams),
      apiValidator('json', UpdateIssueFlagBody),
      async (context) => {
        await requirePerson(context);
        const { issueId } = context.req.valid('param');
        const body = context.req.valid('json');
        const viewer = await viewerOf(context);
        try {
          await projects().issueQueries.visible(viewer, issueId);
        } catch (error) {
          if (error instanceof DomainError) {
            throw new ApiError({
              status: 'NOT_FOUND',
              reason: 'ISSUE_NOT_FOUND',
              domain: DOMAIN,
              message: `Issue ${issueId} not found.`,
            });
          }
          throw error;
        }
        const flag = await scheduler().setIssueFlag(issueId, body);
        return context.json({ data: flag });
      },
    );

    routes.post(
      '/autopilot/digest',
      describeRoute({
        tags: ['Studio Autopilot'],
        summary:
          'Trigger sending daily autopilot digest notification immediately',
        security: PERSON_ONLY,
        ...cliRoute({ command: 'autopilot digest' }),
        responses: {
          '200': dataResponse(
            z.object({
              date: z.string(),
              mergedCount: z.number(),
              openedCount: z.number(),
              stalledCount: z.number(),
              blockedCount: z.number(),
              sent: z.boolean(),
            }),
          ),
          ...apiErrorResponses,
        },
      }),
      async (context) => {
        await requirePerson(context);
        const snapshot = await context.get('authz').snapshot();
        if (!snapshot.unrestricted) {
          throw new ApiError({
            status: 'PERMISSION_DENIED',
            reason: 'ACCESS_DENIED',
            domain: DOMAIN,
            message:
              'Only administrators or owners can trigger the daily digest.',
          });
        }
        const digest = container.resolve(autopilotDigestToken);
        const result = await digest.sendDailyDigest();
        return context.json({ data: result });
      },
    );

    router.route('/', routes);
    return router;
  });
