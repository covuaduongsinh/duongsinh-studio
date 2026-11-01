import {
  BUSINESS_KEYS,
  PAGES,
  RESOURCE_TYPE,
  SETTINGS_ACTIONS,
  SETTINGS_KEYS,
  levelActionsOf,
  type ActionLevel,
  type BusinessKey,
} from '@nocobase/app-plugin-projects/shared/access';
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
export type AbilityLevel = ActionLevel | 'none';

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

/**
 * The catalog is built from what the registered plugins declare. Today that is the projects plugin; the agents,
 * releases and knowledge plugins join it in the stages that use them.
 */
export function accessCatalog(): AccessCatalog {
  return {
    pages: [...PAGES],
    settings: SETTINGS_KEYS.map(({ key }) => key),
    abilities: BUSINESS_KEYS.map(({ key }) => ({
      key,
      levels: [
        'none',
        ...levelActionsOf(key).map(({ level }) => level),
      ] as AbilityLevel[],
    })),
  };
}

const businessIds = new Set<string>(
  BUSINESS_KEYS.map(({ business }) => business),
);
const settingsItems = new Set(Object.keys(SETTINGS_ACTIONS));
const pageIds = new Set<string>(PAGES);

/** Whether a grant belongs to the catalog this API edits; any other is kept as it is when a role is updated. */
function inCatalog(grant: PermissionGrant): boolean {
  const { type, id } = grant.resource;
  if (type === RESOURCE_TYPE) return businessIds.has(id);
  if (type === 'settings') return settingsItems.has(id);
  if (type === 'page') return pageIds.has(id);
  return false;
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
  for (const { item, action, key } of SETTINGS_KEYS) {
    settings[key] = owner || heldActions(set, 'settings', item).has(action);
  }
  const abilities: Record<string, AbilityLevel> = {};
  for (const { business, key } of BUSINESS_KEYS) {
    const held = heldActions(set, RESOURCE_TYPE, business);
    const levels = levelActionsOf(key);
    const highest = [...levels]
      .reverse()
      .find(({ name }) => owner || held.has(name));
    abilities[key] = highest ? highest.level : 'none';
  }
  const pages = PAGES.filter(
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
  for (const { item, action, key } of SETTINGS_KEYS) {
    if (!input.settings?.[key]) continue;
    const actions = settingsByItem.get(item) ?? [];
    actions.push({ action });
    settingsByItem.set(item, actions);
  }
  for (const [id, actions] of settingsByItem) {
    grants.push({ resource: { type: 'settings', id }, actions });
  }
  const abilitiesByBusiness = new Map<string, { action: string }[]>();
  for (const { business, key } of BUSINESS_KEYS) {
    const level = input.abilities?.[key] ?? 'none';
    if (level === 'none') continue;
    const chosen = levelActionsOf(key).find((entry) => entry.level === level);
    if (!chosen) continue;
    const actions = abilitiesByBusiness.get(business) ?? [];
    actions.push({ action: chosen.name });
    abilitiesByBusiness.set(business, actions);
  }
  for (const [id, actions] of abilitiesByBusiness) {
    grants.push({ resource: { type: RESOURCE_TYPE, id }, actions });
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
      problems.push(`abilities.${key as BusinessKey}: ${level}`);
  }
  return problems;
}

export { setKeyOfRole, roleOfSetKey };
