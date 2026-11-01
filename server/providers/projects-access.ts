import type { Application } from '@nocobase/app-server/application';
import { authorizationToken } from '@nocobase/app-plugin-authorization';
import {
  projectsAccessToken,
  type ProjectsAccess,
} from '@nocobase/app-plugin-projects/server/tokens';
import {
  BUSINESS_KEYS,
  RESOURCE_TYPE,
  SETTINGS_KEYS,
  levelActionsOf,
  noAbilities,
  noSettings,
  type Permissions,
  type Scope,
} from '@nocobase/app-plugin-projects/shared/access';
import type {
  AuthorizationContext,
  AuthorizationIdentity,
  KeyScope,
} from '@nocobase/authorization/core';
import type { DatabaseConnection } from '@nocobase/db';
import { ServiceProvider } from '@nocobase/service-provider';
import { readAccessSettings } from '../access/access-settings.js';
import {
  ADMINISTRATOR_SET_KEYS,
  roleOfSetKey,
  setKeyOfRole,
} from '../access/roles.js';

/**
 * Tells the projects plugin what each person may do, read from the permission sets the authorization plugin stores
 * (`server/access/roles.ts`). A business action's scope is the highest level the person holds: `all`, or `related`,
 * which the plugin resolves to the records related to the caller.
 */
export async function permissionsFrom(
  context: AuthorizationContext,
  userId: string,
): Promise<Permissions> {
  const snapshot = await context.snapshot();
  const scopes = noAbilities();
  const settings = noSettings();
  for (const { business, key } of BUSINESS_KEYS) {
    const levels = [...levelActionsOf(key)].reverse();
    let scope: Scope = 'none';
    for (const { level, name } of levels) {
      const held =
        snapshot.unrestricted ||
        (await context.can({
          resource: { type: RESOURCE_TYPE, id: business },
          action: name,
        }));
      if (!held) continue;
      scope = level === 'all' ? 'all' : { users: [userId] };
      break;
    }
    scopes[key] = scope;
  }
  for (const { item, action, key } of SETTINGS_KEYS) {
    settings[key] =
      snapshot.unrestricted ||
      (await context.can({ resource: { type: 'settings', id: item }, action }));
  }
  return { scopes, settings };
}

/** A person's authorization identity outside a request, optionally kept to an API key's scope. */
export function userIdentity(
  userId: string,
  keyScope?: KeyScope,
): AuthorizationIdentity {
  return {
    principal: { type: 'user', id: userId },
    // Every signed-in person also matches grants given to the authenticated audience. This app registers no team
    // subject types; add their memberships here if it ever does.
    subjects: [{ type: 'authenticated', id: '*' }],
    ...(keyScope ? { keyScope } : {}),
  };
}

/** Binds `projectsAccessToken` so the projects plugin can boot with real roles. */
export default class ProjectsAccessProvider extends ServiceProvider<Application> {
  readonly name = 'app/projects-access';

  override register(): void {
    this.app.container.singleton(projectsAccessToken, (): ProjectsAccess => {
      const authz = () => this.app.container.resolve(authorizationToken);
      return {
        permissionsOf: (identity) =>
          permissionsFrom(authz().for(identity), identity.principal.id),
        permissionsOfUser: (userId) =>
          permissionsFrom(authz().for(userIdentity(userId)), userId),
        // A new member gets the default role only when an administrator has chosen one (`PUT /api/access/settings`,
        // none by default), and only if they hold no Studio role yet. The members list shows who holds it.
        admit: async (conn: DatabaseConnection, userId: string) => {
          const { defaultRole } = await readAccessSettings(conn);
          if (!defaultRole) return;
          const sets = authz().permissionSets.withTransaction(conn);
          const held = (await sets.listAssignments()).some(
            (assignment) =>
              assignment.subject.type === 'user' &&
              assignment.subject.id === userId &&
              roleOfSetKey(assignment.permissionSet) !== undefined,
          );
          if (held) return;
          const permissionSet = setKeyOfRole(defaultRole);
          if (!(await sets.get(permissionSet))) return;
          await sets.assign({
            permissionSet,
            subject: { type: 'user', id: userId },
          });
          await sets.notifyAssignmentsChanged({ type: 'user', id: userId });
        },
        changed: (userId) =>
          authz().permissionSets.notifyAssignmentsChanged({
            type: 'user',
            id: userId,
          }),
        administrators: async (conn: DatabaseConnection) => {
          const sets = authz().permissionSets.withTransaction(conn);
          const ids = new Set<string>();
          for (const key of ADMINISTRATOR_SET_KEYS) {
            for (const assignment of await sets.listAssignments(key)) {
              if (assignment.subject.type === 'user')
                ids.add(assignment.subject.id);
            }
          }
          return [...ids];
        },
      };
    });
  }
}
