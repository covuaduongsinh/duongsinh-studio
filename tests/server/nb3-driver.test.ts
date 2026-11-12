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
    const opened = await driver.open(
      { id: 'e', name: 'e', config: config(), secret: null, publicUrl: null },
      { desired: () => Promise.resolve([]) },
    );
    return { opened, store, extract };
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
    expect(() => settingsOf({ ...config(), maxApps: 3 })).toThrow();
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

  it('removes the compose only when asked to purge data', async () => {
    const { client, log } = fakeDokploy();
    const { opened, store } = await session(client);
    await opened.apply(specOf('nocolms'));
    await opened.remove('nocolms', { purgeData: false });
    expect(log.some((line) => line.startsWith('remove'))).toBe(false);
    expect(store.rows.get('nocolms')?.desiredState).toBe('stopped');
    await opened.remove('nocolms', { purgeData: true });
    expect(log).toContain('remove id-nb3-nocolms');
    expect(store.rows.has('nocolms')).toBe(false);
    await expect(stat(join(root, 'data', 'nb3-nocolms'))).rejects.toThrow();
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
});
