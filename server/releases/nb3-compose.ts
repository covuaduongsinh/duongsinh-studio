/**
 * The Docker Compose file of one NocoBase 3 App as the Dokploy driver writes it (M4.2).
 *
 * - `app`: the official Node image running the release's `dist/server/standalone.js` (the same way Studio runs), with
 *   `dist` and `config.yml` mounted read-only from the host directory the driver extracted the archive into, 1 GiB and
 *   one CPU, on Dokploy's Traefik network with one router for the App's fixed host;
 * - `db` (only for `postgres`): PostgreSQL 16, 384 MiB. `sqlite` keeps its file in the App's `storage` volume.
 *
 * Every value that is a secret or changes per deploy comes from the compose's environment (`${NAME}`), so the file holds
 * none. The App's own variables (the release environment's and the App's) are written to the compose's `.env` and reach
 * the App through `env_file`; `environment:` wins over `env_file`, and `nb3ComposeEnv` refuses a name the driver sets.
 */

export type Nb3Database = 'sqlite' | 'postgres';

/** Hostnames an App may never take: production NocoBase 2, Studio, Dokploy. */
export const NB3_BLOCKED_HOSTS = [
  'nocobase.dsc.edu.vn',
  'studio.dsc.edu.vn',
  'dokploy.dsc.edu.vn',
] as const;

export const NODE_IMAGE = 'node:24.15.0-bookworm-slim';
export const APP_PORT = 3000;

