import { Hono } from 'hono';
import { z } from 'zod';
import type { Application } from '@nocobase/app-server/application';
import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization';
import { databaseManagerToken } from '@nocobase/db';
import {
  defineApiRoutes,
  describeRoute,
  apiErrorResponses,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { getRunnerRecommendations } from '../runner/service.js';

type Env = AuthEnv & AuthorizationEnv;

const PERSON: Record<string, string[]>[] = [
  { cookieAuth: [] },
  { apiKeyAuth: [] },
];

const RunnerLimitsSchema = z.object({
  memoryMax: z.string(),
  memorySwapMax: z.string(),
  cpuQuota: z.string(),
  memoryHigh: z.string().optional(),
});

const ProxyAllowlistDomainSchema = z.object({
  domain: z.string(),
  description: z.string(),
  protocol: z.enum(['https', 'http']),
  required: z.boolean(),
});

const RunnerObservationSchema = z.object({
  sampleRunsCount: z.number(),
  medianDurationMs: z.number().nullable(),
  p95DurationMs: z.number().nullable(),
  estimatedPeakMemoryMb: z.number(),
});

export const RunnerRecommendationSchema = z.object({
  sliceName: z.string(),
  currentLimits: RunnerLimitsSchema,
  proposedLimits: RunnerLimitsSchema,
  recommendedProxyAllowlist: z.array(ProxyAllowlistDomainSchema),
  observation: RunnerObservationSchema,
});

export const runnerRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const routes = new Hono<Env>();
    const { container } = app;
    const auth = container.resolve(authenticationToken);
    const authz = container.resolve(authorizationToken);
    const db = container.resolve(databaseManagerToken);

    routes.use(
      '/runner/recommendations',
      auth.required({ scopedKeys: true }),
      authz.middleware(),
    );

    routes.get(
      '/runner/recommendations',
      describeRoute({
        tags: ['Studio Runner'],
        summary: 'Get runner resource observation and limit recommendations',
        description:
          'Returns current and proposed resource limits, observed run durations, and proxy allowlist for user-1002.slice',
        security: PERSON,
        responses: {
          200: { description: 'Runner recommendations.' },
          ...apiErrorResponses,
        },
      }),
      async (c) => {
        const recommendations = await getRunnerRecommendations(
          db.connection('main'),
        );
        return c.json({ data: recommendations });
      },
    );

    router.route('/', routes);
    return router;
  });

export default runnerRoutes;
