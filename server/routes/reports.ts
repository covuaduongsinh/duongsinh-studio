import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization';
import { agentsToken } from '@nocobase/app-plugin-agents/server/tokens';
import {
  projectsAccessToken,
  projectsToken,
} from '@nocobase/app-plugin-projects/server/tokens';
import * as pmAccess from '@nocobase/app-plugin-projects/shared/access';
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
import { APP_NS } from '@nocobase/i18n';
import { i18nToken } from '@nocobase/app-server/i18n';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { z } from 'zod';
import { REPORTS_PAGE, REPORTS_READ_ACTION } from '../agents/actions.js';
import {
  REPORT_DAYS,
  type ReportDays,
  type ReportScope,
} from '../reports/service.js';
import { durationText, percentText } from '../reports/text.js';
import { reportFiguresOf } from '../reports/wiring.js';

type Env = AuthEnv & AuthorizationEnv;
type Ctx = Context<Env>;

const DOMAIN = 'studio';
const PERSON: Record<string, string[]>[] = [
  { cookieAuth: [] },
  { apiKeyAuth: [] },
];
const PERSON_OR_RUN: Record<string, string[]>[] = [...PERSON, { runToken: [] }];
const GRANT_NOTE =
  'Needs the reports grant (page `reports`); counts every run with `agents.agents` `read`, otherwise the caller’s own, and only issues the caller may see.';
const RUN_NOTE =
  ' `meta.message` words the figures for a reader. An agent’s run reads them for the person who woke it when its agent may read reports.';

const denied = (message: string): ApiError =>
  new ApiError({
    status: 'PERMISSION_DENIED',
    reason: 'ACCESS_DENIED',
    domain: DOMAIN,
    message,
  });

const Int = z.number().int();
const Ms = z.number().nullable();
const Share = z.number().nullable();
const Costs = z
  .record(z.string(), z.number())
  .meta({ ref: 'StudioReportCosts' });

const DeliveryFigures = z
  .object({
    completed: Int,
    cycleTimeP50Ms: Ms,
    agentShare: Share,
    costPerIssue: Costs.nullable(),
    tokensPerIssue: z.number().nullable(),
  })
  .meta({ ref: 'StudioDeliveryFigures' });

const AgentFigures = z
  .object({
    runs: Int,
    successRate: Share,
    reworkRate: Share,
    runsPerIssue: z.number().nullable(),
    interventionRate: Share,
    queueWaitP50Ms: Ms,
  })
  .meta({ ref: 'StudioAgentFigures' });

const UsageRow = z
  .object({
    key: z.string(),
    name: z.string().nullable(),
    runs: Int,
    durationMs: z.number(),
    inputTokens: z.number(),
    outputTokens: z.number(),
    cacheReadTokens: z.number(),
    cacheWriteTokens: z.number(),
    reasoningTokens: z.number(),
    cost: Costs.nullable(),
    pricedRuns: Int,
  })
  .meta({ ref: 'StudioUsageRow' });

const DaysLiteral = z.union([z.literal(7), z.literal(30), z.literal(90)]);

const PeriodHead = {
  days: DaysLiteral,
  from: z.string().describe('The first day, `YYYY-MM-DD` (UTC).'),
  to: z.string().describe('The last day, `YYYY-MM-DD` (UTC).'),
  subjects: z
    .boolean()
    .describe('False without issue figures: the issue figures stay empty.'),
};

const DeliveryReport = z.object({
  ...PeriodHead,
  currency: z.string().describe('The currency of `buckets.costPerIssue`.'),
  current: DeliveryFigures,
  previous: DeliveryFigures,
  buckets: z.array(
    z.object({
      from: z.string(),
      to: z.string(),
      completed: Int,
      cycleTimeP50Ms: Ms,
      agentShare: Share,
      costPerIssue: z.number().nullable(),
      tokensPerIssue: z.number().nullable(),
    }),
  ),
});

