# Dương Sinh Studio: application-specific decisions

This application is Dương Sinh Studio, a self-built agent orchestration platform for Công ty CP Cờ vua Dương Sinh. Plans from
2026-11-06 onward live in `docs/plans/`; the earlier ones the plans still cite are copied verbatim to `docs/plans/archive/`
(history, not edited). Vietnamese
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

## Projects created from Studio

- Plan: `docs/plans/2026-11-07-studio-khac-phuc-ton-dong.md`. A new project's repository is built from `create-app`'s template
  scaffolded in a temporary directory and moved into the repository root (approach (a)): `create-app` refuses a non-empty
  directory, and an empty repository has no branch, which fails the run with `checkoutFailed`. Only the `default` template exists.
- The shared runner is limited (`user-1002.slice`: 2.5 GiB RAM, 3 CPUs). Runs there must not execute `pnpm check`, `pnpm lint`,
  `pnpm test`, `pnpm build` or a repository-wide `tsc`: `pnpm check` overloaded the VPS and lost a run to `leaseExpired`. One command
  at a time, scoped to the changed files.
- Rules every NocoBase 3 project follows (licenses, data, permissions) belong in the built-in `ds-app-rules` skill, not in each issue
  description. Built-in skills are created once: `ensureBuiltinSkills` does not update an existing one.
- Do not create issues from a long prompt through intake: each bullet line becomes its own issue (DS-25…DS-56 were made this way and cancelled).

## Language

User-facing copy is Vietnamese first (`vi-VN`), with `en-US` kept complete.
