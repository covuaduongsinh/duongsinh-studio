import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization';
import {
  ApiKeyRequestError,
  ApiKeyScopeError,
  isApiKeySession,
  scopedApiKeysToken,
  toApiKeysApiError,
} from '@nocobase/app-plugin-api-keys/server';
import {
  levelsUpTo,
  type KeyScopeInput,
} from '@nocobase/app-plugin-api-keys/shared/scopes';
import type { ApiKeyView } from '@nocobase/app-plugin-api-keys/shared/scopes';
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
import { randomUUID } from 'node:crypto';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { z } from 'zod';
import { str, strOrNull } from '../git/rows.js';
import { ORGANIZATION_KEYS_USER } from '../providers/organization-keys.js';

type Env = AuthEnv & AuthorizationEnv;
type Ctx = Context<Env>;

const DOMAIN = 'studio';
const EVENTS = 'dsOrganizationKeyEvents';
const SETTINGS = 'studio.apiKeys';
const COOKIE: Record<string, string[]>[] = [{ cookieAuth: [] }];
const SIGNED_IN =
  'Needs a signed-in session (every API key is refused) and `studio.apiKeys`';

const denied = (message: string, reason = 'ACCESS_DENIED'): ApiError =>
  new ApiError({
    status: 'PERMISSION_DENIED',
    reason,
    domain: DOMAIN,
    message,
  });

const Scope = z
  .object({
    groups: z.record(
      z.string(),
      z.object({
        level: z.enum(['read', 'write', 'admin']),
        objects: z.union([z.literal('all'), z.array(z.string())]).optional(),
      }),
    ),
  })
  .meta({ ref: 'StudioOrgApiKeyScope' });

const OrgKey = z
  .object({
    id: z.string(),
    keyId: z.string().nullable(),
    name: z.string(),
    description: z.string().nullable(),
    scope: Scope.nullable(),
    start: z.string().nullable(),
    createdBy: z.object({ id: z.string(), name: z.string() }).nullable(),
    createdAt: z.string(),
    expiresAt: z.string().nullable(),
    lastUsedAt: z.string().nullable(),
    status: z.enum(['active', 'disabled', 'expired']),
    managedBy: z
      .object({
        resourceId: z.string(),
        projectId: z.string(),
        projectName: z.string(),
        repo: z.string().nullable(),
      })
      .nullable(),
  })
  .meta({ ref: 'StudioOrgApiKey' });

const CreatedKey = z
  .object({ key: OrgKey, secret: z.string() })
  .meta({ ref: 'StudioCreatedOrgApiKey' });

const EventAction = z.enum([
  'created',
  'updated',
  'permissions-changed',
  'rotated',
  'disabled',
  'enabled',
  'deleted',
]);
type EventActionName = z.infer<typeof EventAction>;

const KeyEvent = z.object({
  id: z.string(),
  action: EventAction,
  actor: z.object({ id: z.string(), name: z.string() }).nullable(),
  details: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.string(),
});

const CreateBody = z.object({
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  expiresInDays: z.number().int().positive().nullable(),
  scope: Scope,
});
const UpdateBody = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
});
const ScopeBody = z.object({ scope: Scope });
const KeyParams = z.object({ keyId: z.string().min(1) });

const listMeta = z.object({ total: z.number().int() });

/**
 * API keys of the organization (the demo's `organizationKeys`): they belong to an account of their own rather than to
 * whoever made them, so CI keeps working when that person leaves. A key reaches what its scope says within the Admin
 * role, and may be given only what the person giving it holds. Every change is kept as an event.
 */