const AgentsReport = z.object({
  ...PeriodHead,
  current: AgentFigures,
  previous: AgentFigures,
  daily: z.array(
    z.object({
      day: z.string(),
      runsCompleted: Int,
      runsFailed: Int,
      runsCancelled: Int,
      runsOpen: Int,
    }),
  ),
});

const ProjectsReport = z.object({
  ...PeriodHead,
  projects: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      total: Int,
      done: Int,
      completed: Int,
      cycleTimeP50Ms: Ms,
      blocked: Int,
    }),
  ),
});

const AttentionIssues = z.object({
  total: Int,
  items: z.array(
    z.object({
      id: z.string(),
      identifier: z.string(),
      title: z.string(),
      since: z
        .string()
        .describe(
          'Blocked: the last activity; overdue: the due date (`YYYY-MM-DD`).',
        ),
    }),
  ),
});

const AttentionReport = z.object({
  subjects: z.boolean(),
  blocked: AttentionIssues,
  overdue: AttentionIssues,
  reviewWaits: z.object({
    total: Int,
    items: z.array(
      z.object({
        id: z.string(),
        repo: z.string(),
        number: Int,
        title: z.string(),
        url: z.string(),
        since: z.string(),
        issue: z.object({ id: z.string(), identifier: z.string() }),
      }),
    ),
  }),
  failedRuns: z.object({
    total: Int,
    items: z.array(
      z.object({
        id: z.string(),
        agentId: z.string(),
        agentName: z.string().nullable(),
        failureReason: z.string().nullable(),
        finishedAt: z.string(),
        issue: z.object({
          id: z.string(),
          identifier: z.string(),
          title: z.string(),
        }),
      }),
    ),
  }),
});

const Status = z.enum(['ok', 'warn', 'n/a']);

const MetricsReport = z.object({
  from: z.string(),
  to: z.string(),
  projectId: z.string().nullable(),
  generatedAt: z.string(),
  subjects: z.boolean(),
  adoption: z.object({
    activeWeeks: Int,
    activeDays: Int,
    issuesCreated: Int,
    commentsCreated: Int,
    activeMembers: Int,
  }),
  aiShare: z.object({
    share: Share,
    deliveredByAgent: Int,
    deliveredTotal: Int,
    byAgent: z.array(
      z.object({
        agentId: z.string(),
        name: z.string().nullable(),
        count: Int,
      }),
    ),
  }),
  trust: z.object({ reviewPassRate: Share, reworkRate: Share }),
  reliability: z.object({
    runs: Int,
    completedRuns: Int,
    failedRuns: Int,
    failuresByReason: z.record(z.string(), Int),
    claimLatencyP50Ms: Ms,
    claimLatencyP95Ms: Ms,
    runDurationP50Ms: Ms,
    lostRuns: Int,
  }),
  cost: z.object({
    inputTokens: Int,
    outputTokens: Int,
    estimatedCost: Costs.nullable(),
    costPerDeliveredIssue: Costs.nullable(),
    byAgent: z.array(
      z.object({
        agentId: z.string(),
        name: z.string().nullable(),
        cost: Costs.nullable(),
      }),
    ),
  }),
  humanLoad: z.object({
    decisionsCreated: Int,
    decisionsResolved: Int,
    decisionResolveP50Ms: Ms,
    openDecisions: Int,
    byOutcome: z.record(z.string(), Int),
    byKind: z.record(z.string(), Int),
  }),
  statuses: z.object({
    aiShare: Status,
    reviewPassRate: Status,
    claimLatencyP50Ms: Status,
    lostRuns: Status,
    decisionResolveP50Ms: Status,
  }),
});

const USAGE_GROUPS = [
  'agent',
  'person',
  'project',
  'issue',
  'day',
  'model',
  'tool',
] as const;

/** The usage report's grouping in the agents plugin's words. */
const PLUGIN_GROUP = {
  agent: 'agent',
  person: 'person',
  project: 'group',
  issue: 'subject',
  day: 'day',
  model: 'model',
  tool: 'tool',
} as const;

