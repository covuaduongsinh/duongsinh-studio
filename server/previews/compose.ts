/**
 * The Docker Compose file of a NocoBase 2 preview or staging (S5.6), as Studio writes it into its Dokploy compose.
 *
 * - `ds-<slot>-db`: PostgreSQL 16, its own volume, 384 MiB;
 * - `ds-<slot>-app`: `nocobase/nocobase:<version>-full` (the image production runs), 1 GiB and one CPU, on Dokploy's
 *   Traefik network with routers of its own (Dokploy drops middlewares on the routers it generates, docs/trien-khai-vps.md);
 * - `ds-<slot>-setup`: a one-shot Node container that reads the pull request's commit and the plugins its workflow built
 *   with a repository-scoped installation token, waits for NocoBase, installs the `@duongsinh/*` plugins and runs
 *   `setup/run.mjs all` (sample data only), then reports to Studio.
 *
 * Production and the outside services the setup scripts know (Zalo, SePay, Lark, Dokploy) resolve to 0.0.0.0 in every
 * container, as in the CI of duongsinh-nocobase. Service names carry the slot so nothing collides with another stack's
 * `app` or `db` on the shared Traefik network. Every value comes from the compose's environment (`${NAME}`): the file
 * itself holds no secret.
 */

export type PreviewSlot = 'preview' | 'staging';

export const NOCOBASE_VERSION = '2.2.36';

/** Hostnames no preview may reach. */
export const BLOCKED_HOSTS = [
  'nocobase.dsc.edu.vn',
  'dokploy.dsc.edu.vn',
  'oauth.zaloapp.com',
  'business.openapi.zalo.me',
  'openapi.zalo.me',
  'my.sepay.vn',
  'userapi.sepay.vn',
  'open.larksuite.com',
  'open.feishu.cn',
] as const;

/** The names of the environment variables the compose reads; Studio sets each per deploy. */
export const COMPOSE_ENV = [
  'APP_KEY',
  'DB_PASSWORD',
  'NB_ACCOUNT',
  'NB_PASSWORD',
  'DSC_SEPAY_API_KEY',
  'GH_TOKEN',
  'REPO',
  'SHA',
  'ARTIFACT_URL',
  'CALLBACK_URL',
  'CALLBACK_TOKEN',
] as const;
export type ComposeEnv = Readonly<Record<(typeof COMPOSE_ENV)[number], string>>;

/**
 * The setup container's program (`node -e`). It has no `$` (Compose would read it as a variable) and no backtick: it is
 * written into YAML as a JSON string.
 */
export const SETUP_SCRIPT = [
  "const env = process.env; const fs = require('fs'); const cp = require('child_process');",
  'const report = async (status, reason) => { for (let i = 0; i < 5; i++) { try { const r = await fetch(env.CALLBACK_URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ status, reason, token: env.CALLBACK_TOKEN }) }); if (r.ok) return; } catch (e) { console.error("report", e.message); } await new Promise((ok) => setTimeout(ok, 5000)); } };',
  // Opening a stopped preview starts every container again, this one too: once set up, it only says so and exits.
  "if (fs.existsSync('/state/done')) { console.log('Already set up; nothing to do.'); process.exit(0); }",
  '(async () => { try {',
  "const h = { authorization: 'Bearer ' + env.GH_TOKEN, accept: 'application/vnd.github+json', 'user-agent': 'duongsinh-studio-preview' };",
  "fs.mkdirSync('/work', { recursive: true }); process.chdir('/work');",
  "let r = await fetch('https://api.github.com/repos/' + env.REPO + '/tarball/' + env.SHA, { headers: h }); if (!r.ok) throw new Error('repository tarball ' + r.status);",
  "fs.writeFileSync('src.tgz', Buffer.from(await r.arrayBuffer())); cp.execFileSync('tar', ['xzf', 'src.tgz', '--strip-components=1']);",
  "r = await fetch(env.ARTIFACT_URL, { headers: h }); if (!r.ok) throw new Error('plugin artifact ' + r.status);",
  "fs.writeFileSync('plugins.zip', Buffer.from(await r.arrayBuffer())); fs.mkdirSync('plugins/dist', { recursive: true }); cp.execFileSync('unzip', ['-o', '-q', 'plugins.zip', '-d', 'plugins/dist']);",
  "const run = (args) => cp.execFileSync('node', args, { stdio: 'inherit' });",
  "run(['ci/nocobase-ready.mjs', 'public-forms']);",
  "for (const file of fs.readdirSync('plugins/dist').filter((name) => name.endsWith('.tgz')).sort()) run(['plugins/install.mjs', 'plugins/dist/' + file]);",
  // On a busy VPS one blueprint can outlast Node's five-minute response timeout ("fetch failed"); run.mjs is safe to
  // run again and a second pass only finishes what the first left, so it is tried up to three times.
  "for (let attempt = 1; ; attempt++) { try { run(['setup/run.mjs', 'all']); break; } catch (error) { if (attempt >= 3) throw error; console.error('run.mjs all failed, attempt ' + attempt + ' of 3; running it again'); } }",
  "fs.writeFileSync('/state/done', env.SHA + '\\n');",
  "await report('ready', null);",
  "} catch (error) { console.error(error); await report('failed', String((error && error.message) || error).slice(0, 500)); process.exit(1); } })();",
].join(' ');

