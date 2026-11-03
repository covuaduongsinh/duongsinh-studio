import * as agentsAccess from '@nocobase/app-plugin-agents/shared/access';
import * as kbAccess from '@nocobase/app-plugin-knowledge/shared/access';
import * as projectsAccess from '@nocobase/app-plugin-projects/shared/access';
import * as releasesAccess from '@nocobase/app-plugin-releases/shared/access';
import type {
  AuthorizationTitle,
  PermissionGrant,
} from '@nocobase/authorization/core';
import type { PermissionSet } from '@nocobase/authorization/permission-sets';
import {
  BUILT_IN_ROLES,
  OWNER_ROLE,
  roleOfSetKey,
  setKeyOfRole,
} from './roles.js';

/** How far a role reaches with one business action. */
export type AbilityLevel = 'related' | 'all' | 'none';

/**
 * What a plugin offers to be granted, in the shape every plugin's `shared/access` declares: pages, settings items with
 * their actions, and business actions registered under one resource type, one authorization action per level.
 */
interface AccessSource {
  readonly PAGES: readonly string[];
  readonly SETTINGS_ACTIONS: Readonly<Record<string, readonly string[]>>;
  readonly RESOURCE_TYPE: string;
  readonly BUSINESS_KEYS: readonly {
    readonly business: string;
    readonly key: string;
  }[];
  levelActionsOf(key: never): readonly {
    readonly level: string;
    readonly name: string;
  }[];
}

/** The plugins whose capabilities make up a Studio role; the order is the catalog's. Releases joined in S5.4. */
const SOURCES: readonly AccessSource[] = [
  projectsAccess,
  agentsAccess,
  kbAccess,
  releasesAccess,
];

interface BusinessEntry {
  readonly type: string;
  readonly business: string;
  readonly key: string;
  readonly levels: readonly { readonly level: string; readonly name: string }[];
}

const businesses: readonly BusinessEntry[] = SOURCES.flatMap((source) =>
  source.BUSINESS_KEYS.map(({ business, key }) => ({
    type: source.RESOURCE_TYPE,
    business,
    key,
    levels: source.levelActionsOf(key as never),
  })),
);

const settingsEntries: readonly {
  readonly item: string;
  readonly action: string;
  readonly key: string;
}[] = SOURCES.flatMap((source) =>
  Object.entries(source.SETTINGS_ACTIONS).flatMap(([item, actions]) =>
    actions.map((action) => ({ item, action, key: `${item}/${action}` })),
  ),
);

const pageIds = new Set<string>(SOURCES.flatMap((source) => source.PAGES));
const settingsItems = new Set(settingsEntries.map(({ item }) => item));
const businessResources = new Set(
  businesses.map(({ type, business }) => `${type}:${business}`),
);

/** A Studio role as the access API answers it (`StudioRole` of the Studio demo). */
export interface StudioRole {
  readonly key: string;
  readonly title: AuthorizationTitle | null;
  readonly builtIn: boolean;
  /** Whether its grants may be changed: every role except `owner`. */
  readonly editable: boolean;
  readonly pages: readonly string[];
  readonly settings: Readonly<Record<string, boolean>>;
  readonly abilities: Readonly<Record<string, AbilityLevel>>;
  readonly holderIds: readonly string[];
  readonly holderCount: number;
}

/** What a role may be given: pages, settings capabilities, and business actions with their levels. */
export interface AccessCatalog {
  readonly pages: readonly string[];
  readonly settings: readonly string[];
  readonly abilities: readonly {
    readonly key: string;
    readonly levels: readonly AbilityLevel[];
  }[];
}

/** The grants a role's three parts stand for. */
export interface RoleGrantsInput {
  readonly pages?: readonly string[];
  readonly settings?: Readonly<Record<string, boolean>>;
  readonly abilities?: Readonly<Record<string, AbilityLevel>>;
}

/** The catalog, built from what the registered plugins declare. */
export function accessCatalog(): AccessCatalog {
  return {
    pages: [...pageIds],
    settings: settingsEntries.map(({ key }) => key),
    abilities: businesses.map(({ key, levels }) => ({
      key,
      levels: ['none', ...levels.map(({ level }) => level as AbilityLevel)],
    })),
  };
}

