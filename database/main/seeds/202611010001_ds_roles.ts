import { defineSeed } from '@nocobase/db';
import { encodeAuthorizationTitle } from '@nocobase/authorization/core';
import {
  BUSINESS_KEYS,
  PAGES,
  RESOURCE_TYPE,
  SETTINGS_ACTIONS,
  levelActionsOf,
  type ActionLevel,
  type BusinessKey,
  type SettingsItem,
} from '@nocobase/app-plugin-projects/shared/access';

// Self-contained like a migration: the seed loader cannot import the application's own relative modules (see
// docs/chenh-lech-upstream.md), so the initial Admin and Contributor definitions are spelled out here. The keys must
// match server/access/roles.ts. Editing this seed never changes a running installation; administrators edit the sets.

type Level = ActionLevel | 'none';

interface Grant {
  readonly resource: { readonly type: string; readonly id: string };
  readonly actions: readonly { readonly action: string }[];
}

function businessGrants(abilities: Partial<Record<BusinessKey, Level>>): Grant[] {
  const byBusiness = new Map<string, { action: string }[]>();
  for (const { business, key } of BUSINESS_KEYS) {
    const level = abilities[key] ?? 'none';
    if (level === 'none') continue;
    const levels = levelActionsOf(key);
    // An action without related records has one level only; holding it at any level grants it.
    const chosen =
      levels.find((entry) => entry.level === level) ??
      levels[levels.length - 1];
    if (!chosen) continue;
    const actions = byBusiness.get(business) ?? [];
    actions.push({ action: chosen.name });
    byBusiness.set(business, actions);
  }
  return [...byBusiness].map(([id, actions]) => ({
    resource: { type: RESOURCE_TYPE, id },
    actions,
  }));
}

function settingsGrants(
  settings: Partial<Record<SettingsItem, readonly string[]>>,
): Grant[] {
  return Object.entries(settings).map(([id, actions]) => ({
    resource: { type: 'settings', id },
    actions: (actions ?? []).map((action) => ({ action })),
  }));
}

const pageGrants: Grant[] = PAGES.map((id) => ({
  resource: { type: 'page', id },
  actions: [{ action: 'access' }],
}));

const roles: readonly { key: string; title: string; grants: Grant[] }[] = [
  {
    key: 'ds-admin',
    title: 'Admin',
    grants: [
      ...pageGrants,
      ...businessGrants(
        Object.fromEntries(BUSINESS_KEYS.map(({ key }) => [key, 'all'])),
      ),
      ...settingsGrants(SETTINGS_ACTIONS),
    ],
  },
  {
    key: 'ds-contributor',
    title: 'Contributor',
    grants: [
      ...pageGrants,
      ...businessGrants({
        'pm.projects/view': 'related',
        'pm.projects/create': 'all',
        'pm.projects/manage': 'related',
        'pm.issues/view': 'related',
        'pm.issues/create': 'related',
        'pm.issues/edit': 'related',
        'pm.issues/comment': 'related',
        'pm.issues/close': 'related',
        'pm.issues/change-owner': 'related',
        'pm.attachments/upload': 'related',
      }),
      ...settingsGrants({
        'pm.general': ['read'],
        'pm.labels': ['read'],
        'pm.members': ['read'],
      }),
    ],
  },
];

/** Creates the Admin and Contributor permission sets on a fresh install; an administrator's own definition is kept. */
export default defineSeed({
  name: '202611010001_ds_roles',
  transaction: true,
  async run({ query }) {
    const now = new Date();
    for (const role of roles) {
      const existing = await query
        .selectFrom('authorizationPermissionSets')
        .select('id')
        .where('key', '=', role.key)
        .executeTakeFirst();
      if (existing) continue;
      await query
        .insertInto('authorizationPermissionSets')
        .values({
          id: role.key,
          key: role.key,
          title: encodeAuthorizationTitle(role.title),
          grants: JSON.stringify(role.grants),
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  },
});
