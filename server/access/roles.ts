/**
 * Dương Sinh Studio roles, as the Studio demo models them: `owner` is the platform's protected root set (unrestricted,
 * not editable), `admin` and `contributor` are editable permission sets, and an administrator may add more. Each Studio
 * role is a permission set of the authorization plugin; the API names it by its role key. The initial Admin and
 * Contributor grants are created by `database/main/seeds/202611010001_ds_roles.ts`; keep the keys in step with it.
 */
export const ROOT_SET_KEY = 'root';
export const ADMIN_SET_KEY = 'ds-admin';
export const CONTRIBUTOR_SET_KEY = 'ds-contributor';

export const OWNER_ROLE = 'owner';
export const ADMIN_ROLE = 'admin';
export const CONTRIBUTOR_ROLE = 'contributor';
export const BUILT_IN_ROLES: readonly string[] = [
  OWNER_ROLE,
  ADMIN_ROLE,
  CONTRIBUTOR_ROLE,
];

/** Custom role keys: lowercase, start with a letter, at most 40 characters. */
export const ROLE_KEY_PATTERN = /^[a-z][a-z0-9-]{0,39}$/;

const SET_PREFIX = 'ds-';

/** The permission set a role is stored as. */
export function setKeyOfRole(role: string): string {
  return role === OWNER_ROLE ? ROOT_SET_KEY : `${SET_PREFIX}${role}`;
}

/** The role a permission set stands for, or undefined for a set Studio does not manage (such as `member`). */
export function roleOfSetKey(setKey: string): string | undefined {
  if (setKey === ROOT_SET_KEY) return OWNER_ROLE;
  return setKey.startsWith(SET_PREFIX)
    ? setKey.slice(SET_PREFIX.length)
    : undefined;
}

/** The sets whose holders count as administrators for the projects plugin (owner notices, member management). */
export const ADMINISTRATOR_SET_KEYS: readonly string[] = [
  ROOT_SET_KEY,
  ADMIN_SET_KEY,
];
