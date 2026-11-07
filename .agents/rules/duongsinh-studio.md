# Dương Sinh Studio: application-specific decisions

This application is Dương Sinh Studio, a self-built agent orchestration platform for Công ty CP Cờ vua Dương Sinh. Plans from
2026-11-06 onward live in `docs/plans/`; earlier ones stay in `D:\code\nocobase\docs\plans\` (read-only reference). Vietnamese
operating notes live in `docs/`; moving to a newer NocoBase follows `docs/nang-cap.md`.

## Toolchain constraints

- `pnpm-workspace.yaml` overrides `rollup` with `@rollup/wasm-node`. The development CPU has no AVX/AVX2 and the native
  Rollup binary crashes there with `SIGILL`, which kills Vite. Keep the override until every machine that installs this
  application supports AVX2; see `docs/moi-truong-dev.md`.
- The development server listens on port 13100 (`APP_SERVER_PORT` in the untracked `.env`) to stay clear of the
  NocoBase 2 instances on 13000/13001.

- After every `pnpm exec shadcn add @nocobase/<item>`, run `git diff package.json`: registry items have downgraded
  `@nocobase/app-client` and `@nocobase/i18n` (breaking the authorization client with `watchReadiness is not a
function`) and put client-only libraries in `dependencies`. Restore the core ranges and move client libraries to
  `devDependencies` before continuing.

## Plugin assembly

- `@nocobase/app-plugin-releases` ships no configuration factory; the application declares the `releases` section in
  `server/config/releases.ts`. Its App Hosts stay disabled until release environments are built.
- `@nocobase/app-plugin-projects` gets its roles from `server/providers/projects-access.ts`, which reads the
  authorization plugin's permission sets: `owner` is the protected `root` set, `ds-admin` and `ds-contributor` are
  editable sets seeded by `database/main/seeds/202611010001_ds_roles.ts` (keys in `server/access/roles.ts`). Roles
  are managed through the Studio access API (`server/routes/access.ts`, `/api/access/*`, the Studio demo's
  contract) over those same permission sets: a role `<key>` is the set `ds-<key>`, `owner` is `root`. New members
  get no role unless an administrator sets `defaultRole` (`PUT /api/access/settings`, null by default); `admit` then
  gives it once, and `/api/access/members` shows every holder. Never bind a placeholder that grants everyone every
  permission. `tests/server/projects-access.test.ts` and `tests/server/access-routes.test.ts` guard the boundaries.
- Seeds cannot import the application's own relative modules (the seed loader resolves only packages), so a seed
  spells out its data the way a migration does.
- For a contributor, "related" issues include every issue without a project. Private work belongs in a project with
  `visibility: 'members'`.
- Record every mismatch between a published `@nocobase/*@beta` package and its README in `docs/chenh-lech-upstream.md`.

## Tests

- `tests/setup/skip-foundation-source-scan.ts` stubs Foundation's source scan in tests only, because every test starts on a fresh database and the
  scan takes about 45 s on this application's source; see `docs/chenh-lech-upstream.md` section 23. Do not assert module associations in tests here.
- A router mounted at the API root must scope its middleware to the paths it owns; `use('*')` there takes every later route with it, public webhooks
  included. `tests/server/app-server.test.ts` and `tests/server/git-app.test.ts` catch this.

## Language

User-facing copy is Vietnamese first (`vi-VN`), with `en-US` kept complete.

## Project setup

- A project initialized from the NocoBase template follows approach (a): the agent scaffolds with `create-app` in a temporary
  directory outside the repository (it refuses a non-empty one), moves the files in keeping `.git`, and commits the
  baseline to the default branch. The template and version come from this application's own `package.json`
  (`server/setups/template-version.ts`); never hard-code a version or fall back to `latest`.
- Repositories Studio creates always get a first commit, and `existingRepo` without one is refused (`GIT_REPOSITORY_EMPTY`),
  because a run cannot check out an empty repository. See `docs/chenh-lech-upstream.md` section 30.