/** Whether a grant belongs to the catalog this API edits; any other is kept as it is when a role is updated. */
function inCatalog(grant: PermissionGrant): boolean {
  const { type, id } = grant.resource;
  if (type === 'settings') return settingsItems.has(id);
  if (type === 'page') return pageIds.has(id);
  return businessResources.has(`${type}:${id}`);
}

function heldActions(
  set: PermissionSet,
  type: string,
  id: string,
): Set<string> {
  const actions = new Set<string>();
  for (const grant of set.grants) {
    if (grant.resource.type !== type || grant.resource.id !== id) continue;
    for (const { action } of grant.actions) actions.add(action);
  }
  return actions;
}

/** A role as the API answers it. The owner is unrestricted, so it holds everything in the catalog. */
export function toStudioRole(
  set: PermissionSet,
  holderIds: readonly string[],
): StudioRole {
  const role = roleOfSetKey(set.key) ?? set.key;
  const owner = role === OWNER_ROLE;
  const settings: Record<string, boolean> = {};
  for (const { item, action, key } of settingsEntries) {
    settings[key] = owner || heldActions(set, 'settings', item).has(action);
  }
  const abilities: Record<string, AbilityLevel> = {};
  for (const { type, business, key, levels } of businesses) {
    const held = heldActions(set, type, business);
    const highest = [...levels]
      .reverse()
      .find(({ name }) => owner || held.has(name));
    abilities[key] = highest ? (highest.level as AbilityLevel) : 'none';
  }
  const pages = [...pageIds].filter(
    (page) => owner || heldActions(set, 'page', page).has('access'),
  );
  return {
    key: role,
    title: set.title ?? null,
    builtIn: BUILT_IN_ROLES.includes(role),
    editable: !owner,
    pages,
    settings,
    abilities,
    holderIds,
    holderCount: holderIds.length,
  };
}

/** Builds a role's grants from its parts; grants outside the catalog in `keep` (another plugin's) are preserved. */
export function grantsOf(
  input: RoleGrantsInput,
  keep: readonly PermissionGrant[] = [],
): PermissionGrant[] {
  const grants: PermissionGrant[] = keep.filter((grant) => !inCatalog(grant));
  for (const page of input.pages ?? []) {
    if (!pageIds.has(page)) continue;
    grants.push({
      resource: { type: 'page', id: page },
      actions: [{ action: 'access' }],
    });
  }
  const settingsByItem = new Map<string, { action: string }[]>();
  for (const { item, action, key } of settingsEntries) {
    if (!input.settings?.[key]) continue;
    const actions = settingsByItem.get(item) ?? [];
    actions.push({ action });
    settingsByItem.set(item, actions);
  }
  for (const [id, actions] of settingsByItem) {
    grants.push({ resource: { type: 'settings', id }, actions });
  }
  const abilitiesByResource = new Map<
    string,
    { type: string; id: string; actions: { action: string }[] }
  >();
  for (const { type, business, key, levels } of businesses) {
    const level = input.abilities?.[key] ?? 'none';
    if (level === 'none') continue;
    const chosen = levels.find((entry) => entry.level === level);
    if (!chosen) continue;
    const resource = `${type}:${business}`;
    const entry = abilitiesByResource.get(resource) ?? {
      type,
      id: business,
      actions: [],
    };
    entry.actions.push({ action: chosen.name });
    abilitiesByResource.set(resource, entry);
  }
  for (const { type, id, actions } of abilitiesByResource.values()) {
    grants.push({ resource: { type, id }, actions });
  }
  return grants;
}

/** Problems with a role's parts: unknown pages, settings, abilities or levels, as `field: value` messages. */
export function invalidParts(input: RoleGrantsInput): string[] {
  const catalog = accessCatalog();
  const problems: string[] = [];
  for (const page of input.pages ?? []) {
    if (!catalog.pages.includes(page)) problems.push(`pages: ${page}`);
  }
  for (const key of Object.keys(input.settings ?? {})) {
    if (!catalog.settings.includes(key)) problems.push(`settings: ${key}`);
  }
  for (const [key, level] of Object.entries(input.abilities ?? {})) {
    const entry = catalog.abilities.find((ability) => ability.key === key);
    if (!entry) problems.push(`abilities: ${key}`);
    else if (!entry.levels.includes(level))
      problems.push(`abilities.${key}: ${level}`);
  }
  return problems;
}

export { setKeyOfRole, roleOfSetKey };
