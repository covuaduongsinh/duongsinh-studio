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
import {
  apiValidator,
  defineApiRoutes,
  describeRoute,
  apiErrorResponses,
  cliRoute,
  ApiError,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { secretFindingsServiceToken } from '../providers/security.js';
import { SecretFindingError } from '../security/service.js';

const DOMAIN = 'security';

type Env = AuthEnv & AuthorizationEnv;

const PERSON_OR_RUN: Record<string, string[]>[] = [
  { cookieAuth: [] },
  { apiKeyAuth: [] },
  { runToken: [] },
];

export const SecretFindingSchema = z
  .object({
    id: z.string(),
    issueId: z.string().nullable(),
    commentId: z.string().nullable(),
    patternKey: z.string(),
    fingerprint: z.string(),
    status: z.enum(['active', 'resolved', 'ignored']),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .meta({ ref: 'StudioSecretFinding' });

const UpdateStatusBody = z.object({
  status: z.enum(['resolved', 'ignored']),
});

const IssueIdParam = z.object({
  id: z.string(),
});

const FindingIdParam = z.object({
  id: z.string(),
});

export const secretFindingsRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const routes = new Hono<Env>();
    const { container } = app;
    const auth = container.resolve(authenticationToken);
    const authz = container.resolve(authorizationToken);
    const security = () => container.resolve(secretFindingsServiceToken);

    for (const path of [
      '/issues/:id/secret-findings',
      '/secret-findings/:id/status',
    ]) {
      routes.use(path, auth.required({ scopedKeys: true }), authz.middleware());
    }

    const handleError = (error: unknown) => {
      if (error instanceof ApiError) throw error;
      if (error instanceof SecretFindingError) {
        throw new ApiError({
          status: error.status === 404 ? 'NOT_FOUND' : 'INVALID_ARGUMENT',
          reason: error.reason,
          domain: DOMAIN,
          message: error.message,
        });
      }
      throw error;
    };

    // 1. GET /issues/:id/secret-findings
    routes.get(
      '/issues/:id/secret-findings',
      describeRoute({
        tags: ['Studio'],
        summary: 'List secret findings detected on an issue',
        description:
          'Returns detected secret findings for an issue. Raw secret matches are never stored or exposed.',
        security: PERSON_OR_RUN,
        ...cliRoute({ command: 'issue secret-findings' }),
        responses: {
          200: { description: 'List of secret findings.' },
          ...apiErrorResponses,
        },
      }),
      apiValidator('param', IssueIdParam),
      async (c) => {
        const { id } = c.req.valid('param');
        try {
          const findings = await security().listFindings({ issueId: id });
          return c.json({ data: findings });
        } catch (error) {
          return handleError(error);
        }
      },
    );

    // 2. POST /secret-findings/:id/status
    routes.post(
      '/secret-findings/:id/status',
      describeRoute({
        tags: ['Studio'],
        summary: 'Update status of a secret finding',
        description: 'Marks a secret finding as resolved or ignored.',
        security: PERSON_OR_RUN,
        ...cliRoute({ command: 'secret-finding status' }),
        responses: {
          200: { description: 'Updated secret finding.' },
          ...apiErrorResponses,
        },
      }),
      apiValidator('param', FindingIdParam),
      apiValidator('json', UpdateStatusBody),
      async (c) => {
        const { id } = c.req.valid('param');
        const { status } = c.req.valid('json');
        try {
          const finding = await security().updateFindingStatus(id, status);
          return c.json({ data: finding });
        } catch (error) {
          return handleError(error);
        }
      },
    );

    router.route('/', routes);
    return router;
  });
