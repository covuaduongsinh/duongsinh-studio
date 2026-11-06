import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import type { AuthorizationEnv } from '@nocobase/app-plugin-authorization';
import {
  agentsToken,
  runIdentityOf,
} from '@nocobase/app-plugin-agents/server/tokens';
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
import { Hono } from 'hono';
import { z } from 'zod';
import { REVIEWS_SUBMIT_ACTION } from '../agents/actions.js';
import { gitServiceToken } from '../providers/git.js';
import { reviewsServiceToken } from '../providers/reviews.js';
import { ReviewError } from '../reviews/service.js';

type Env = AuthEnv & AuthorizationEnv;

const DOMAIN = 'studio';

const RUN_TOKEN_ONLY: Record<string, string[]>[] = [{ runToken: [] }];
const PERSON_OR_RUN: Record<string, string[]>[] = [
  { cookieAuth: [] },
  { apiKeyAuth: [] },
  { runToken: [] },
];

const ReviewSchema = z
  .object({
    id: z.string(),
    pullRequestId: z.string(),
    issueId: z.string().nullable(),
    headSha: z.string(),
    reviewerAgentId: z.string(),
    reviewerRunId: z.string(),
    authorAgentId: z.string(),
    verdict: z.enum(['approve', 'changes']),
    mustFix: z.number().int(),
    shouldFix: z.number().int(),
    kind: z.enum(['code', 'security']),
    sameModel: z.boolean(),
    checklist: z.record(z.string(), z.unknown()),
    summary: z.string(),
    createdAt: z.string(),
  })
  .meta({ ref: 'StudioReview' });

const SubmitReviewBody = z
  .object({
    pullRequestId: z.string().trim().min(1).meta({
      description: 'The pull request being reviewed.',
    }),
    headSha: z.string().trim().min(1).meta({
      description: 'The exact commit head SHA the review evaluates.',
    }),
    verdict: z.enum(['approve', 'changes']).meta({
      description: 'The review verdict.',
    }),
    mustFix: z.number().int().min(0).default(0).meta({
      description: 'Number of mandatory fixes required before merge.',
    }),
    shouldFix: z.number().int().min(0).default(0).meta({
      description: 'Number of recommended fixes.',
    }),
    kind: z.enum(['code', 'security']).default('code').meta({
      description: 'Whether this is a standard code review or an extra security review.',
    }),
    checklist: z.record(z.string(), z.unknown()).meta({
      description: 'Structured checklist results.',
    }),
    summary: z.string().trim().min(1).meta({
      description: 'Summary of the review findings.',
    }),
  })
  .strict();

const ListReviewsQuery = z.object({
  headSha: z.string().optional(),
  kind: z.enum(['code', 'security']).optional(),
});

const PullParams = z.object({ pullRequestId: z.string() });

export const reviewRoutes: AppApiRouteContribution<Application> = defineApiRoutes(
  (app) => {
    const router = new Hono();
    const routes = new Hono<Env>();
    const { container } = app;
    const auth = container.resolve(authenticationToken);
    const reviews = () => container.resolve(reviewsServiceToken);
    const git = () => container.resolve(gitServiceToken);

    // Only the paths this router owns: it mounts at the API root, where `*` would also require a session on everything
    // registered after it, public webhooks and run-token routes included.
    for (const path of ['/reviews', '/git/pullRequests/:pullRequestId/reviews'])
      routes.use(path, auth.required({ scopedKeys: true }));

    const handleError = (error: unknown): never => {
      if (error instanceof ReviewError) {
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

    routes.post(
      '/reviews',
      describeRoute({
        tags: ['Studio'],
        summary: 'Submit a structured review for a pull request',
        description:
          'Submits a structured review by an agent on a pull request. Run tokens only (read-only mode), action `studio.reviews/submit`.',
        operationId: 'studioSubmitReview',
        security: RUN_TOKEN_ONLY,
        ...cliRoute({
          command: 'review submit',
          action: REVIEWS_SUBMIT_ACTION,
        }),
        responses: {
          '201': dataResponse(ReviewSchema),
          ...apiErrorResponses,
        },
      }),
      apiValidator('json', SubmitReviewBody),
      async (context) => {
        const run = runIdentityOf(context.get('auth'));
        if (!run?.run) {
          throw new ApiError({
            status: 'PERMISSION_DENIED',
            reason: 'RUN_ONLY',
            domain: DOMAIN,
            message: 'Reviews may only be submitted by an agent run.',
          });
        }

        if (container.has(agentsToken)) {
          const agents = container.resolve(agentsToken);
          const allowed = await agents.gate.allowed(run);
          if (!allowed.has(REVIEWS_SUBMIT_ACTION)) {
            throw new ApiError({
              status: 'PERMISSION_DENIED',
              reason: 'ACCESS_DENIED',
              domain: DOMAIN,
              message:
                'The run does not hold permission to submit reviews (read-only mode required).',
            });
          }
        }

        const body = context.req.valid('json');
        try {
          const result = await reviews().submit({
            runId: run.run.run.id,
            ...body,
          });
          return context.json({ data: result }, 201);
        } catch (error) {
          return handleError(error);
        }
      },
    );

    routes.get(
      '/git/pullRequests/:pullRequestId/reviews',
      describeRoute({
        tags: ['Studio'],
        summary: 'List reviews for a pull request',
        description: 'Lists all structured review submissions for a pull request.',
        operationId: 'studioListReviews',
        security: PERSON_OR_RUN,
        ...cliRoute({ command: 'review list' }),
        responses: {
          '200': listResponse(ReviewSchema),
          ...apiErrorResponses,
        },
      }),
      apiValidator('param', PullParams),
      apiValidator('query', ListReviewsQuery),
      async (context) => {
        const { pullRequestId } = context.req.valid('param');
        const query = context.req.valid('query');
        try {
          await git().getPullRequest(pullRequestId);
          const results = await reviews().listForPull(pullRequestId, query);
          return context.json({ data: results });
        } catch (error) {
          return handleError(error);
        }
      },
    );

    router.route('/', routes);
    return router;
  },
);
