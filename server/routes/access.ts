import {
  authenticationToken,
  isServiceAccount,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization';
import {
  userManagementServiceToken,
  type UserRoleValue,
} from '@nocobase/app-plugin-users/server/tokens';
import type { Application } from '@nocobase/app-server/application';
import {
  ApiError,
  apiErrorResponses,
  apiValidator,
  dataResponse,
  emptyResponse,
  listResponse,
  defineApiRoutes,
  describeRoute,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { databaseManagerToken } from '@nocobase/db';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import {
  accessCatalog,
  grantsOf,
  invalidParts,
  roleOfSetKey,
  setKeyOfRole,
  toStudioRole,
  type StudioRole,
} from '../access/access-service.js';
import {
  readAccessSettings,
  writeAccessSettings,
} from '../access/access-settings.js';
import {
  BUILT_IN_ROLES,
  OWNER_ROLE,
  ROLE_KEY_PATTERN,
} from '../access/roles.js';
import { permissionsFrom } from '../providers/projects-access.js';

type Env = AuthEnv & AuthorizationEnv;

const DOMAIN = 'studio';

const Level = z.enum(['none', 'related', 'all']);
const Title = z.union([
  z.string().min(1).max(100),
  z.object({ key: z.string(), ns: z.string() }),
]);

const RoleSchema = z
  .object({
    key: z.string(),
    title: Title.nullable(),
    builtIn: z.boolean(),
    editable: z.boolean().meta({
      description: 'Whether its grants may be changed (not `owner`).',
    }),
    pages: z.array(z.string()),
    settings: z.record(z.string(), z.boolean()).meta({
      description:
        'Every settings capability of the catalog (`pm.general/read`), on or off.',
    }),
    abilities: z.record(z.string(), Level).meta({
      description:
        'Every business action of the catalog (`pm.issues/edit`) at its level.',
    }),
    holderIds: z
      .array(z.string())
      .meta({ description: 'Users assigned the role directly.' }),
    holderCount: z.number().int(),
  })
  .meta({ ref: 'StudioRole' });

const RoleParts = {
  pages: z.array(z.string()).optional(),
  settings: z.record(z.string(), z.boolean()).optional(),
  abilities: z.record(z.string(), Level).optional(),
};
const CreateRoleBody = z.object({
  key: z.string().regex(ROLE_KEY_PATTERN),
  title: Title,
  ...RoleParts,
});
const UpdateRoleBody = z.object({ title: Title.optional(), ...RoleParts });
const RoleParams = z.object({ roleKey: z.string() });
const MemberParams = z.object({ userId: z.string() });
const MembersQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  q: z.string().optional(),
});
const MemberRolesBody = z.object({ roles: z.array(z.string()) });
const SettingsSchema = z
  .object({
    defaultRole: z.string().nullable().meta({
      description: 'The role a new member is given once, or null for none.',
    }),
  })
  .meta({ ref: 'StudioAccessSettings' });
const MemberSchema = z.object({
  userId: z.string(),
  name: z.string(),
  email: z.string(),
  disabled: z.boolean(),
  roles: z.array(z.string()),
});
const CatalogSchema = z.object({
  pages: z.array(z.string()),
  settings: z.array(z.string()),
  abilities: z.array(z.object({ key: z.string(), levels: z.array(Level) })),
});

/** The permission sets of a user's `app` role scope, which holds one key or several. */
function setsOf(value: UserRoleValue | undefined): string[] {
  if (value === undefined || value === '') return [];
  return typeof value === 'string' ? [value] : [...value];
}

function denied(message: string): ApiError {
  return new ApiError({
    status: 'PERMISSION_DENIED',
    reason: 'ACCESS_DENIED',
    domain: DOMAIN,
    message,
  });
}

function notFound(message: string): ApiError {
  return new ApiError({
    status: 'NOT_FOUND',
    reason: 'ROLE_NOT_FOUND',
    domain: DOMAIN,
    message,
  });
}

function invalid(reason: string, message: string): ApiError {
  return new ApiError({
    status: 'INVALID_ARGUMENT',
    reason,
    domain: DOMAIN,
    message,
  });
}

