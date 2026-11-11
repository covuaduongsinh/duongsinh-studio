import {
  authenticationToken,
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
  type Viewer,
} from '@nocobase/app-plugin-projects/server/tokens';
import type { Application } from '@nocobase/app-server/application';
import {
  ApiError,
  apiErrorResponse,
  apiErrorResponses,
  apiValidator,
  cliRoute,
  dataResponse,
  defineApiRoutes,
  describeRoute,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { databaseManagerToken } from '@nocobase/db';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { z } from 'zod';
import { str } from '../git/rows.js';
import { CRITERIA_PROPOSE_ACTION } from '../agents/actions.js';

type Env = AuthEnv & AuthorizationEnv;
type Ctx = Context<Env>;

const DOMAIN = 'studio';

const PERSON_OR_RUN: Record<string, string[]>[] = [
  { cookieAuth: [] },
  { apiKeyAuth: [] },
  { runToken: [] },
];

export const CheckKindEnum = z.enum(['test', 'command', 'ci', 'human']);

export const CriterionInputSchema = z.object({
  text: z.string().trim().min(1).max(2000),
  checkKind: CheckKindEnum,
  checkValue: z.string().trim().max(1000).nullable().optional(),
});

export const CriteriaListInputSchema = z.object({
  criteria: z.array(CriterionInputSchema),
});

export const CriterionOutputSchema = z.object({
  id: z.string(),
  issueId: z.string().optional(),
  projectId: z.string().optional(),
  text: z.string(),
  checkKind: CheckKindEnum,
  checkValue: z.string().nullable(),
  position: z.number().int(),
  source: z.enum(['human', 'agent', 'projectDefault']).optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type CriterionOutput = z.infer<typeof CriterionOutputSchema>;

const IssueParam = z.object({ issueId: z.string() });
const ProjectParam = z.object({ projectId: z.string() });

const notFound = (what: string): ApiError =>
  new ApiError({
    status: 'NOT_FOUND',
    reason: 'NOT_FOUND',
    domain: DOMAIN,
    message: `${what} not found.`,
  });

const denied = (message: string, reason = 'ACCESS_DENIED'): ApiError =>
  new ApiError({
    status: 'PERMISSION_DENIED',
    reason,
    domain: DOMAIN,
    message,
  });

interface IssueRow {
  readonly id: string;
  readonly identifier: string;
  readonly title: string;
  readonly ownerUserId: string;
  readonly projectId?: string | null;
}

export const issueCriteriaRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const routes = new Hono<Env>();
    const { container } = app;
    const auth = container.resolve(authenticationToken);
    const authz = container.resolve(authorizationToken);
    const projects = () => container.resolve(projectsToken);
    const conn = () => container.resolve(databaseManagerToken).connection();

    for (const path of [
      '/issues/:issueId/criteria',
      '/issues/:issueId/criteria/propose',
      '/projects/:projectId/defaultCriteria',
    ]) {
      routes.use(path, auth.required({ scopedKeys: true }), authz.middleware());
    }

    const viewerOf = async (context: Ctx): Promise<Viewer> => {
      const session = context.get('auth');
      if (!session) throw denied('Sign in first.');
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

    const visibleIssue = async (
      viewer: Viewer,
      issueId: string,
    ): Promise<IssueRow> => {
      try {
        return await projects().issueQueries.visible(viewer, issueId);
      } catch {
        throw notFound('Issue');
      }
    };

    const actableIssue = async (
      viewer: Viewer,
      issueId: string,
    ): Promise<IssueRow> => {
      const issue = await visibleIssue(viewer, issueId);
      const scope = viewer.permissions.scopes[
        'pm.issues/edit' as never
      ] as unknown as string | undefined;
      if (issue.ownerUserId !== viewer.userId && (!scope || scope === 'none'))
        throw denied('Only someone who may edit the issue can do this.');
      return issue;
    };

    const checkProjectAccess = async (
      viewer: Viewer,
      projectId: string,
      action: 'view' | 'manage',
    ): Promise<void> => {
      const access = await projects().projects.accessTo(viewer, {
        projectId,
      });
      if (!access) throw notFound('Project');
      if (action === 'manage' && !access.manage)
        throw denied('Only project managers can configure default criteria.');
    };

    // 1. GET /api/issues/:issueId/criteria
    routes.get(
      '/issues/:issueId/criteria',
      describeRoute({
        description: 'Returns the acceptance criteria of an issue in order.',
        security: PERSON_OR_RUN,
        ...cliRoute({
          command: 'criteria list',
        }),
        responses: {
          '200': dataResponse(z.array(CriterionOutputSchema)),
          ...apiErrorResponses,
          404: apiErrorResponse(404),
        },
      }),
      apiValidator('param', IssueParam),
      async (c) => {
        const { issueId } = c.req.valid('param');
        const viewer = await viewerOf(c);
        await visibleIssue(viewer, issueId);

        const rows = await conn()
          .query.selectFrom('dsIssueCriteria')
          .selectAll()
          .where('issueId', '=', issueId)
          .orderBy('position', 'asc')
          .execute();

        const criteria = rows.map((row) => ({
          id: str(row.id),
          issueId: str(row.issueId),
          text: str(row.text),
          checkKind: row.checkKind as z.infer<typeof CheckKindEnum>,
          checkValue: row.checkValue != null ? str(row.checkValue) : null,
          position: Number(row.position),
          source: (row.source ?? 'human') as
            'human' | 'agent' | 'projectDefault',
          createdAt: row.createdAt
            ? new Date(row.createdAt as string | number | Date).toISOString()
            : undefined,
          updatedAt: row.updatedAt
            ? new Date(row.updatedAt as string | number | Date).toISOString()
            : undefined,
        }));

        return c.json({ data: criteria });
      },
    );

    // 2. PUT /api/issues/:issueId/criteria
    routes.put(
      '/issues/:issueId/criteria',
      describeRoute({
        description: 'Replaces the acceptance criteria of an issue.',
        security: PERSON_OR_RUN,
        ...cliRoute({
          command: 'criteria set',
        }),
        responses: {
          '200': dataResponse(z.array(CriterionOutputSchema)),
          ...apiErrorResponses,
          403: apiErrorResponse(403),
          404: apiErrorResponse(404),
        },
      }),
      apiValidator('param', IssueParam),
      apiValidator('json', CriteriaListInputSchema),
      async (c) => {
        const { issueId } = c.req.valid('param');
        const { criteria } = c.req.valid('json');
        const viewer = await viewerOf(c);
        await actableIssue(viewer, issueId);

        const now = new Date();
        const connection = conn();

        await connection.query
          .deleteFrom('dsIssueCriteria')
          .where('issueId', '=', issueId)
          .execute();

        const insertedRows: CriterionOutput[] = [];

        for (let i = 0; i < criteria.length; i++) {
          const item = criteria[i];
          const id = crypto.randomUUID();
          await connection.query
            .insertInto('dsIssueCriteria')
            .values({
              id,
              issueId,
              text: item.text,
              checkKind: item.checkKind,
              checkValue: item.checkValue ?? null,
              position: i,
              source: 'human',
              createdAt: now,
              updatedAt: now,
            })
            .execute();

          insertedRows.push({
            id,
            issueId,
            text: item.text,
            checkKind: item.checkKind,
            checkValue: item.checkValue ?? null,
            position: i,
            source: 'human',
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
          });
        }

        try {
          await projects().activity.record(connection, {
            issueId,
            actor: viewer.actor,
            action: 'criteria_changed',
            details: { count: criteria.length, action: 'update' },
          });
        } catch (err) {
          console.warn('Could not record activity for criteria_changed', err);
        }

        return c.json({ data: insertedRows });
      },
    );

    // 3. POST /api/issues/:issueId/criteria/propose
    routes.post(
      '/issues/:issueId/criteria/propose',
      describeRoute({
        description:
          'Proposes new criteria for an issue (effective immediately).',
        security: PERSON_OR_RUN,
        ...cliRoute({
          command: 'criteria propose',
        }),
        responses: {
          '200': dataResponse(z.array(CriterionOutputSchema)),
          ...apiErrorResponses,
          403: apiErrorResponse(403),
          404: apiErrorResponse(404),
        },
      }),
      apiValidator('param', IssueParam),
      apiValidator('json', CriteriaListInputSchema),
      async (c) => {
        const { issueId } = c.req.valid('param');
        const { criteria } = c.req.valid('json');
        const viewer = await viewerOf(c);
        await visibleIssue(viewer, issueId);

        const isRun = Boolean(runIdentityOf(c.get('auth'))?.run);
        if (isRun) {
          const scope = viewer.permissions.scopes[
            'pm.issues/edit' as never
          ] as unknown as string | undefined;
          const hasEdit = scope && scope !== 'none';
          const actions = (
            viewer.permissions as { actions?: readonly string[] }
          ).actions;
          const hasAction =
            Array.isArray(actions) && actions.includes(CRITERIA_PROPOSE_ACTION);
          if (!hasEdit && !hasAction) {
            throw denied('Run does not have permission to propose criteria.');
          }
        }

        const source = isRun ? 'agent' : 'human';
        const now = new Date();
        const connection = conn();

        // Get max current position
        const existing = await connection.query
          .selectFrom('dsIssueCriteria')
          .select(['position'])
          .where('issueId', '=', issueId)
          .orderBy('position', 'desc')
          .limit(1)
          .execute();

        const startPos =
          existing.length > 0 && existing[0].position != null
            ? Number(existing[0].position) + 1
            : 0;

        const insertedRows: CriterionOutput[] = [];

        for (let i = 0; i < criteria.length; i++) {
          const item = criteria[i];
          const id = crypto.randomUUID();
          const position = startPos + i;
          await connection.query
            .insertInto('dsIssueCriteria')
            .values({
              id,
              issueId,
              text: item.text,
              checkKind: item.checkKind,
              checkValue: item.checkValue ?? null,
              position,
              source,
              createdAt: now,
              updatedAt: now,
            })
            .execute();

          insertedRows.push({
            id,
            issueId,
            text: item.text,
            checkKind: item.checkKind,
            checkValue: item.checkValue ?? null,
            position,
            source,
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
          });
        }

        try {
          await projects().activity.record(connection, {
            issueId,
            actor: viewer.actor,
            action: 'criteria_changed',
            details: { count: criteria.length, action: 'propose' },
          });
        } catch (err) {
          console.warn('Could not record activity for criteria_changed', err);
        }

        return c.json({ data: insertedRows });
      },
    );

    // 4. GET /api/projects/:projectId/defaultCriteria
    routes.get(
      '/projects/:projectId/defaultCriteria',
      describeRoute({
        description: 'Returns the default acceptance criteria of a project.',
        security: PERSON_OR_RUN,
        ...cliRoute({
          command: 'criteria defaults',
        }),
        responses: {
          '200': dataResponse(z.array(CriterionOutputSchema)),
          ...apiErrorResponses,
          404: apiErrorResponse(404),
        },
      }),
      apiValidator('param', ProjectParam),
      async (c) => {
        const { projectId } = c.req.valid('param');
        const viewer = await viewerOf(c);
        await checkProjectAccess(viewer, projectId, 'view');

        const rows = await conn()
          .query.selectFrom('dsProjectDefaultCriteria')
          .selectAll()
          .where('projectId', '=', projectId)
          .orderBy('position', 'asc')
          .execute();

        const criteria = rows.map((row) => ({
          id: str(row.id),
          projectId: str(row.projectId),
          text: str(row.text),
          checkKind: row.checkKind as z.infer<typeof CheckKindEnum>,
          checkValue: row.checkValue != null ? str(row.checkValue) : null,
          position: Number(row.position),
          source: 'projectDefault' as const,
          createdAt: row.createdAt
            ? new Date(row.createdAt as string | number | Date).toISOString()
            : undefined,
          updatedAt: row.updatedAt
            ? new Date(row.updatedAt as string | number | Date).toISOString()
            : undefined,
        }));

        return c.json({ data: criteria });
      },
    );

    // 5. PUT /api/projects/:projectId/defaultCriteria
    routes.put(
      '/projects/:projectId/defaultCriteria',
      describeRoute({
        description: 'Replaces the default acceptance criteria of a project.',
        security: PERSON_OR_RUN,
        ...cliRoute({
          command: 'criteria set-defaults',
        }),
        responses: {
          '200': dataResponse(z.array(CriterionOutputSchema)),
          ...apiErrorResponses,
          403: apiErrorResponse(403),
          404: apiErrorResponse(404),
        },
      }),
      apiValidator('param', ProjectParam),
      apiValidator('json', CriteriaListInputSchema),
      async (c) => {
        const { projectId } = c.req.valid('param');
        const { criteria } = c.req.valid('json');
        const viewer = await viewerOf(c);
        await checkProjectAccess(viewer, projectId, 'manage');

        const now = new Date();
        const connection = conn();

        await connection.query
          .deleteFrom('dsProjectDefaultCriteria')
          .where('projectId', '=', projectId)
          .execute();

        const insertedRows: CriterionOutput[] = [];

        for (let i = 0; i < criteria.length; i++) {
          const item = criteria[i];
          const id = crypto.randomUUID();
          await connection.query
            .insertInto('dsProjectDefaultCriteria')
            .values({
              id,
              projectId,
              text: item.text,
              checkKind: item.checkKind,
              checkValue: item.checkValue ?? null,
              position: i,
              createdAt: now,
              updatedAt: now,
            })
            .execute();

          insertedRows.push({
            id,
            projectId,
            text: item.text,
            checkKind: item.checkKind,
            checkValue: item.checkValue ?? null,
            position: i,
            source: 'projectDefault',
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
          });
        }

        return c.json({ data: insertedRows });
      },
    );

    router.route('/', routes);
    return router;
  });