const UsageReport = z.object({
  from: z.string(),
  to: z.string(),
  groupBy: z.enum(USAGE_GROUPS),
  rows: z.array(UsageRow),
  totals: UsageRow,
  daily: z.array(
    z.object({
      day: z.string(),
      inputTokens: z.number(),
      outputTokens: z.number(),
      cacheReadTokens: z.number(),
      cacheWriteTokens: z.number(),
      cost: Costs.nullable(),
    }),
  ),
  unpricedModels: z.array(z.string()),
});

const DaysQuery = z.object({
  days: z.coerce
    .number()
    .default(30)
    .refine((days) => (REPORT_DAYS as readonly number[]).includes(days), {
      message: 'days must be 7, 30 or 90.',
    })
    .meta({ description: 'The number of days in the reporting period.' }),
});

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

const RangeFields = {
  from: z.string().regex(DAY_PATTERN).optional().meta({
    description:
      'The first day, YYYY-MM-DD (UTC); 30 days before `to` by default.',
  }),
  to: z
    .string()
    .regex(DAY_PATTERN)
    .optional()
    .meta({ description: 'The last day, YYYY-MM-DD (UTC); today by default.' }),
  projectId: z
    .string()
    .min(1)
    .optional()
    .meta({ description: 'The project identifier.' }),
};

const MetricsQuery = z.object(RangeFields);

const UsageQuery = z.object({
  ...RangeFields,
  groupBy: z
    .enum(USAGE_GROUPS)
    .default('agent')
    .meta({ description: 'The dimension to group usage by.' }),
  agentId: z
    .string()
    .min(1)
    .optional()
    .meta({ description: 'The agent identifier.' }),
  userId: z.string().min(1).optional().meta({
    description: 'Only the runs this person started (their user id).',
  }),
});

const noMissing = <T extends Record<string, unknown>>(value: T) =>
  Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  );

/**
 * The dashboard's figures (the demo's `reports/*`): delivery, agents, projects and what needs attention for people;
 * metrics and usage for a run too, as the person who woke it, when its agent may read reports. All of them need the
 * dashboard's page grant and are limited to what the caller may see (`server/reports/service.ts`).
 */