/**
 * The Studio access API (`/api/access`, the Studio demo's contract): roles as three parts over the authorization
 * plugin's permission sets, members with their roles, and the default role for new members. Only people use it: an
 * API key, a run token or a service account is refused.
 */
export const accessRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const routes = new Hono<Env>();
    const auth = app.container.resolve(authenticationToken);
    const authz = app.container.resolve(authorizationToken);
    const users = app.container.resolve(userManagementServiceToken);
    const database = app.container.resolve(databaseManagerToken);

    const personId = (context: Context<Env>): string => {
      const session = context.get('auth');
      if (!session || session.credential || isServiceAccount(session.user)) {
        throw denied('Only people manage access.');
      }
      return session.user.id;
    };

    const requireMembers = async (
      context: Context<Env>,
      action: 'read' | 'assign' | 'define-roles',
    ): Promise<string> => {
      const userId = personId(context);
      const authorization = context.get('authz');
      const snapshot = await authorization.snapshot();
      const allowed =
        snapshot.unrestricted ||
        (await authorization.can({
          resource: { type: 'settings', id: 'pm.members' },
          action,
        }));
      if (!allowed) throw denied(`pm.members ${action} is required.`);
      return userId;
    };

    const holdersBySet = async (): Promise<Map<string, string[]>> => {
      const holders = new Map<string, string[]>();
      for (const assignment of await authz.permissionSets.listAssignments()) {
        if (assignment.subject.type !== 'user') continue;
        const list = holders.get(assignment.permissionSet) ?? [];
        list.push(assignment.subject.id);
        holders.set(assignment.permissionSet, list);
      }
      return holders;
    };

    const listRoles = async (): Promise<StudioRole[]> => {
      const holders = await holdersBySet();
      return (await authz.permissionSets.list())
        .filter((set) => roleOfSetKey(set.key) !== undefined)
        .map((set) => toStudioRole(set, holders.get(set.key) ?? []));
    };

    const getRole = async (role: string): Promise<StudioRole> => {
      const set = await authz.permissionSets.get(setKeyOfRole(role));
      if (!set || roleOfSetKey(set.key) === undefined)
        throw notFound(`Role ${role} does not exist.`);
      const holders = await holdersBySet();
      return toStudioRole(set, holders.get(set.key) ?? []);
    };

    const checkParts = (input: Parameters<typeof invalidParts>[0]) => {
      const problems = invalidParts(input);
      if (problems.length)
        throw invalid(
          'ROLE_PARTS_INVALID',
          `Not in the catalog: ${problems.join(', ')}.`,
        );
    };

    routes.use('*', auth.required(), authz.middleware());

    routes.get(
      '/catalog',
      describeRoute({
        tags: ['Studio'],
        summary: 'Get what a role can hold',
        operationId: 'studioAccessCatalog',
        responses: { '200': dataResponse(CatalogSchema), ...apiErrorResponses },
      }),
      async (context) => {
        await requireMembers(context, 'read');
        return context.json({ data: accessCatalog() });
      },
    );

    routes.get(
      '/me',
      describeRoute({
        tags: ['Studio'],
        summary: 'Get the caller’s own roles',
        operationId: 'studioAccessMe',
        responses: {
          '200': dataResponse(
            z.object({
              userId: z.string(),
              roles: z.array(z.string()),
              settings: z.record(z.string(), z.boolean()),
              abilities: z.record(z.string(), z.unknown()),
            }),
          ),
          ...apiErrorResponses,
        },
      }),
      async (context) => {
        const userId = personId(context);
        const roles = (await authz.permissionSets.listAssignments())
          .filter(
            (assignment) =>
              assignment.subject.type === 'user' &&
              assignment.subject.id === userId,
          )
          .map((assignment) => roleOfSetKey(assignment.permissionSet))
          .filter((role): role is string => role !== undefined);
        const permissions = await permissionsFrom(context.get('authz'), userId);
        return context.json({
          data: {
            userId,
            roles,
            settings: permissions.settings,
            abilities: permissions.scopes,
          },
        });
      },
    );

    routes.get(
      '/roles',
      describeRoute({
        tags: ['Studio'],
        summary: 'List the roles',
        operationId: 'studioAccessListRoles',
        responses: { '200': listResponse(RoleSchema), ...apiErrorResponses },
      }),
      async (context) => {
        await requireMembers(context, 'read');
        return context.json({ data: await listRoles() });
      },
    );

    routes.get(
      '/roles/:roleKey',
      describeRoute({
        tags: ['Studio'],
        summary: 'Get a role',
        operationId: 'studioAccessGetRole',
        responses: { '200': dataResponse(RoleSchema), ...apiErrorResponses },
      }),
      apiValidator('param', RoleParams),
      async (context) => {
        await requireMembers(context, 'read');
        return context.json({
          data: await getRole(context.req.valid('param').roleKey),
        });
      },
    );

    routes.post(
      '/roles',
      describeRoute({
        tags: ['Studio'],
        summary: 'Create a role',
        operationId: 'studioAccessCreateRole',
        responses: {
          '201': dataResponse(RoleSchema),
          ...apiErrorResponses,
        },
      }),
      apiValidator('json', CreateRoleBody),
      async (context) => {
        await requireMembers(context, 'define-roles');
        const body = context.req.valid('json');
        if (BUILT_IN_ROLES.includes(body.key))
          throw invalid('ROLE_EXISTS', `Role ${body.key} is built in.`);
        checkParts(body);
        const key = setKeyOfRole(body.key);
        if (await authz.permissionSets.get(key))
          throw invalid('ROLE_EXISTS', `Role ${body.key} already exists.`);
        await authz.permissionSets.create({
          key,
          title: body.title,
          grants: grantsOf(body),
        });
        return context.json({ data: await getRole(body.key) }, 201);
      },
    );

    routes.patch(
      '/roles/:roleKey',
      describeRoute({
        tags: ['Studio'],
        summary: 'Update a role',
        operationId: 'studioAccessUpdateRole',
        responses: { '200': dataResponse(RoleSchema), ...apiErrorResponses },
      }),
      apiValidator('param', RoleParams),
      apiValidator('json', UpdateRoleBody),
      async (context) => {
        await requireMembers(context, 'define-roles');
        const { roleKey } = context.req.valid('param');
        const body = context.req.valid('json');
        if (roleKey === OWNER_ROLE)
          throw denied('The owner role cannot be changed.');
        const current = await getRole(roleKey);
        checkParts(body);
        const set = await authz.permissionSets.get(setKeyOfRole(roleKey));
        if (!set) throw notFound(`Role ${roleKey} does not exist.`);
        await authz.permissionSets.update(
          set.key,
          {
            key: set.key,
            title: body.title ?? set.title,
            grants: grantsOf(
              {
                pages: body.pages ?? current.pages,
                settings: body.settings ?? current.settings,
                abilities: body.abilities ?? current.abilities,
              },
              set.grants,
            ),
          },
          set.revision,
        );
        return context.json({ data: await getRole(roleKey) });
      },
    );

    routes.delete(
      '/roles/:roleKey',
      describeRoute({
        tags: ['Studio'],
        summary: 'Delete a role',
        operationId: 'studioAccessDeleteRole',
        responses: {
          '204': emptyResponse(),
          ...apiErrorResponses,
        },
      }),
      apiValidator('param', RoleParams),
      async (context) => {
        await requireMembers(context, 'define-roles');
        const { roleKey } = context.req.valid('param');
        if (BUILT_IN_ROLES.includes(roleKey))
          throw denied(`The built-in role ${roleKey} cannot be deleted.`);
        const role = await getRole(roleKey);
        if (role.holderCount > 0)
          throw invalid(
            'ROLE_IN_USE',
            `Role ${roleKey} is held by ${role.holderCount} member(s).`,
          );
        const settings = await readAccessSettings(database.connection());
        if (settings.defaultRole === roleKey)
          throw invalid(
            'ROLE_IN_USE',
            `Role ${roleKey} is the default role for new members.`,
          );
        await authz.permissionSets.delete(setKeyOfRole(roleKey));
        return context.body(null, 204);
      },
    );

    routes.get(
      '/members',
      describeRoute({
        tags: ['Studio'],
        summary: 'List the members with their roles',
        operationId: 'studioAccessListMembers',
        responses: { '200': listResponse(MemberSchema), ...apiErrorResponses },
      }),
      apiValidator('query', MembersQuery),
      async (context) => {
        await requireMembers(context, 'read');
        const { page, pageSize, q } = context.req.valid('query');
        const result = await users.list({ page, pageSize, search: q });
        const holders = await holdersBySet();
        const rolesOf = (userId: string) =>
          [...holders]
            .filter(([, ids]) => ids.includes(userId))
            .map(([setKey]) => roleOfSetKey(setKey))
            .filter((role): role is string => role !== undefined);
        return context.json({
          data: result.items
            .filter((user) => user.kind === 'person')
            .map((user) => ({
              userId: user.id,
              name: user.name,
              email: user.email,
              disabled: user.disabledAt !== null,
              roles: rolesOf(user.id),
            })),
          meta: { page, pageSize, total: result.total },
        });
      },
    );

    routes.patch(
      '/members/:userId',
      describeRoute({
        tags: ['Studio'],
        summary: 'Replace a member’s roles',
        operationId: 'studioAccessUpdateMember',
        responses: { '200': dataResponse(MemberSchema), ...apiErrorResponses },
      }),
      apiValidator('param', MemberParams),
      apiValidator('json', MemberRolesBody),
      async (context) => {
        const actorId = await requireMembers(context, 'assign');
        const { userId } = context.req.valid('param');
        const roles = [...new Set(context.req.valid('json').roles)];
        const known = new Set((await listRoles()).map((role) => role.key));
        const unknown = roles.filter((role) => !known.has(role));
        if (unknown.length)
          throw invalid(
            'ROLE_NOT_FOUND',
            `Unknown role(s): ${unknown.join(', ')}.`,
          );
        const user = await users.get(userId);
        const currentSets = setsOf(user.roleScopes.app);
        const touchesOwner =
          roles.includes(OWNER_ROLE) !==
          currentSets.includes(setKeyOfRole(OWNER_ROLE));
        if (touchesOwner) {
          // Giving or taking the owner role is the owner's own decision.
          const snapshot = await context.get('authz').snapshot();
          if (!snapshot.unrestricted)
            throw denied('Only an owner gives or takes the owner role.');
        }
        // Studio replaces only its own roles; any other permission set the user holds (such as `member`) stays.
        const others = currentSets.filter(
          (setKey) => roleOfSetKey(setKey) === undefined,
        );
        const updated = await users.replaceRoleScope(
          userId,
          'app',
          [...others, ...roles.map(setKeyOfRole)],
          actorId,
        );
        const sets = setsOf(updated.roleScopes.app);
        return context.json({
          data: {
            userId: updated.id,
            name: updated.name,
            email: updated.email,
            disabled: updated.disabledAt !== null,
            roles: sets
              .map((setKey) => roleOfSetKey(setKey))
              .filter((role): role is string => role !== undefined),
          },
        });
      },
    );

    routes.get(
      '/settings',
      describeRoute({
        tags: ['Studio'],
        summary: 'Get the access settings',
        operationId: 'studioAccessGetSettings',
        responses: {
          '200': dataResponse(SettingsSchema),
          ...apiErrorResponses,
        },
      }),
      async (context) => {
        await requireMembers(context, 'read');
        return context.json({
          data: await readAccessSettings(database.connection()),
        });
      },
    );

    routes.put(
      '/settings',
      describeRoute({
        tags: ['Studio'],
        summary: 'Replace the access settings',
        operationId: 'studioAccessSetSettings',
        responses: {
          '200': dataResponse(SettingsSchema),
          ...apiErrorResponses,
        },
      }),
      apiValidator('json', SettingsSchema),
      async (context) => {
        await requireMembers(context, 'define-roles');
        const { defaultRole } = context.req.valid('json');
        if (defaultRole !== null) {
          if (defaultRole === OWNER_ROLE)
            throw invalid(
              'DEFAULT_ROLE_INVALID',
              'The owner role cannot be the default role.',
            );
          await getRole(defaultRole);
        }
        return context.json({
          data: await writeAccessSettings(database, { defaultRole }),
        });
      },
    );

    router.route('/access', routes);
    return router;
  });