export const organizationKeyRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const routes = new Hono<Env>();
    const { container } = app;
    const auth = container.resolve(authenticationToken);
    const authz = container.resolve(authorizationToken);
    const keys = () => container.resolve(scopedApiKeysToken);
    const conn = () => container.resolve(databaseManagerToken).connection();

    const require = async (
      context: Ctx,
      action: 'read' | 'manage',
    ): Promise<string> => {
      const session = context.get('auth');
      if (!session) throw denied('Sign in first.');
      // `credential` is a run's token; an API key, scoped or not, reads as its owner's session.
      if (
        session.credential ||
        isApiKeySession(session, context.req.raw.headers)
      )
        throw denied('Organization keys are managed from a signed-in session.');
      const allowed = await context.get('authz').can({
        resource: { type: 'settings', id: SETTINGS },
        action,
      });
      if (!allowed) throw denied(`${SETTINGS} ${action} is required.`);
      return session.user.id;
    };

    const guarded = async <T>(work: () => Promise<T>): Promise<T> => {
      try {
        return await work();
      } catch (failure) {
        if (
          failure instanceof ApiKeyRequestError ||
          failure instanceof ApiKeyScopeError
        )
          throw toApiKeysApiError(failure);
        throw failure;
      }
    };

    const record = async (
      keyId: string,
      action: EventActionName,
      actorId: string | null,
      details: Record<string, unknown> | null = null,
    ): Promise<void> => {
      await conn()
        .query.insertInto(EVENTS)
        .values({
          id: randomUUID(),
          keyId,
          action,
          actorId,
          details: details === null ? null : JSON.stringify(details),
          createdAt: new Date(),
        })
        .execute();
    };

    const namesOf = async (
      ids: readonly string[],
    ): Promise<ReadonlyMap<string, string>> => {
      if (ids.length === 0) return new Map();
      const rows = await conn()
        .query.selectFrom('user')
        .select(['id', 'name'])
        .where('id', 'in', [...new Set(ids)])
        .execute();
      return new Map(rows.map((row) => [str(row.id), str(row.name)]));
    };

    const viewsOf = async (found: readonly ApiKeyView[]) => {
      const creators = found.length
        ? await conn()
            .query.selectFrom(EVENTS)
            .select(['keyId', 'actorId'])
            .where('action', '=', 'created')
            .where(
              'keyId',
              'in',
              found.map((key) => key.id),
            )
            .execute()
        : [];
      const creatorOf = new Map(
        creators.map((row) => [str(row.keyId), strOrNull(row.actorId)]),
      );
      const names = await namesOf(
        [...creatorOf.values()].filter((id): id is string => id !== null),
      );
      const now = Date.now();
      return found.map((key) => {
        const creator = creatorOf.get(key.id) ?? null;
        return {
          id: key.id,
          keyId: key.id,
          name: key.name ?? '',
          description: key.description,
          scope: key.scope as z.infer<typeof Scope> | null,
          start: key.start,
          createdBy: creator
            ? { id: creator, name: names.get(creator) ?? creator }
            : null,
          createdAt: key.createdAt,
          expiresAt: key.expiresAt,
          lastUsedAt: key.lastUsedAt,
          status: !key.enabled
            ? ('disabled' as const)
            : key.expiresAt && Date.parse(key.expiresAt) <= now
              ? ('expired' as const)
              : ('active' as const),
          managedBy: null,
        };
      });
    };

    const viewOf = async (key: ApiKeyView) => {
      const [view] = await viewsOf([key]);
      if (!view) throw new Error('A key always has a view.');
      return view;
    };

    /** Refuses a scope reaching further than the person giving it. */
    const requireHeld = async (
      userId: string,
      scope: KeyScopeInput,
    ): Promise<void> => {
      const options = await keys().scopeOptions(userId);
      for (const [id, grant] of Object.entries(scope.groups)) {
        const group = options.groups.find((item) => item.id === id);
        if (!group) continue;
        const holds = levelsUpTo(grant.level)
          .filter((level) => group.levels.includes(level))
          .every((level) => group.held[level]);
        if (!holds)
          throw denied(
            `The key would reach further than you do in ${id}.`,
            'KEY_SCOPE_EXCEEDS_YOURS',
          );
      }
    };

    const setEnabled = async (keyId: string, enabled: boolean) => {
      await guarded(() => keys().get(ORGANIZATION_KEYS_USER, keyId));
      await conn()
        .query.updateTable('apikey')
        .set({ enabled, updatedAt: new Date() })
        .where('id', '=', keyId)
        .where('referenceId', '=', ORGANIZATION_KEYS_USER)
        .execute();
      return keys().get(ORGANIZATION_KEYS_USER, keyId);
    };

    for (const path of ['/organizationKeys', '/organizationKeys/*'])
      routes.use(path, auth.required(), authz.middleware());

    routes.get(
      '/organizationKeys',
      describeRoute({
        tags: ['Studio'],
        summary: 'List the organization’s API keys',
        operationId: 'organizationKeysList',
        description: `${SIGNED_IN} \`read\`.`,
        security: COOKIE,
        ...cliRoute({
          command: 'access org-key list',
          columns: ['id', 'name', 'status', 'expiresAt', 'lastUsedAt'],
        }),
        responses: {
          200: listResponse(OrgKey, listMeta),
          ...apiErrorResponses,
        },
      }),
      async (context) => {
        await require(context, 'read');
        const data = await viewsOf(await keys().list(ORGANIZATION_KEYS_USER));
        return context.json({ data, meta: { total: data.length } });
      },
    );

    routes.post(
      '/organizationKeys',
      describeRoute({
        tags: ['Studio'],
        summary: 'Create an organization API key',
        operationId: 'organizationKeysCreate',
        description: `${SIGNED_IN} \`manage\`. The secret is answered once. The key gets only what the caller holds (403 \`KEY_SCOPE_EXCEEDS_YOURS\`).`,
        security: COOKIE,
        ...cliRoute({ command: 'access org-key create' }),
        responses: { 201: dataResponse(CreatedKey), ...apiErrorResponses },
      }),
      apiValidator('json', CreateBody),
      async (context) => {
        const userId = await require(context, 'manage');
        const body = context.req.valid('json');
        await requireHeld(userId, body.scope);
        const created = await guarded(() =>
          keys().create(
            ORGANIZATION_KEYS_USER,
            body,
            context.get('authz').identity,
          ),
        );
        await record(created.key.id, 'created', userId, { name: body.name });
        return context.json(
          {
            data: { key: await viewOf(created.key), secret: created.secret },
          },
          201,
        );
      },
    );

    routes.get(
      '/organizationKeys/scopeOptions',
      describeRoute({
        tags: ['Studio'],
        summary: 'What an organization key may be given',
        operationId: 'organizationKeysScopeOptions',
        description: `${SIGNED_IN} \`manage\`.`,
        security: COOKIE,
        ...cliRoute({ command: 'access org-key scope-options' }),
        responses: { 200: dataResponse(z.unknown()), ...apiErrorResponses },
      }),
      async (context) => {
        const userId = await require(context, 'manage');
        return context.json({ data: await keys().scopeOptions(userId) });
      },
    );

    routes.get(
      '/organizationKeys/:keyId',
      describeRoute({
        tags: ['Studio'],
        summary: 'Read an organization API key',
        operationId: 'organizationKeysGet',
        description: `${SIGNED_IN} \`read\`.`,
        security: COOKIE,
        ...cliRoute({ command: 'access org-key get' }),
        responses: { 200: dataResponse(OrgKey), ...apiErrorResponses },
      }),
      apiValidator('param', KeyParams),
      async (context) => {
        await require(context, 'read');
        const { keyId } = context.req.valid('param');
        return context.json({
          data: await viewOf(
            await guarded(() => keys().get(ORGANIZATION_KEYS_USER, keyId)),
          ),
        });
      },
    );

    routes.patch(
      '/organizationKeys/:keyId',
      describeRoute({
        tags: ['Studio'],
        summary: 'Rename an organization API key',
        operationId: 'organizationKeysUpdate',
        description: `${SIGNED_IN} \`manage\`.`,
        security: COOKIE,
        ...cliRoute({ command: 'access org-key update' }),
        responses: { 200: dataResponse(OrgKey), ...apiErrorResponses },
      }),
      apiValidator('param', KeyParams),
      apiValidator('json', UpdateBody),
      async (context) => {
        const userId = await require(context, 'manage');
        const { keyId } = context.req.valid('param');
        const body = context.req.valid('json');
        const updated = await guarded(() =>
          keys().update(ORGANIZATION_KEYS_USER, keyId, body),
        );
        await record(keyId, 'updated', userId, body);
        return context.json({ data: await viewOf(updated) });
      },
    );

    routes.delete(
      '/organizationKeys/:keyId',
      describeRoute({
        tags: ['Studio'],
        summary: 'Delete an organization API key',
        operationId: 'organizationKeysDelete',
        description: `${SIGNED_IN} \`manage\`.`,
        security: COOKIE,
        ...cliRoute({ command: 'access org-key delete' }),
        responses: { 204: { description: 'Deleted.' }, ...apiErrorResponses },
      }),
      apiValidator('param', KeyParams),
      async (context) => {
        const userId = await require(context, 'manage');
        const { keyId } = context.req.valid('param');
        await guarded(() => keys().revoke(ORGANIZATION_KEYS_USER, keyId));
        await record(keyId, 'deleted', userId);
        return context.body(null, 204);
      },
    );

    routes.put(
      '/organizationKeys/:keyId/scope',
      describeRoute({
        tags: ['Studio'],
        summary: 'Change what an organization API key reaches',
        operationId: 'organizationKeysSetScope',
        description: `${SIGNED_IN} \`manage\`. The key gets only what the caller holds (403 \`KEY_SCOPE_EXCEEDS_YOURS\`).`,
        security: COOKIE,
        ...cliRoute({ command: 'access org-key scope set' }),
        responses: { 200: dataResponse(OrgKey), ...apiErrorResponses },
      }),
      apiValidator('param', KeyParams),
      apiValidator('json', ScopeBody),
      async (context) => {
        const userId = await require(context, 'manage');
        const { keyId } = context.req.valid('param');
        const { scope } = context.req.valid('json');
        await requireHeld(userId, scope);
        const updated = await guarded(() =>
          keys().setScope(
            ORGANIZATION_KEYS_USER,
            keyId,
            scope,
            context.get('authz').identity,
          ),
        );
        await record(keyId, 'permissions-changed', userId, { scope });
        return context.json({ data: await viewOf(updated) });
      },
    );

    routes.post(
      '/organizationKeys/:keyId/rotate',
      describeRoute({
        tags: ['Studio'],
        summary: 'Give an organization API key a new secret',
        operationId: 'organizationKeysRotate',
        description: `${SIGNED_IN} \`manage\`. Keeps the identity, key id, name and permissions; the new secret is answered once.`,
        security: COOKIE,
        ...cliRoute({ command: 'access org-key rotate' }),
        responses: { 200: dataResponse(CreatedKey), ...apiErrorResponses },
      }),
      apiValidator('param', KeyParams),
      async (context) => {
        const userId = await require(context, 'manage');
        const { keyId } = context.req.valid('param');
        const rotated = await guarded(() =>
          keys().rotate(ORGANIZATION_KEYS_USER, keyId),
        );
        await record(keyId, 'rotated', userId);
        return context.json({
          data: { key: await viewOf(rotated.key), secret: rotated.secret },
        });
      },
    );

    for (const [path, enabled, action, summary, operationId, command] of [
      [
        '/organizationKeys/:keyId/disable',
        false,
        'disabled',
        'Stop an organization API key working',
        'organizationKeysDisable',
        'access org-key disable',
      ],
      [
        '/organizationKeys/:keyId/enable',
        true,
        'enabled',
        'Let a disabled organization API key work again',
        'organizationKeysEnable',
        'access org-key enable',
      ],
    ] as const)
      routes.post(
        path,
        describeRoute({
          tags: ['Studio'],
          summary,
          operationId,
          description: `${SIGNED_IN} \`manage\`.`,
          security: COOKIE,
          ...cliRoute({ command }),
          responses: { 200: dataResponse(OrgKey), ...apiErrorResponses },
        }),
        apiValidator('param', KeyParams),
        async (context) => {
          const userId = await require(context, 'manage');
          const { keyId } = context.req.valid('param');
          const updated = await guarded(() => setEnabled(keyId, enabled));
          await record(keyId, action, userId);
          return context.json({ data: await viewOf(updated) });
        },
      );

    routes.get(
      '/organizationKeys/:keyId/events',
      describeRoute({
        tags: ['Studio'],
        summary: 'What happened to an organization API key',
        operationId: 'organizationKeysEvents',
        description: `${SIGNED_IN} \`read\`. Newest first.`,
        security: COOKIE,
        ...cliRoute({ command: 'access org-key events' }),
        responses: {
          200: listResponse(KeyEvent, listMeta),
          ...apiErrorResponses,
        },
      }),
      apiValidator('param', KeyParams),
      async (context) => {
        await require(context, 'read');
        const { keyId } = context.req.valid('param');
        const rows = await conn()
          .query.selectFrom(EVENTS)
          .selectAll()
          .where('keyId', '=', keyId)
          .orderBy('createdAt', 'desc')
          .execute();
        const names = await namesOf(
          rows.flatMap((row) => {
            const actor = strOrNull(row.actorId);
            return actor ? [actor] : [];
          }),
        );
        const data = rows.map((row) => {
          const actor = strOrNull(row.actorId);
          const details: unknown =
            typeof row.details === 'string'
              ? JSON.parse(row.details)
              : row.details;
          return {
            id: str(row.id),
            action: EventAction.parse(str(row.action)),
            actor: actor
              ? { id: actor, name: names.get(actor) ?? actor }
              : null,
            details: (details ?? null) as Record<string, unknown> | null,
            createdAt: new Date(row.createdAt as string | Date).toISOString(),
          };
        });
        return context.json({ data, meta: { total: data.length } });
      },
    );

    router.route('/', routes);
    return router;
  });
