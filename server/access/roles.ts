/**
 * Dương Sinh Studio roles, as the Studio demo models them: `owner` is the platform's protected root set (unrestricted,
 * not editable), `admin` and `contributor` are editable permission sets an administrator assigns to each person. Their
 * initial grants are created by `database/main/seeds/202611010001_ds_roles.ts`; keep the keys in step with it. New
 * members get no role automatically; see `.agents/rules/duongsinh-studio.md`.
 */
export const ROOT_SET_KEY = 'root';
export const ADMIN_SET_KEY = 'ds-admin';
export const CONTRIBUTOR_SET_KEY = 'ds-contributor';

/** The sets whose holders count as administrators for the projects plugin (owner notices, member management). */
export const ADMINISTRATOR_SET_KEYS: readonly string[] = [
  ROOT_SET_KEY,
  ADMIN_SET_KEY,
];