/** A hostname the driver may route: lower-case labels, at least one dot, not a blocked one. */
export function assertAppHost(host: string): void {
  if (
    !/^(?=.{4,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/u.test(
      host,
    )
  )
    throw new Error(`Invalid App host ${host}.`);
  if ((NB3_BLOCKED_HOSTS as readonly string[]).includes(host))
    throw new Error(`The host ${host} is reserved.`);
}

/** The compose name for an App: `nb3-` and a slug of its id (lower-case letters, digits and single dashes). */
export function composeNameOf(appId: string): string {
  const slug = appId
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, '-')
    .replaceAll(/^-+|-+$/gu, '')
    .slice(0, 34);
  if (!slug) throw new Error(`The App id ${appId} has no usable name.`);
  return `nb3-${slug}`;
}

export interface Nb3ComposeInput {
  /** `composeNameOf(appId)`: names the service and its Traefik router. */
  readonly name: string;
  readonly host: string;
  /** Host path of the release directory: holds `dist/` and `config.yml`. */
  readonly hostDir: string;
  readonly database: Nb3Database;
  /** `/main`-style base path the App is served under; `/` for the root. */
  readonly basePath: string;
  readonly hasConfig: boolean;
}

const yamlString = (value: string): string => JSON.stringify(value);

/** Names of variables the driver itself sets; an App's variable with one of these names is refused. */
export const RESERVED_ENV = [
  'NODE_ENV',
  'TZ',
  'APP_BASE_PATH',
  'APP_SERVER_HOST',
  'APP_SERVER_PORT',
  'APP_CONFIG_FILE',
  'APP_PUBLIC_ORIGIN',
  'DB_DIALECT',
  'DB_HOST',
  'DB_PORT',
  'DB_DATABASE',
  'DB_USERNAME',
  'DB_PASSWORD',
] as const;

/** The compose file for one App, served at `https://<host>`. */
export function nb3ComposeFile(input: Nb3ComposeInput): string {
  assertAppHost(input.host);
  if (!/^nb3-[a-z0-9-]+$/u.test(input.name))
    throw new Error(`Invalid compose name ${input.name}.`);
  if (
    !/^\/[A-Za-z0-9._\-/]*$/u.test(input.hostDir) ||
    input.hostDir.includes('..')
  )
    throw new Error(`Invalid release directory ${input.hostDir}.`);
  if (!/^\/(?:[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*)?$/u.test(input.basePath))
    throw new Error(`Invalid base path ${input.basePath}.`);
  const { name, host } = input;
  const postgres = input.database === 'postgres';
  const dbHost = `${name}-db`;
  const appService = `${name}-app`;
  const router = `ds-${name}`;
  const dbEnv = postgres
    ? [
        '      DB_DIALECT: postgres',
        `      DB_HOST: ${dbHost}`,
        '      DB_PORT: 5432',
        '      DB_DATABASE: app',
        '      DB_USERNAME: app',
        '      DB_PASSWORD: ${DB_PASSWORD}',
      ].join('\n')
    : '      DB_DIALECT: sqlite';
  const mounts = [
    `      - ${yamlString(`${input.hostDir}/dist:/app/dist:ro`)}`,
    ...(input.hasConfig
      ? [
          `      - ${yamlString(`${input.hostDir}/config.yml:/app/config.yml:ro`)}`,
        ]
      : []),
    '      - storage:/app/storage',
  ].join('\n');
  return `# Written by Dương Sinh Studio (M4.2, server/releases/nb3-compose.ts): one NocoBase 3 App.
# Studio replaces this file on every deploy and removes the compose with its volumes; edit the release, not this.
services:
${
  postgres
    ? `  ${dbHost}:
    image: postgres:16-alpine
    restart: unless-stopped
    command: ["postgres", "-c", "shared_buffers=64MB", "-c", "max_connections=30"]
    environment:
      TZ: Asia/Ho_Chi_Minh
      POSTGRES_DB: app
      POSTGRES_USER: app
      POSTGRES_PASSWORD: \${DB_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data
    mem_limit: 384m
    cpus: 0.5
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app -d app"]
      interval: 5s
      timeout: 5s
      retries: 30

`
    : ''
}  ${appService}:
    image: ${NODE_IMAGE}
    restart: unless-stopped
    init: true
    user: "1000:1000"
    working_dir: /app
    command: ["node", "dist/server/standalone.js"]
${
  postgres
    ? `    depends_on:
      ${dbHost}:
        condition: service_healthy
`
    : ''
}    env_file:
      - .env
    environment:
      NODE_ENV: production
      TZ: Asia/Ho_Chi_Minh
      APP_BASE_PATH: ${yamlString(input.basePath)}
      APP_SERVER_HOST: 0.0.0.0
      APP_SERVER_PORT: ${APP_PORT}
${input.hasConfig ? '      APP_CONFIG_FILE: /app/config.yml\n' : ''}      APP_PUBLIC_ORIGIN: ${yamlString(`https://${host}`)}
${dbEnv}
    volumes:
${mounts}
    networks:
      - default
      - dokploy-network
    mem_limit: 1g
    cpus: 1
    labels:
      - traefik.enable=true
      - traefik.docker.network=dokploy-network
      - ${yamlString(`traefik.http.routers.${router}-http.rule=Host(\`${host}\`)`)}
      - traefik.http.routers.${router}-http.entrypoints=web
      - traefik.http.routers.${router}-http.middlewares=redirect-to-https@file
      - traefik.http.routers.${router}-http.service=${router}
      - ${yamlString(`traefik.http.routers.${router}.rule=Host(\`${host}\`)`)}
      - traefik.http.routers.${router}.entrypoints=websecure
      - traefik.http.routers.${router}.tls.certresolver=letsencrypt
      - traefik.http.routers.${router}.service=${router}
      - traefik.http.services.${router}.loadbalancer.server.port=${APP_PORT}

networks:
  dokploy-network:
    external: true

volumes:
  storage:
${postgres ? '  pgdata:\n' : ''}`;
}

/**
 * The compose's `.env`: the App's variables as they are (Compose passes them through `env_file`; the fixed ones in the
 * file win), `DB_PASSWORD` for a PostgreSQL App. Values must be one line. A name outside `[A-Z][A-Z0-9_]*` or one the
 * driver sets itself is refused rather than silently dropped.
 */
export function nb3ComposeEnv(
  variables: Readonly<Record<string, string>>,
  dbPassword: string | null,
  /**
   * What the driver itself sets for this App. The releases plugin hands the driver an App's generated variables, among
   * them `APP_PUBLIC_ORIGIN` (the App's url), so a reserved name carrying exactly the value the driver sets is left out
   * of the `.env` rather than refused; any other value for a reserved name is still refused.
   */
  driverSet: Readonly<Record<string, string>> = {},
): string {
  const lines: string[] = [];
  for (const [name, value] of Object.entries(variables)) {
    if (!/^[A-Z][A-Z0-9_]*$/u.test(name))
      throw new Error(`The variable name ${name} is not allowed.`);
    if ((RESERVED_ENV as readonly string[]).includes(name)) {
      if (driverSet[name] === value) continue;
      throw new Error(
        `The variable ${name} is set by Studio and cannot be replaced.`,
      );
    }
    if (/[\r\n]/u.test(value))
      throw new Error(`The variable ${name} has a line break.`);
    lines.push(`${name}=${value}`);
  }
  if (dbPassword !== null) {
    if (!/^[A-Za-z0-9]{16,}$/u.test(dbPassword))
      throw new Error('The database password must be 16+ letters and digits.');
    lines.push(`DB_PASSWORD=${dbPassword}`);
  }
  return lines.join('\n');
}
