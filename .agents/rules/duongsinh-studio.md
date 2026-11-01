# Dương Sinh Studio: application-specific decisions

This application is Dương Sinh Studio, a self-built agent orchestration platform for Công ty CP Cờ vua Dương Sinh. The
development plan lives outside this repository (`D:\code\nocobase\docs\plans\2026-11-01-nocobase-studio-ke-hoach-phat-trien.md`);
Vietnamese operating notes live in `docs/`.

## Toolchain constraints

- `pnpm-workspace.yaml` overrides `rollup` with `@rollup/wasm-node`. The development CPU has no AVX/AVX2 and the native
  Rollup binary crashes there with `SIGILL`, which kills Vite. Keep the override until every machine that installs this
  application supports AVX2; see `docs/moi-truong-dev.md`.
- The development server listens on port 13100 (`APP_SERVER_PORT` in the untracked `.env`) to stay clear of the
  NocoBase 2 instances on 13000/13001.

## Plugin assembly

- `@nocobase/app-plugin-releases` ships no configuration factory; the application declares the `releases` section in
  `server/config/releases.ts`. Its App Hosts stay disabled until release environments are built.
- `@nocobase/app-plugin-projects` is installed but not registered until the application binds `projectsAccessToken`
  from its own provider. Never bind a placeholder that grants everyone every permission to make it boot.
- Record every mismatch between a published `@nocobase/*@beta` package and its README in `docs/chenh-lech-upstream.md`.

## Language

User-facing copy is Vietnamese first (`vi-VN`), with `en-US` kept complete.
