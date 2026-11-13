// @vitest-environment node
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppDeploymentSpec } from '@nocobase/app-plugin-releases/server';
import {
  DokployRefused,
  createDokployClient,
  isNb3ComposeName,
  type DokployClient,
  type DokployCompose,
} from '../../server/previews/dokploy.js';
import {
  createDokployDriver,
  settingsOf,
  sweepIdle,
  type Nb3Row,
  type Nb3Store,
} from '../../server/releases/dokploy-driver.js';
import {
  composeNameOf,
  nb3ComposeEnv,
  nb3ComposeFile,
} from '../../server/releases/nb3-compose.js';

describe('NocoBase 3 compose', () => {
  const base = {
    name: 'nb3-nocolms',
    host: 'nocolms.dsc.edu.vn',
    hostDir: '/srv/duongsinh-studio/storage/nb3-apps/nb3-nocolms/abc123',
    basePath: '/',
    hasConfig: true,
  } as const;

  it('routes only the App host and holds no secret value', () => {
    const file = nb3ComposeFile({ ...base, database: 'sqlite' });
    expect(file).toContain('Host(`nocolms.dsc.edu.vn`)');
    expect(file).toContain(`${base.hostDir}/dist:/app/dist:ro`);
    expect(file).toContain('DB_DIALECT: sqlite');
    expect(file).not.toContain('postgres:16');
    expect(file).toContain('mem_limit: 1g');
    // The named volume is created by root; a one-shot service gives it to uid 1000 before the App starts.
    expect(file).toContain('nb3-nocolms-init:');
    expect(file).toContain('"chown", "-R", "1000:1000", "/app/storage"');
    expect(file).toContain('condition: service_completed_successfully');
  });

  it('routes the WebSocket path with X-Forwarded-Proto forced to https', () => {
    const root = nb3ComposeFile({ ...base, database: 'sqlite' });
    expect(root).toContain('Path(`/ws`)');
    expect(root).toContain(
      'ds-nb3-nocolms-https.headers.customrequestheaders.X-Forwarded-Proto=https',
    );
    expect(root).toContain('ds-nb3-nocolms-ws.priority=1000');
    const mounted = nb3ComposeFile({
      ...base,
      basePath: '/main',
      database: 'sqlite',
    });
    expect(mounted).toContain('Path(`/main/ws`)');
  });

  it('adds PostgreSQL with its password taken from the environment', () => {
    const file = nb3ComposeFile({ ...base, database: 'postgres' });
    expect(file).toContain('postgres:16-alpine');
    expect(file).toContain('DB_PASSWORD: ${DB_PASSWORD}');
    expect(file).toContain('depends_on:');
  });

  it('refuses reserved hosts, bad paths and bad names', () => {
    for (const host of [
      'nocobase.dsc.edu.vn',
      'studio.dsc.edu.vn',
      'dokploy.dsc.edu.vn',
      'Bad Host',
      'nohost',
    ])
      expect(() =>
        nb3ComposeFile({ ...base, host, database: 'sqlite' }),
      ).toThrow();
    expect(() =>
      nb3ComposeFile({ ...base, hostDir: '/srv/../etc', database: 'sqlite' }),
    ).toThrow();
    expect(() =>
      nb3ComposeFile({ ...base, name: 'nb3-x; rm', database: 'sqlite' }),
    ).toThrow();
    expect(() => composeNameOf('!!!')).toThrow();
    expect(composeNameOf('NocoLMS_App 1')).toBe('nb3-nocolms-app-1');
  });

  it('adds a job service that is not started with the App and reads its own secrets file', () => {
    const file = nb3ComposeFile({ ...base, database: 'postgres' });
    const web = file.slice(
      file.indexOf('  nb3-nocolms-app:'),
      file.indexOf('  nb3-nocolms-job:'),
    );
    const job = file.slice(file.indexOf('  nb3-nocolms-job:'));
    expect(job).toContain('profiles: ["job"]');
    expect(job).toContain('restart: "no"');
    expect(job).toContain('path: "/srv/duongsinh-studio/jobs/nb3-nocolms.env"');
    expect(job).toContain('required: false');
    // The job has no router and is not exposed; the web service never lists the job file.
    expect(job).not.toContain('traefik.enable');
    expect(web).not.toContain('jobs/nb3-nocolms.env');
    expect(file).toContain('DB_DIALECT: postgres');
  });

  it('refuses job secrets among the App variables, without printing their value', () => {
    for (const name of ['LARK_APP_SECRET', 'LARK_APP_ID', 'JOB_ONLY_X'])
      expect(() => nb3ComposeEnv({ [name]: 'topsecret' }, null)).toThrow(
        /job secret/u,
      );
    try {
      nb3ComposeEnv({ LARK_APP_SECRET: 'topsecret' }, null);
    } catch (error) {
      expect(String(error)).not.toContain('topsecret');
    }
  });

  it('refuses variables the driver sets, bad names and line breaks', () => {
    expect(nb3ComposeEnv({ APP_KEY: 'k' }, 'abcdefabcdefabcdef12')).toBe(
      'APP_KEY=k\nDB_PASSWORD=abcdefabcdefabcdef12',
    );
    expect(() => nb3ComposeEnv({ DB_HOST: 'x' }, null)).toThrow(
      /set by Studio/u,
    );
    // The releases plugin passes the App's generated APP_PUBLIC_ORIGIN: the value the driver sets is left out, another is refused.
    const origin = { APP_PUBLIC_ORIGIN: 'https://a.dsc.edu.vn' };
    expect(nb3ComposeEnv({ ...origin, APP_KEY: 'k' }, null, origin)).toBe(
      'APP_KEY=k',
    );
    expect(() =>
      nb3ComposeEnv({ APP_PUBLIC_ORIGIN: 'https://evil.test' }, null, origin),
    ).toThrow(/cannot be replaced/u);
    expect(() => nb3ComposeEnv({ 'a-b': 'x' }, null)).toThrow(/not allowed/u);
    expect(() => nb3ComposeEnv({ A: 'x\ny' }, null)).toThrow(/line break/u);
    expect(() => nb3ComposeEnv({}, 'short')).toThrow();
  });
});

