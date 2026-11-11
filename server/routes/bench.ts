import { Hono, type Context } from 'hono';
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
import {
  apiValidator,
  defineApiRoutes,
  describeRoute,
  apiErrorResponse,
  apiErrorResponses,
  cliRoute,
  ApiError,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { benchServiceToken } from '../providers/bench.js';
import { BenchError } from '../bench/service.js';

const DOMAIN = 'bench';

type Env = AuthEnv & AuthorizationEnv;
type Ctx = Context<Env>;

const StartBenchRunSchema = z.object({
  set: z.string().default('ds-core').optional(),
  taskKey: z.string().optional(),
  force: z.boolean().default(false).optional(),
});

const ListBenchRunsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const BenchRunIdParam = z.object({
  id: z.string(),
});

export const benchRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const routes = new Hono<Env>();
    const { container } = app;
    const auth = container.resolve(authenticationToken);
    const authz = container.resolve(authorizationToken);
    const bench = () => container.resolve(benchServiceToken);

    for (const path of [
      '/bench/run',
      '/bench/status',
      '/bench/runs',
      '/bench/runs/:id',
      '/bench/runs/:id/evaluate',
    ]) {
      routes.use(path, auth.required({ scopedKeys: true }), authz.middleware());
    }

    const denied = (message: string) =>
      new ApiError({
        status: 'PERMISSION_DENIED',
        reason: 'FORBIDDEN',
        domain: DOMAIN,
        message,
      });

    const requireAdmin = async (c: Ctx) => {
      const snapshot = await c.get('authz').snapshot();
      if (!snapshot.unrestricted) {
        throw denied('Only administrators may run or inspect benchmarks.');
      }
    };

    const handleError = (error: unknown): never => {
      if (error instanceof BenchError) {
        throw new ApiError({
          status: error.status,
          reason: error.reason,
          domain: DOMAIN,
          message: error.message,
          cause: error,
        });
      }
      throw error;
    };

    // 1. GET /bench/status
    routes.get(
      '/bench/status',
      describeRoute({
        summary:
          'Retrieves current benchmark limits, run count, and recent status.',
        description:
          'Returns monthly run count, limits, and last benchmark run summary. Administrator only.',
        ...cliRoute({ command: 'bench status' }),
        responses: {
          200: { description: 'Benchmark status and limits.' },
          ...apiErrorResponses,
          403: apiErrorResponse(403),
        },
      }),
      async (c) => {
        await requireAdmin(c);
        try {
          const status = await bench().getStatus();
          return c.json({ data: status });
        } catch (error) {
          return handleError(error);
        }
      },
    );

    // 2. GET /bench/runs
    routes.get(
      '/bench/runs',
      describeRoute({
        summary: 'Lists recent benchmark runs.',
        description:
          'Returns up to limit most recent benchmark runs. Administrator only.',
        ...cliRoute({ command: 'bench list' }),
        responses: {
          200: { description: 'Recent benchmark runs.' },
          ...apiErrorResponses,
          403: apiErrorResponse(403),
        },
      }),
      apiValidator('query', ListBenchRunsQuery),
      async (c) => {
        await requireAdmin(c);
        const { limit } = c.req.valid('query');
        try {
          const runs = await bench().listRuns(limit);
          return c.json({ data: runs });
        } catch (error) {
          return handleError(error);
        }
      },
    );

    // 3. GET /bench/runs/:id
    routes.get(
      '/bench/runs/:id',
      describeRoute({
        summary: 'Gets details of a benchmark run.',
        description:
          'Returns benchmark run view including individual task results. Administrator only.',
        ...cliRoute({ command: 'bench get' }),
        responses: {
          200: { description: 'Benchmark run details.' },
          ...apiErrorResponses,
          403: apiErrorResponse(403),
        },
      }),
      apiValidator('param', BenchRunIdParam),
      async (c) => {
        await requireAdmin(c);
        const { id } = c.req.valid('param');
        try {
          const run = await bench().getRun(id);
          return c.json({ data: run });
        } catch (error) {
          return handleError(error);
        }
      },
    );

    // 4. POST /bench/run
    routes.post(
      '/bench/run',
      describeRoute({
        summary: 'Starts a new benchmark run.',
        description:
          'Triggers a full bench run (max 4 per month) or a single task run. Administrator only.',
        ...cliRoute({ command: 'bench run' }),
        responses: {
          201: { description: 'Benchmark run started.' },
          ...apiErrorResponses,
          403: apiErrorResponse(403),
        },
      }),
      apiValidator('json', StartBenchRunSchema),
      async (c) => {
        await requireAdmin(c);
        const body = c.req.valid('json');
        try {
          const run = await bench().startRun({
            set: body.set,
            taskKey: body.taskKey,
            force: body.force,
            trigger: 'manual',
          });
          return c.json({ data: run }, 201);
        } catch (error) {
          return handleError(error);
        }
      },
    );

    router.route('/', routes);
    return router;
  });