export interface ComposeInput {
  readonly slot: PreviewSlot;
  readonly host: string;
  /**
   * One htpasswd line (`user:<bcrypt hash>`) for Traefik's basic auth in front of the pages. `/api/` and `/ws` stay outside
   * it: NocoBase sends `Authorization: Bearer` on every API call, which would replace the browser's Basic credentials, so
   * those paths are guarded by NocoBase's own sign-in (a generated root account) instead.
   */
  readonly basicAuthUsers: string;
}

/** An htpasswd line as a Compose label value: every `$` doubled so Compose does not read it as a variable. */
export const composeEscape = (value: string): string => value.replaceAll('$', '$$$$');

const yamlString = (value: string): string => JSON.stringify(value);

/** The compose file for `slot`, served at `https://<host>`. */
export function composeFile(input: ComposeInput): string {
  const { slot, host } = input;
  if (!/^[a-z0-9.-]+$/u.test(host)) throw new Error(`Invalid preview host ${host}.`);
  if (!/^[a-z0-9_-]+:\$2[aby]\$\d\d\$[./A-Za-z0-9]{53}$/u.test(input.basicAuthUsers))
    throw new Error('basicAuthUsers must be one bcrypt htpasswd line.');
  const app = `ds-${slot}-app`;
  const db = `ds-${slot}-db`;
  const setup = `ds-${slot}-setup`;
  const router = `ds-nocobase-${slot}`;
  const extraHosts = BLOCKED_HOSTS.map((name) => `      - ${yamlString(`${name}:0.0.0.0`)}`).join('\n');
  const setupEnv = [
    `      NB_URL: http://${app}:80`,
    '      NB_ACCOUNT: ${NB_ACCOUNT}',
    '      NB_PASSWORD: ${NB_PASSWORD}',
    '      DSC_SEPAY_API_KEY: ${DSC_SEPAY_API_KEY}',
    '      GH_TOKEN: ${GH_TOKEN}',
    '      REPO: ${REPO}',
    '      SHA: ${SHA}',
    '      ARTIFACT_URL: ${ARTIFACT_URL}',
    '      CALLBACK_URL: ${CALLBACK_URL}',
    '      CALLBACK_TOKEN: ${CALLBACK_TOKEN}',
    '      TZ: Asia/Ho_Chi_Minh',
  ].join('\n');
  return `# Written by Dương Sinh Studio (S5.6, server/previews/compose.ts): a NocoBase 2 ${slot} with sample data only.
# Studio replaces this file on every deploy and removes the compose with its volumes; edit the code, not this.
services:
  ${db}:
    image: postgres:16-alpine
    command: ["postgres", "-c", "wal_level=logical", "-c", "shared_buffers=64MB", "-c", "max_connections=40"]
    environment:
      POSTGRES_USER: nocobase
      POSTGRES_DB: nocobase
      POSTGRES_PASSWORD: \${DB_PASSWORD}
      TZ: Asia/Ho_Chi_Minh
    volumes:
      - pgdata:/var/lib/postgresql/data
    mem_limit: 384m
    cpus: 0.5
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U nocobase -d nocobase"]
      interval: 5s
      timeout: 5s
      retries: 30

  ${app}:
    image: nocobase/nocobase:${NOCOBASE_VERSION}-full
    depends_on:
      ${db}:
        condition: service_healthy
    environment:
      APP_KEY: \${APP_KEY}
      DB_DIALECT: postgres
      DB_HOST: ${db}
      DB_PORT: 5432
      DB_DATABASE: nocobase
      DB_USER: nocobase
      DB_PASSWORD: \${DB_PASSWORD}
      TZ: Asia/Ho_Chi_Minh
      INIT_LANG: vi-VN
      INIT_ROOT_EMAIL: \${NB_ACCOUNT}
      INIT_ROOT_PASSWORD: \${NB_PASSWORD}
      INIT_ROOT_NICKNAME: Preview root
      DSC_SEPAY_API_KEY: \${DSC_SEPAY_API_KEY}
    extra_hosts:
${extraHosts}
    volumes:
      - storage:/app/nocobase/storage
    networks:
      - default
      - dokploy-network
    mem_limit: 1g
    cpus: 1.5
    restart: unless-stopped
    labels:
      - traefik.enable=true
      - traefik.docker.network=dokploy-network
      - ${yamlString(`traefik.http.routers.${router}-http.rule=Host(\`${host}\`)`)}
      - traefik.http.routers.${router}-http.entrypoints=web
      - traefik.http.routers.${router}-http.middlewares=redirect-to-https@file
      - traefik.http.routers.${router}-http.service=${router}
      - ${yamlString(`traefik.http.routers.${router}.rule=Host(\`${host}\`)`)}
      - traefik.http.routers.${router}.priority=100
      - traefik.http.routers.${router}.entrypoints=websecure
      - traefik.http.routers.${router}.tls.certresolver=letsencrypt
      - traefik.http.routers.${router}.middlewares=${router}-auth,${router}-headers
      - traefik.http.routers.${router}.service=${router}
      - ${yamlString(`traefik.http.middlewares.${router}-auth.basicauth.users=${composeEscape(input.basicAuthUsers)}`)}
      - traefik.http.middlewares.${router}-auth.basicauth.realm=Duong Sinh preview
      - ${yamlString(`traefik.http.routers.${router}-api.rule=Host(\`${host}\`) && (PathPrefix(\`/api/\`) || PathPrefix(\`/ws\`))`)}
      - traefik.http.routers.${router}-api.priority=200
      - traefik.http.routers.${router}-api.entrypoints=websecure
      - traefik.http.routers.${router}-api.tls.certresolver=letsencrypt
      - traefik.http.routers.${router}-api.middlewares=${router}-headers
      - traefik.http.routers.${router}-api.service=${router}
      - traefik.http.middlewares.${router}-headers.headers.customrequestheaders.X-Forwarded-Proto=https
      - traefik.http.middlewares.${router}-headers.headers.customresponseheaders.X-Robots-Tag=noindex, nofollow
      - traefik.http.services.${router}.loadbalancer.server.port=80

  ${setup}:
    image: node:22-alpine
    depends_on:
      - ${app}
    environment:
${setupEnv}
    extra_hosts:
${extraHosts}
    command: ["node", "-e", ${yamlString(SETUP_SCRIPT)}]
    volumes:
      - setupstate:/state
    mem_limit: 512m
    cpus: 0.5
    restart: "no"

networks:
  dokploy-network:
    external: true

volumes:
  pgdata:
  storage:
  setupstate:
`;
}

/** The compose's `.env` (Dokploy's `env` field): one `NAME=value` per line; values are generated, never typed. */
export function composeEnv(values: ComposeEnv): string {
  return COMPOSE_ENV.map((name) => {
    const value = values[name];
    if (/[\r\n]/u.test(value)) throw new Error(`${name} has a line break.`);
    return `${name}=${value}`;
  }).join('\n');
}