describe('Dokploy allowlist for NocoBase 3', () => {
  const calls: { path: string; body: unknown }[] = [];
  beforeEach(() => {
    calls.length = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: { body?: string }) => {
        const path = url.split('/api/')[1] ?? '';
        calls.push({ path, body: init?.body ? JSON.parse(init.body) : null });
        const body = path.startsWith('project.one')
          ? { environments: [{ name: 'production', environmentId: 'env1' }] }
          : path.startsWith('compose.one')
            ? {
                composeId: 'c1',
                name: 'nb3-x',
                environmentId: 'env1',
                composeStatus: 'done',
              }
            : { composeId: 'c1', name: 'nb3-x', environmentId: 'env1' };
        return Promise.resolve(new Response(JSON.stringify(body)));
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  const make = (ids: string[], allow = isNb3ComposeName) =>
    createDokployClient(
      { url: 'https://d.test', apiKey: 'k', projectId: 'p' },
      () => Promise.resolve(new Set(ids)),
      allow,
    );

  it('creates only nb3-* composes, and a preview client never does', async () => {
    await expect(make([]).create('nocobase-preview')).rejects.toBeInstanceOf(
      DokployRefused,
    );
    await expect(make([]).create('nb3-../x')).rejects.toBeInstanceOf(
      DokployRefused,
    );
    expect(isNb3ComposeName('nb3-nocolms')).toBe(true);
    expect(isNb3ComposeName('nb3-' + 'a'.repeat(40))).toBe(false);
    expect(isNb3ComposeName('production')).toBe(false);
    const created = await make([]).create('nb3-x');
    expect(created.composeId).toBe('c1');
    const preview = createDokployClient(
      { url: 'https://d.test', apiKey: 'k', projectId: 'p' },
      () => Promise.resolve(new Set(['c1'])),
    );
    await expect(preview.create('nb3-x')).rejects.toBeInstanceOf(
      DokployRefused,
    );
    await expect(preview.stop('c1')).rejects.toBeInstanceOf(DokployRefused);
  });

  it('refuses a compose id Studio did not record, before any call', async () => {
    await expect(make(['other']).stop('c1')).rejects.toBeInstanceOf(
      DokployRefused,
    );
    expect(calls.some((call) => call.path.startsWith('compose.stop'))).toBe(
      false,
    );
  });
});

describe('dokploy driver', () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'nb3-'));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const memoryStore = (): Nb3Store & { rows: Map<string, Nb3Row> } => {
    const rows = new Map<string, Nb3Row>();
    return {
      rows,
      get: (id) => Promise.resolve(rows.get(id) ?? null),
      list: () => Promise.resolve([...rows.values()]),
      save: (row) => {
        rows.set(row.appId, row);
        return Promise.resolve();
      },
      remove: (id) => {
        rows.delete(id);
        return Promise.resolve();
      },
    };
  };

  function fakeDokploy(statusAfterDeploy = 'done') {
    const log: string[] = [];
    let status = 'idle';
    const client: DokployClient = {
      environmentId: () => Promise.resolve('env1'),
      create: (name) => {
        log.push(`create ${name}`);
        return Promise.resolve({
          composeId: `id-${name}`,
          name,
          appName: name,
          environmentId: 'env1',
          status: 'idle',
        } satisfies DokployCompose);
      },
      get: (composeId) =>
        Promise.resolve({
          composeId,
          name: 'nb3-x',
          appName: 'x',
          environmentId: 'env1',
          status,
        }),
      update: (id, input) => {
        log.push(`update ${id} ${input.composeFile.length > 0} ${input.env}`);
        return Promise.resolve();
      },
      deploy: (id) => {
        log.push(`deploy ${id}`);
        status = statusAfterDeploy;
        return Promise.resolve();
      },
      stop: (id) => {
        log.push(`stop ${id}`);
        return Promise.resolve();
      },
      start: (id) => {
        log.push(`start ${id}`);
        return Promise.resolve();
      },
      remove: (id) => {
        log.push(`remove ${id}`);
        return Promise.resolve();
      },
    };
    return { client, log };
  }

  const config = () => ({
    dataDir: join(root, 'data'),
    hostDir: '/srv/duongsinh-studio/storage/nb3-apps',
    hosts: { nocolms: 'nocolms.dsc.edu.vn', other: 'other.dsc.edu.vn' },
    database: 'sqlite',
  });

  const specOf = (
    appId: string,
    over: Partial<AppDeploymentSpec> = {},
  ): AppDeploymentSpec => ({
    deploymentId: `dep-${appId}`,
    appId,
    kind: 'deploy',
    release: { id: 'r1', version: 'abc123', checksum: 'x' },
    artifact: {
      key: 'k',
      checksum: 'x',
      version: 'abc123',
      size: 1,
      open: () => Promise.resolve(Readable.from([])),
    },
    config: { mode: 'file', content: 'app: {}\n', revision: '1' },
    env: { APP_KEY: 'secret-value' },
    desiredState: 'running',
    activation: 'eager',
    idleStopMinutes: 30,
    dormantAfterHours: null,
    ...over,
  });

  async function session(
    client: DokployClient | null,
    store = memoryStore(),
    extra = {},
  ) {
    const extract = vi.fn(async (_: NodeJS.ReadableStream, dir: string) => {
      const { mkdir } = await import('node:fs/promises');
      await mkdir(join(dir, 'dist'), { recursive: true });
    });
    const driver = createDokployDriver({
      dokploy: () => client,
      store,
      seal: (plain) => `sealed:${plain}`,
      open: (sealed) => sealed.replace('sealed:', ''),
      extract,
      sleep: () => Promise.resolve(),
      probe: () => Promise.resolve(true),
      ...extra,
    });
    const openIn = (id: string, over: Record<string, unknown> = {}) =>
      driver.open(
        {
          id,
          name: id,
          config: { ...config(), ...over },
          secret: null,
          publicUrl: null,
        },
        { desired: () => Promise.resolve([]) },
      );
    const opened = await openIn('e');
    return { opened, store, extract, openIn };
  }

  it('validates the environment settings', () => {
    expect(() => settingsOf(config())).not.toThrow();
    expect(() => settingsOf({ ...config(), hostDir: '/srv/../x' })).toThrow();
    expect(() =>
      settingsOf({ ...config(), hosts: { a: 'studio.dsc.edu.vn' } }),
    ).toThrow(/reserved/u);
    expect(() =>
      settingsOf({
        ...config(),
        hosts: { a: 'x.dsc.edu.vn', b: 'x.dsc.edu.vn' },
      }),
    ).toThrow(/two Apps/u);
    expect(() => settingsOf({ ...config(), maxApps: 11 })).toThrow();
  });

  it('deploys: extracts, writes config, creates the compose and records it', async () => {
    const { client, log } = fakeDokploy();
    const { opened, store, extract } = await session(client);
    const events: string[] = [];
    const result = await opened.apply(specOf('nocolms'), (event) =>
      events.push(String(event.phase)),
    );
    expect(result.state).toBe('running');
    expect(extract).toHaveBeenCalledTimes(1);
    expect(
      await readFile(
        join(root, 'data', 'nb3-nocolms', 'abc123', 'config.yml'),
        'utf8',
      ),
    ).toBe('app: {}\n');
    expect(log[0]).toBe('create nb3-nocolms');
    expect(
      log.some((line) =>
        line.startsWith('update id-nb3-nocolms true APP_KEY=secret-value'),
      ),
    ).toBe(true);
    expect(log).toContain('deploy id-nb3-nocolms');
    expect(events).toEqual([
      'extracting',
      'preparing',
      'starting',
      'health_check',
      'completed',
    ]);
    expect(store.rows.get('nocolms')).toMatchObject({
      desiredState: 'running',
      version: 'abc123',
      idleStopMinutes: 30,
    });
    expect(opened.url('nocolms')).toBe('https://nocolms.dsc.edu.vn');
    expect(opened.url('unknown')).toBeNull();
    // The same release again reuses the extracted files and the compose.
    await opened.apply(specOf('nocolms'));
    expect(extract).toHaveBeenCalledTimes(1);
    // A directory without the "extracted" mark (an interrupted or older extraction) is extracted again.
    await rm(join(root, 'data', 'nb3-nocolms', 'abc123', '.extracted'));
    await opened.apply(specOf('nocolms'));
    expect(extract).toHaveBeenCalledTimes(2);
    expect(log.filter((line) => line.startsWith('create')).length).toBe(1);
  });

  it('reports failure without throwing: no Dokploy, no host, bad version, error status', async () => {
    const none = await session(null);
    expect((await none.opened.apply(specOf('nocolms'))).error).toMatch(
      /no Dokploy access/u,
    );
    const { client } = fakeDokploy();
    const { opened } = await session(client);
    expect((await opened.apply(specOf('nohost'))).error).toMatch(
      /No host name/u,
    );
    expect(
      (
        await opened.apply(
          specOf('nocolms', {
            release: { id: 'r', version: '../x', checksum: 'x' },
          }),
        )
      ).state,
    ).toBe('failed');
    const failing = await session(fakeDokploy('error').client);
    const result = await failing.opened.apply(specOf('nocolms'));
    expect(result).toMatchObject({ state: 'failed' });
    expect(failing.store.rows.get('nocolms')?.lastError).toMatch(/failed/u);
  });

  it('fails the deployment when the App never answers, even though Dokploy says done', async () => {
    const { client } = fakeDokploy();
    const probed: string[] = [];
    const { opened, store } = await session(client, undefined, {
      probe: (url: string) => {
        probed.push(url);
        return Promise.resolve(false);
      },
      probeTimeoutMs: 0,
    });
    const result = await opened.apply(specOf('nocolms'));
    expect(result.state).toBe('failed');
    expect(result.error).toMatch(
      /did not answer https:\/\/nocolms\.dsc\.edu\.vn\/api\/healthz/u,
    );
    expect(probed[0]).toBe('https://nocolms.dsc.edu.vn/api/healthz');
    expect(store.rows.get('nocolms')?.lastError).toMatch(/did not answer/u);
  });

  it('keeps maxApps: a second App is refused while the first runs, then allowed after it stops', async () => {
    const { client } = fakeDokploy();
    const { opened } = await session(client);
    expect((await opened.apply(specOf('nocolms'))).state).toBe('running');
    const refused = await opened.apply(specOf('other'));
    expect(refused.state).toBe('failed');
    expect(refused.error).toMatch(/Only 1 App/u);
    expect((await opened.stop('nocolms')).state).toBe('stopped');
    expect((await opened.apply(specOf('other'))).state).toBe('running');
  });

  it('counts the places per environment, so a production App does not take a preview place', async () => {
    const { client } = fakeDokploy();
    const { opened, openIn } = await session(client, undefined, {
      availableMb: () => Promise.resolve(4000),
    });
    expect((await opened.apply(specOf('nocolms'))).state).toBe('running');
    // Same environment, one place: refused. Another environment has its own.
    expect((await opened.apply(specOf('other'))).state).toBe('failed');
    const production = await openIn('f');
    expect((await production.apply(specOf('other'))).state).toBe('running');
  });

  it('refuses to start while the server has too little memory, and says how much', async () => {
    const { client } = fakeDokploy();
    let free = 500;
    const { opened } = await session(client, undefined, {
      availableMb: () => Promise.resolve(free),
      minAvailableMb: 1200,
    });
    const refused = await opened.apply(specOf('nocolms'));
    expect(refused.state).toBe('failed');
    expect(refused.error).toMatch(/500 MiB.*1200 MiB/u);
    free = 3000;
    expect((await opened.apply(specOf('nocolms'))).state).toBe('running');
  });

  it('allows more than two Apps only while the memory gauge can be read', async () => {
    const { client } = fakeDokploy();
    const more = { maxApps: 5 };
    const blind = await session(client, undefined, {
      availableMb: () => Promise.resolve(null),
    });
    const o1 = await blind.openIn('e', more);
    await blind.store.save({
      appId: 'a1',
      composeId: 'c1',
      composeName: 'nb3-a1',
      desiredState: 'running',
      version: null,
      deploymentId: null,
      dbPasswordSealed: null,
      idleStopMinutes: null,
      lastError: null,
      startedAt: null,
      environmentId: 'e',
    });
    await blind.store.save({
      appId: 'a2',
      composeId: 'c2',
      composeName: 'nb3-a2',
      desiredState: 'running',
      version: null,
      deploymentId: null,
      dbPasswordSealed: null,
      idleStopMinutes: null,
      lastError: null,
      startedAt: null,
      environmentId: 'e',
    });
    const third = await o1.apply(specOf('nocolms'));
    expect(third.state).toBe('failed');
    expect(third.error).toMatch(/cannot be read/u);
  });

  it('checks that the data directory is writable and reports where each host points', async () => {
    const { client } = fakeDokploy();
    const { opened } = await session(client, undefined, {
      resolve: (host: string) =>
        host === 'nocolms.dsc.edu.vn'
          ? Promise.resolve(['217.15.160.118'])
          : Promise.reject(new Error('ENOTFOUND')),
    });
    const ok = await opened.check();
    expect(ok.ok).toBe(true);
    expect(ok.details).toMatchObject({
      dataDir: 'writable',
      dns: {
        'nocolms.dsc.edu.vn': '217.15.160.118',
        'other.dsc.edu.vn': 'unresolved',
      },
    });
    // A file where the directory should be: Studio cannot write there.
    const { writeFile, rm: remove } = await import('node:fs/promises');
    await remove(join(root, 'data'), { recursive: true });
    await writeFile(join(root, 'data'), 'not a directory');
    const bad = await opened.check();
    expect(bad.ok).toBe(false);
    expect(bad.message).toMatch(/cannot write/u);
  });

  it('a stopped deployment prepares the compose without deploying', async () => {
    const { client, log } = fakeDokploy();
    const { opened } = await session(client);
    const result = await opened.apply(
      specOf('nocolms', { desiredState: 'stopped' }),
    );
    expect(result.state).toBe('stopped');
    expect(log.some((line) => line.startsWith('deploy'))).toBe(false);
  });

  it('reports what the containers do through the daemon, and says unknown when nobody could look', async () => {
    const { client } = fakeDokploy();
    const answers: Record<string, unknown>[] = [];
    const asked: string[] = [];
    const channel = {
      reachable: () => Promise.resolve(true),
      call: (request: { op: string; app: string }) => {
        asked.push(`${request.op} ${request.app}`);
        return Promise.resolve(
          (answers.shift() ?? { ok: false, error: 'UNREACHABLE' }) as never,
        );
      },
    };
    const { opened, store } = await session(client, undefined, {
      channel: () => channel,
    });
    await opened.apply(specOf('nocolms'));
    // Running as the table says.
    answers.push({ ok: true, state: 'running' });
    expect((await opened.status(['nocolms'])).get('nocolms')?.state).toBe(
      'running',
    );
    // Nobody could look: not claimed as running.
    expect((await opened.status(['nocolms'])).get('nocolms')?.state).toBe(
      'unknown',
    );
    // The container died of memory: failed, and the place is free for another App.
    answers.push({ ok: true, state: 'exited', exitCode: 137, oomKilled: true });
    const dead = (await opened.status(['nocolms'])).get('nocolms');
    expect(dead).toMatchObject({ state: 'failed' });
    expect(dead?.error).toMatch(/memory/u);
    expect(store.rows.get('nocolms')?.desiredState).toBe('stopped');
    expect((await opened.apply(specOf('other'))).state).toBe('running');
    expect(asked[0]).toBe('inspect nb3-nocolms');
  });

  it('reads the runtime log through the daemon and filters it', async () => {
    const { client } = fakeDokploy();
    let sent: Record<string, unknown> = {};
    const { opened } = await session(client, undefined, {
      channel: () => ({
        reachable: () => Promise.resolve(true),
        call: (request: Record<string, unknown>) => {
          sent = request;
          return Promise.resolve({
            ok: true,
            log: 'one\nERROR two\n\nthree\n',
          });
        },
      }),
    });
    await opened.apply(specOf('nocolms'));
    const page = await opened.logs('nocolms', { search: 'error' });
    expect(page.available).toBe(true);
    expect(page.entries.map((entry) => entry.msg)).toEqual(['ERROR two']);
    expect(sent).toMatchObject({
      op: 'logs',
      app: 'nb3-nocolms',
      since: '60m',
    });
    // Without the channel there is nothing to read.
    const off = await session(client);
    expect((await off.opened.logs('nocolms', {})).available).toBe(false);
  });

  it('removes the compose only when asked to purge data, and only after the database was dumped', async () => {
    const { client, log } = fakeDokploy();
    let answer: Record<string, unknown> = {
      ok: true,
      file: '/srv/x.dump',
      bytes: 5,
      sha256: 'abc',
    };
    const asked: string[] = [];
    const channel = {
      reachable: () => Promise.resolve(true),
      call: (request: { op: string; app: string }) => {
        asked.push(`${request.op} ${request.app}`);
        return Promise.resolve(answer as never);
      },
    };
    const { store, openIn } = await session(client, undefined, {
      channel: () => channel,
    });
    const postgres = await openIn('p', { database: 'postgres' });
    await postgres.apply(specOf('nocolms'));
    await postgres.remove('nocolms', { purgeData: false });
    expect(log.some((line) => line.startsWith('remove'))).toBe(false);
    expect(store.rows.get('nocolms')?.desiredState).toBe('stopped');
    expect(asked).toEqual([]);

    // A failed dump keeps everything.
    answer = { ok: false, error: 'DUMP_FAILED' };
    await expect(
      postgres.remove('nocolms', { purgeData: true }),
    ).rejects.toThrow(/DUMP_FAILED/u);
    expect(log.some((line) => line.startsWith('remove'))).toBe(false);
    expect(store.rows.has('nocolms')).toBe(true);

    answer = { ok: true, file: '/srv/x.dump', bytes: 5, sha256: 'abc' };
    await postgres.remove('nocolms', { purgeData: true });
    expect(asked.at(-1)).toBe('dump nb3-nocolms');
    expect(log).toContain('remove id-nb3-nocolms');
    expect(store.rows.has('nocolms')).toBe(false);
    await expect(stat(join(root, 'data', 'nb3-nocolms'))).rejects.toThrow();
  });

  it('refuses to purge data it cannot dump: SQLite, or no job channel', async () => {
    const { client, log } = fakeDokploy();
    const { opened, store, openIn } = await session(client);
    await opened.apply(specOf('nocolms'));
    await expect(opened.remove('nocolms', { purgeData: true })).rejects.toThrow(
      /SQLite/u,
    );
    const postgres = await openIn('p', { database: 'postgres' });
    await expect(
      postgres.remove('nocolms', { purgeData: true }),
    ).rejects.toThrow(/channel is off/u);
    expect(log.some((line) => line.startsWith('remove'))).toBe(false);
    expect(store.rows.has('nocolms')).toBe(true);
  });

  it('stops an App whose idle time is over and only that one', async () => {
    const { client, log } = fakeDokploy();
    const store = memoryStore();
    const long = new Date('2026-11-09T10:00:00Z');
    const row = (
      appId: string,
      startedAt: Date,
      idle: number | null,
    ): Nb3Row => ({
      appId,
      composeId: `id-${appId}`,
      composeName: `nb3-${appId}`,
      desiredState: 'running',
      version: 'v',
      deploymentId: null,
      dbPasswordSealed: null,
      idleStopMinutes: idle,
      lastError: null,
      startedAt,
    });
    await store.save(row('old', long, 30));
    await store.save(row('fresh', new Date('2026-11-09T10:50:00Z'), 30));
    await store.save(row('never', long, null));
    const stopped = await sweepIdle(
      {
        dokploy: () => client,
        store,
        now: () => new Date('2026-11-09T11:00:00Z'),
      },
      () => undefined,
    );
    expect(stopped).toBe(1);
    expect(log).toEqual(['stop id-old']);
    expect(store.rows.get('old')?.desiredState).toBe('stopped');
    expect(store.rows.get('fresh')?.desiredState).toBe('running');
  });
  describe('idle by request (V5.1b)', () => {
    const at = new Date('2026-11-09T11:00:00Z');
    const idleRow = (): Nb3Row => ({
      appId: 'old',
      composeId: 'id-old',
      composeName: 'nb3-old',
      desiredState: 'running',
      version: 'v',
      deploymentId: null,
      dbPasswordSealed: null,
      idleStopMinutes: 30,
      lastError: null,
      startedAt: new Date('2026-11-09T10:00:00Z'),
    });
    const sweepWith = async (answer: Record<string, unknown> | null) => {
      const { client, log } = fakeDokploy();
      const store = memoryStore();
      await store.save(idleRow());
      const stopped = await sweepIdle(
        {
          dokploy: () => client,
          store,
          now: () => at,
          channel: () => ({
            reachable: () => Promise.resolve(true),
            call: () =>
              Promise.resolve(
                (answer ?? { ok: false, error: 'UNREACHABLE' }) as never,
              ),
          }),
        },
        () => undefined,
      );
      return { stopped, log };
    };

    it('keeps an App that had a request within its idle time, although it started long ago', async () => {
      const { stopped, log } = await sweepWith({
        ok: true,
        known: true,
        from: '2026-11-09T09:00:00Z',
        lastAt: '2026-11-09T10:45:00Z',
      });
      expect(stopped).toBe(0);
      expect(log).toEqual([]);
    });

    it('stops an App whose last request is older than its idle time', async () => {
      const { stopped, log } = await sweepWith({
        ok: true,
        known: true,
        from: '2026-11-09T09:00:00Z',
        lastAt: '2026-11-09T10:20:00Z',
      });
      expect(stopped).toBe(1);
      expect(log).toEqual(['stop id-old']);
    });

    it('stops an App with no request in a log that reaches back past its idle time', async () => {
      const { stopped } = await sweepWith({
        ok: true,
        known: true,
        from: '2026-11-09T10:10:00Z',
        lastAt: null,
      });
      expect(stopped).toBe(1);
    });

    it('does not stop an App when the log is too short to tell', async () => {
      const { stopped } = await sweepWith({
        ok: true,
        known: true,
        from: '2026-11-09T10:50:00Z',
        lastAt: null,
      });
      expect(stopped).toBe(0);
    });

    it('falls back to the time since start when the daemon cannot say', async () => {
      expect((await sweepWith({ ok: true, known: false })).stopped).toBe(1);
      expect((await sweepWith(null)).stopped).toBe(1);
    });
  });

  it('makes the database password when a deployment needs it, once, and keeps two releases', async () => {
    const { client } = fakeDokploy();
    const { opened, store, openIn } = await session(client, undefined, {});
    // An App row made while the environment used SQLite, now deployed to PostgreSQL.
    await opened.apply(specOf('nocolms'));
    expect(store.rows.get('nocolms')?.dbPasswordSealed).toBeNull();
    const postgres = await openIn('p', { database: 'postgres' });
    await postgres.apply(specOf('nocolms'));
    const sealed = store.rows.get('nocolms')?.dbPasswordSealed;
    expect(sealed).toMatch(/^sealed:[0-9a-f]{36}$/u);
    await postgres.apply(specOf('nocolms'));
    expect(store.rows.get('nocolms')?.dbPasswordSealed).toBe(sealed);

    // Releases: only the running one and the newest other stay.
    const { utimes } = await import('node:fs/promises');
    const folder = join(root, 'data', 'nb3-nocolms');
    const dayOf = (n: number) => new Date(Date.UTC(2026, 10, n));
    await utimes(join(folder, 'abc123', '.extracted'), dayOf(0), dayOf(0));
    for (const [version, day] of [
      ['v1', 1],
      ['v2', 2],
      ['v3', 3],
    ] as const) {
      await postgres.apply(
        specOf('nocolms', {
          release: { id: version, version, checksum: 'x' },
        }),
      );
      await utimes(join(folder, version, '.extracted'), dayOf(day), dayOf(day));
    }
    await postgres.apply(
      specOf('nocolms', {
        release: { id: 'v4', version: 'v4', checksum: 'x' },
      }),
    );
    const { readdir } = await import('node:fs/promises');
    expect((await readdir(folder)).sort()).toEqual(['v3', 'v4']);
  });
});