export const reportRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const routes = new Hono<Env>();
    const { container } = app;
    const auth = container.resolve(authenticationToken);
    const authz = container.resolve(authorizationToken);
    const figures = () => reportFiguresOf(container);

    const scopeOf = async (context: Ctx): Promise<ReportScope> => {
      const session = context.get('auth');
      if (!session) throw denied('Sign in first.');
      const access = context.get('authz');
      if (
        !(await access.can({
          resource: { type: 'page', id: REPORTS_PAGE },
          action: 'access',
        }))
      )
        throw denied('This needs the dashboard page.');
      const { identity } = access;
      const scoped = identity.keyScope?.objects('pm.projects') ?? 'all';
      const viewLevels = pmAccess
        .levelActionsOf('pm.issues/view')
        .map((level) => level.name);
      let subjects = false;
      for (const action of viewLevels)
        subjects ||= await access.can({
          resource: { type: pmAccess.RESOURCE_TYPE, id: 'pm.issues' },
          action,
        });
      return {
        viewer: {
          userId: session.user.id,
          actor: { type: 'user', id: session.user.id },
          permissions: await container
            .resolve(projectsAccessToken)
            .permissionsOf(identity),
          ...(scoped === 'all' ? {} : { projectIds: scoped }),
        },
        caller: {
          userId: session.user.id,
          allRuns: await access.can({
            resource: { type: 'settings', id: 'agents.agents' },
            action: 'read',
          }),
        },
        subjects,
      };
    };

    /** A project the caller cannot see answers like one that does not exist. */
    const requireProject = async (
      scope: ReportScope,
      projectId: string | undefined,
    ): Promise<void> => {
      if (!projectId) return;
      const seen = await container
        .resolve(projectsToken)
        .projects.accessTo(scope.viewer, { projectId });
      if (seen?.visible !== true)
        throw new ApiError({
          status: 'NOT_FOUND',
          reason: 'PROJECT_NOT_FOUND',
          domain: DOMAIN,
          message: 'No such project.',
        });
    };

    const translate = async () => {
      const i18n = container.resolve(i18nToken);
      const locale = i18n.getDefaultLocale();
      await i18n.ensureLocaleLoaded(locale);
      return i18n.getFixedT(APP_NS, locale);
    };

    for (const path of [
      '/reports/delivery',
      '/reports/agents',
      '/reports/projects',
      '/reports/attention',
    ])
      routes.use(path, auth.required(), authz.middleware());
    for (const path of ['/reports/metrics', '/reports/usage'])
      routes.use(path, auth.required({ scopedKeys: true }), authz.middleware());

    routes.get(
      '/reports/delivery',
      describeRoute({
        tags: ['Studio'],
        summary: 'Get the dashboard delivery figures',
        operationId: 'reportsGetDelivery',
        description: `The last \`days\` days up to today (UTC), against the days before them: issues completed, the median cycle time, the agents' share, the cost and tokens per issue, with a point per stretch of the period. ${GRANT_NOTE}`,
        security: PERSON,
        ...cliRoute({
          command: 'report delivery',
          examples: ['report delivery --days 7'],
        }),
        responses: {
          200: dataResponse(DeliveryReport),
          ...apiErrorResponses,
        },
      }),
      apiValidator('query', DaysQuery),
      async (context) =>
        context.json({
          data: await figures().delivery(
            await scopeOf(context),
            context.req.valid('query').days as ReportDays,
          ),
        }),
    );

    routes.get(
      '/reports/agents',
      describeRoute({
        tags: ['Studio'],
        summary: "Get the agents' performance",
        operationId: 'reportsGetAgents',
        description: `The last \`days\` days up to today (UTC), against the days before them: run success, rework, runs per issue, human intervention and queue wait, and the runs queued each day by how they ended. ${GRANT_NOTE}`,
        security: PERSON,
        ...cliRoute({
          command: 'report agents',
          examples: ['report agents --days 7'],
        }),
        responses: { 200: dataResponse(AgentsReport), ...apiErrorResponses },
      }),
      apiValidator('query', DaysQuery),
      async (context) =>
        context.json({
          data: await figures().agents(
            await scopeOf(context),
            context.req.valid('query').days as ReportDays,
          ),
        }),
    );

    routes.get(
      '/reports/projects',
      describeRoute({
        tags: ['Studio'],
        summary: "Get the projects' progress",
        operationId: 'reportsGetProjects',
        description: `Every project the caller may see but cancelled ones: its live issues now, done and blocked, and the issues it completed in the last \`days\` days with their median cycle time. ${GRANT_NOTE}`,
        security: PERSON,
        ...cliRoute({
          command: 'report projects',
          examples: ['report projects --days 7'],
        }),
        responses: { 200: dataResponse(ProjectsReport), ...apiErrorResponses },
      }),
      apiValidator('query', DaysQuery),
      async (context) =>
        context.json({
          data: await figures().projects(
            await scopeOf(context),
            context.req.valid('query').days as ReportDays,
          ),
        }),
    );

    routes.get(
      '/reports/attention',
      describeRoute({
        tags: ['Studio'],
        summary: 'Get what needs attention',
        operationId: 'reportsGetAttention',
        description: `The exceptions now: issues in Blocked, issues past their due date, pull requests open longer than two days, and runs on issues that failed in the last 24 hours and were neither retried nor decided on; each list holds its total and the first five. ${GRANT_NOTE}`,
        security: PERSON,
        ...cliRoute({ command: 'report attention' }),
        responses: { 200: dataResponse(AttentionReport), ...apiErrorResponses },
      }),
      async (context) =>
        context.json({
          data: await figures().attention(await scopeOf(context)),
        }),
    );

    routes.get(
      '/reports/metrics',
      describeRoute({
        tags: ['Studio'],
        summary: 'Get the acceptance metrics',
        operationId: 'reportsGetMetrics',
        description: `${GRANT_NOTE}${RUN_NOTE}`,
        security: PERSON_OR_RUN,
        ...cliRoute({
          command: 'report metrics',
          action: REPORTS_READ_ACTION,
          flags: {
            projectId: {
              name: 'project',
              description: "Only this project's issues and runs (its id).",
            },
          },
        }),
        responses: { 200: dataResponse(MetricsReport), ...apiErrorResponses },
      }),
      apiValidator('query', MetricsQuery),
      async (context) => {
        const query = context.req.valid('query');
        const scope = await scopeOf(context);
        await requireProject(scope, query.projectId);
        const data = await figures().metrics(scope, noMissing(query));
        const t = await translate();
        return context.json({
          data,
          meta: {
            message: t('studioReports.metricsMessage', {
              from: data.from,
              to: data.to,
              activeDays: data.adoption.activeDays,
              activeWeeks: data.adoption.activeWeeks,
              activeMembers: data.adoption.activeMembers,
              issuesCreated: data.adoption.issuesCreated,
              commentsCreated: data.adoption.commentsCreated,
              deliveredTotal: data.aiShare.deliveredTotal,
              deliveredByAgent: data.aiShare.deliveredByAgent,
              share: percentText(data.aiShare.share),
              passed: percentText(data.trust.reviewPassRate),
              reworked: percentText(data.trust.reworkRate),
              runs: data.reliability.runs,
              completedRuns: data.reliability.completedRuns,
              failedRuns: data.reliability.failedRuns,
              lostRuns: data.reliability.lostRuns,
              wait: durationText(data.reliability.claimLatencyP50Ms),
              duration: durationText(data.reliability.runDurationP50Ms),
              inputTokens: data.cost.inputTokens,
              outputTokens: data.cost.outputTokens,
              asked: data.humanLoad.decisionsCreated,
              decided: data.humanLoad.decisionsResolved,
              resolve: durationText(data.humanLoad.decisionResolveP50Ms),
              open: data.humanLoad.openDecisions,
            }),
          },
        });
      },
    );

    routes.get(
      '/reports/usage',
      describeRoute({
        tags: ['Studio'],
        summary: 'Get what agents’ runs used and cost',
        operationId: 'reportsGetUsage',
        description: `Grouped by agent, person, project, issue, day, model or tool. ${GRANT_NOTE}${RUN_NOTE}`,
        security: PERSON_OR_RUN,
        ...cliRoute({
          command: 'report usage',
          action: REPORTS_READ_ACTION,
          flags: {
            projectId: {
              name: 'project',
              description: "Only this project's issues and runs (its id).",
            },
            agentId: {
              name: 'agent',
              description: "Only this agent's runs (its id).",
            },
            userId: { name: 'user' },
          },
          examples: ['report usage --group-by model --from 2026-09-01'],
        }),
        responses: { 200: dataResponse(UsageReport), ...apiErrorResponses },
      }),
      apiValidator('query', UsageQuery),
      async (context) => {
        const { groupBy, projectId, ...filters } = context.req.valid('query');
        const scope = await scopeOf(context);
        await requireProject(scope, projectId);
        const usage = await container
          .resolve(agentsToken)
          .reporting.usage(scope.caller, {
            ...noMissing(filters),
            ...(projectId ? { groupId: projectId } : {}),
            groupBy: PLUGIN_GROUP[groupBy],
          });
        const t = await translate();
        return context.json({
          data: {
            ...usage,
            groupBy,
            daily: usage.daily.map(({ series: _series, ...point }) => point),
          },
          meta: {
            message: t('studioReports.usageMessage', {
              from: usage.from,
              to: usage.to,
              groupBy,
              runs: usage.totals.runs,
              inputTokens: usage.totals.inputTokens,
              outputTokens: usage.totals.outputTokens,
            }),
          },
        });
      },
    );

    router.route('/', routes);
    return router;
  });
