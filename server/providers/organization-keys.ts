import { authorizationToken } from '@nocobase/app-plugin-authorization';
import { apiKeyScopesToken } from '@nocobase/app-plugin-api-keys/server';
import * as agentsAccess from '@nocobase/app-plugin-agents/shared/access';
import * as kbAccess from '@nocobase/app-plugin-knowledge/shared/access';
import * as pmAccess from '@nocobase/app-plugin-projects/shared/access';
import * as relAccess from '@nocobase/app-plugin-releases/shared/access';
import { releasesKeyScopeObjects } from '@nocobase/app-plugin-releases/server';
import { releasesToken } from '@nocobase/app-plugin-releases/server/tokens';
import type { Application } from '@nocobase/app-server/application';
import { databaseManagerToken } from '@nocobase/db';
import { ServiceProvider } from '@nocobase/service-provider';
import { ADMIN_SET_KEY } from '../access/roles.js';
import { appText } from '../agents/ids.js';

/** The account organization API keys belong to (seed `202611100001_ds_organization_keys`). */
export const ORGANIZATION_KEYS_USER = 'studio-organization-keys';

/** Which plugin grants a business, by the business id's prefix: its resource type and each action's level names. */
const BUSINESSES: readonly {
  readonly prefix: string;
  readonly type: string;
  readonly levels: (key: never) => readonly { readonly name: string }[];
}[] = [
  {
    prefix: 'pm.',
    type: pmAccess.RESOURCE_TYPE,
    levels: pmAccess.levelActionsOf,
  },
  {
    prefix: 'agents.',
    type: agentsAccess.RESOURCE_TYPE,
    levels: agentsAccess.levelActionsOf,
  },
  {
    prefix: 'rel.',
    type: relAccess.RESOURCE_TYPE,
    levels: relAccess.levelActionsOf,
  },
  {
    prefix: 'kb.',
    type: kbAccess.RESOURCE_TYPE,
    levels: kbAccess.levelActionsOf,
  },
];

/**
 * Gives the organization keys' account the Admin role, explicitly and visibly: a key's reach is this role intersected
 * with its scope, so no organization key reaches further than an administrator.
 */
export default class OrganizationKeysProvider extends ServiceProvider<Application> {
  readonly name = 'app/organization-keys';

  private readonly releases: (() => void)[] = [];

  /**
   * What a key's scope may be made of: the groups the plugins declare, checked as their grants are. Limiting a group to
   * some records needs the plugin's record source. The releases plugin ships one for its Apps (`releasesKeyScopeObjects`)
   * and Studio wires it, so a key (a repository's CI key above all) can reach only the Apps it names. The other plugins'
   * sources are not wired yet, so their groups reach all records.
   */
  private offerScopes(): void {
    const { container } = this.app;
    if (!container.has(apiKeyScopesToken)) return;
    const scopes = container.resolve(apiKeyScopesToken);
    scopes.mapAccess((ref) => {
      if (ref.kind === 'page')
        return {
          resource: { type: 'page', id: ref.id },
          action: 'access',
        };
      if (ref.kind === 'settings')
        return {
          resource: { type: 'settings', id: ref.id },
          action: ref.action,
        };
      const business = BUSINESSES.find(({ prefix }) =>
        ref.id.startsWith(prefix),
      );
      if (!business) return null;
      return {
        resource: { type: business.type, id: ref.id },
        actions: business
          .levels(`${ref.id}/${ref.action}` as never)
          .map((level) => level.name),
      };
    });
    this.releases.push(
      scopes.groups.add({
        id: 'studio.checks',
        category: 'business',
        title: appText('studioOrgKeys.checksTitle'),
        description: appText('studioOrgKeys.checksDescription'),
        levels: {
          write: [{ kind: 'settings', id: 'studio.checks', action: 'report' }],
        },
      }),
    );
    for (const group of [
      ...pmAccess.KEY_SCOPE_GROUPS,
      ...agentsAccess.KEY_SCOPE_GROUPS,
    ]) {
      const { objects: _objects, ...whole } = group as typeof group & {
        objects?: unknown;
      };
      this.releases.push(scopes.groups.add(whole));
    }
    for (const group of relAccess.KEY_SCOPE_GROUPS) {
      // `releases.apps` may be limited to some Apps: the plugin lists them and its guards enforce the limit.
      if (group.objects)
        this.releases.push(
          scopes.groups.add(
            group,
            releasesKeyScopeObjects(() => container.resolve(releasesToken)),
          ),
        );
      else this.releases.push(scopes.groups.add(group));
    }
  }

  override async shutdown(): Promise<void> {
    for (const release of this.releases.splice(0)) release();
  }

  override async boot(): Promise<void> {
    const { container } = this.app;
    if (!container.has(authorizationToken)) return;
    const authz = container.resolve(authorizationToken);
    authz.ui.sections.add({
      name: 'studio',
      title: appText('studioOrgKeys.section'),
      parent: 'administration',
    });
    authz.settings.add({
      id: 'studio.apiKeys',
      title: appText('studioOrgKeys.settingsTitle'),
      actions: [
        { name: 'read', title: appText('studioOrgKeys.read') },
        { name: 'manage', title: appText('studioOrgKeys.manage') },
      ],
    });
    authz.ui.place(
      { type: 'settings', id: 'studio.apiKeys' },
      { section: 'studio' },
    );
    authz.settings.add({
      id: 'studio.checks',
      title: appText('studioOrgKeys.checksTitle'),
      actions: [{ name: 'report', title: appText('studioOrgKeys.report') }],
    });
    authz.ui.place(
      { type: 'settings', id: 'studio.checks' },
      { section: 'studio' },
    );
    this.offerScopes();
    const manager = container.resolve(databaseManagerToken);
    if (!(await manager.collections().getPhysical('user'))) return;
    const account = await manager
      .connection()
      .query.selectFrom('user')
      .select(['id'])
      .where('id', '=', ORGANIZATION_KEYS_USER)
      .executeTakeFirst();
    if (!account) return;
    const sets = authz.permissionSets;
    const held = await sets.listAssignments(ADMIN_SET_KEY);
    if (
      held.some(
        ({ subject }) =>
          subject.type === 'user' && subject.id === ORGANIZATION_KEYS_USER,
      )
    )
      return;
    await sets.assign({
      permissionSet: ADMIN_SET_KEY,
      subject: { type: 'user', id: ORGANIZATION_KEYS_USER },
    });
    await sets.notifyAssignmentsChanged({
      type: 'user',
      id: ORGANIZATION_KEYS_USER,
    });
  }
}
