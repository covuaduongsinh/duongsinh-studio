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
  apiValidator,
  defineApiRoutes,
  describeRoute,
  apiErrorResponses,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import {
  listPlaybookDefinitions,
  listPlaybookInvocations,
  applyPlaybookToIssue,
} from '../playbooks/service.js';

type Env = AuthEnv & AuthorizationEnv;

const PERSON: Record<string, string[]>[] = [
  { cookieAuth: [] },
  { apiKeyAuth: [] },
];

const ApplyPlaybookInput = z.object({
  issueId: z.string().min(1),
  slug: z.string().min(1),
  params: z.record(z.string(), z.string()).optional(),
});

export const playbookRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const routes = new Hono<Env>();
    const { container } = app;
    const auth = container.resolve(authenticationToken);
    const authz = container.resolve(authorizationToken);
    const db = container.resolve(databaseManagerToken);

    for (const path of [
      '/playbooks',
      '/playbooks/invocations',
      '/playbooks/apply',
    ]) {
      routes.use(path, auth.required({ scopedKeys: true }), authz.middleware());
    }

    routes.get(
      '/playbooks',
      describeRoute({
        tags: ['Studio Playbooks'],
        summary: 'List available playbooks',
        description:
          'Returns all defined playbooks with parameters and criteria',
        security: PERSON,
        responses: {
          200: { description: 'List of playbooks.' },
          ...apiErrorResponses,
        },
      }),
      (c) => c.json({ data: listPlaybookDefinitions() }),
    );

    routes.get(
      '/playbooks/invocations',
      describeRoute({
        tags: ['Studio Playbooks'],
        summary: 'List recent playbook invocations',
        description: 'Returns the history of playbook usages across issues',
        security: PERSON,
        responses: {
          200: { description: 'List of recent invocations.' },
          ...apiErrorResponses,
        },
      }),
      async (c) => {
        const rows = await listPlaybookInvocations(db.connection('main'));
        return c.json({ data: rows });
      },
    );

    routes.post(
      '/playbooks/apply',
      describeRoute({
        tags: ['Studio Playbooks'],
        summary: 'Apply a playbook to an issue',
        description:
          'Applies default criteria and records invocation for an issue',
        security: PERSON,
        responses: {
          200: { description: 'Result of playbook application.' },
          ...apiErrorResponses,
        },
      }),
      apiValidator('json', ApplyPlaybookInput),
      async (c) => {
        const input = c.req.valid('json');
        const session = c.get('auth');
        const result = await applyPlaybookToIssue(db.connection('main'), {
          issueId: input.issueId,
          slug: input.slug,
          params: input.params,
          userId: session?.user?.id ?? null,
        });
        return c.json({
          data: {
            success: result.success,
            message: result.message,
            insertedCriteriaCount: result.insertedCriteriaCount,
          },
        });
      },
    );

    router.route('/', routes);
    return router;
  });

export default playbookRoutes;
