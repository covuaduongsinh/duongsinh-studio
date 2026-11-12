// deploy/nb3-exec/ds-nb3-exec.mjs over a real unix socket and a fake `docker`: who may ask, what it refuses, what it
// runs and what it says back (V4.1). The threat model is in deploy/nb3-exec/README.md.
import { randomBytes } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { connect, type Server } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// @ts-expect-error: a plain ES module with no type declarations.
import { createDaemon, sign } from '../../deploy/nb3-exec/ds-nb3-exec.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const FAKE = path.join(root, 'tests/fixtures/fake-docker/nb3-docker');

let folder = '';
let dockerLog = '';
let socket = '';
let server: Server;
let key = '';
let clock = 1_000_000;
const SECRET = 'S3cr3tValue-ABC123';

type Answer = Record<string, any>;

function config(extra: Record<string, unknown> = {}) {
  return {
    hmacKeyFile: path.join(folder, 'hmac.key'),
    socket,
    dockerBin: FAKE,
    timeoutMs: 5000,
    apps: {
      'nb3-edu': {
        project: 'proj-edu',
        service: 'nb3-edu-app',
        jobService: 'nb3-edu-job',
        composeDir: folder,
        envFile: path.join(folder, 'jobs/nb3-edu.env'),
        allow: [
          ['edu', 'import-lark', '--dry-run'],
          ['edu', 'import-lark', '--commit'],
          ['db', 'apply'],
        ],
        secretNames: ['LARK_APP_ID', 'LARK_APP_SECRET'],
      },
    },
    ...extra,
  };
}

async function start(extra: Record<string, unknown> = {}) {
  const daemon = createDaemon(config(extra), { now: () => clock });
  server = daemon.listen();
  await new Promise<void>((resolve) => server.listen(socket, resolve));
}

function request(
  body: Record<string, unknown>,
  override: Record<string, unknown> = {},
): Promise<Answer> {
  const base = {
    v: 1,
    id: `job-${randomBytes(3).toString('hex')}`,
    ts: clock,
    nonce: randomBytes(8).toString('hex'),
    ...body,
  };
  const signed = { ...base, sig: sign(key, base), ...override };
  return new Promise((resolve, reject) => {
    const client = connect(socket);
    let data = '';
    client.setEncoding('utf8');
    client.on('data', (chunk) => (data += chunk));
    client.on('end', () => resolve(JSON.parse(data) as Answer));
    client.on('error', reject);
    client.write(`${JSON.stringify(signed)}\n`);
  });
}
const raw = (text: string): Promise<Answer> =>
  new Promise((resolve, reject) => {
    const client = connect(socket);
    let data = '';
    client.setEncoding('utf8');
    client.on('data', (chunk) => (data += chunk));
    client.on('end', () => resolve(JSON.parse(data) as Answer));
    client.on('error', reject);
    client.write(text);
  });

const withEnv = (extra: Record<string, string>) =>
  Object.assign(process.env, extra);
const calls = () => readFileSync(dockerLog, 'utf8');

beforeEach(() => {
  folder = mkdtempSync(path.join(tmpdir(), 'ds-nb3-exec-'));
  dockerLog = path.join(folder, 'docker.log');
  writeFileSync(dockerLog, '');
  socket = path.join(folder, 'exec.sock');
  key = randomBytes(32).toString('hex');
  writeFileSync(path.join(folder, 'hmac.key'), key, { mode: 0o600 });
  clock = 1_000_000;
  withEnv({ FAKE_DOCKER_LOG: dockerLog });
  delete process.env.FAKE_EXIT;
  delete process.env.FAKE_SLEEP;
  delete process.env.FAKE_BIG;
  delete process.env.FAKE_PRINT_SECRET;
});
afterEach(async () => {
  await new Promise((resolve) => server?.close(resolve));
  rmSync(folder, { recursive: true, force: true });
});

describe('who may ask', () => {
  it('refuses a request with a wrong signature and runs nothing', async () => {
    await start();
    const answer = await request(
      { op: 'run', app: 'nb3-edu', argv: ['db', 'apply'] },
      { sig: '00'.repeat(32) },
    );
    expect(answer).toMatchObject({ ok: false, error: 'BAD_SIGNATURE' });
    expect(calls()).toBe('');
  });

  it('refuses a request signed with another key', async () => {
    await start();
    const base = {
      v: 1,
      id: 'j',
      op: 'run',
      app: 'nb3-edu',
      argv: ['db', 'apply'],
      ts: clock,
      nonce: 'n1',
    };
    const answer = await raw(
      `${JSON.stringify({ ...base, sig: sign('x'.repeat(40), base) })}\n`,
    );
    expect(answer.error).toBe('BAD_SIGNATURE');
  });

  it('refuses a request whose content was changed after it was signed', async () => {
    await start();
    const base = {
      v: 1,
      id: 'j',
      op: 'run',
      app: 'nb3-edu',
      argv: ['db', 'apply'],
      ts: clock,
      nonce: 'n2',
    };
    const sig = sign(key, base);
    const answer = await raw(
      `${JSON.stringify({ ...base, argv: ['edu', 'import-lark', '--commit'], sig })}\n`,
    );
    expect(answer.error).toBe('BAD_SIGNATURE');
    expect(calls()).toBe('');
  });

  it('refuses an old request and one from the future, and a request used twice', async () => {
    await start();
    expect(
      (
        await request({ op: 'inspect', app: 'nb3-edu' }, {}).then(() =>
          request({ op: 'inspect', app: 'nb3-edu' }),
        )
      ).ok,
    ).toBe(true);
    const stale = {
      v: 1,
      id: 'j',
      op: 'inspect',
      app: 'nb3-edu',
      ts: clock - 120_000,
      nonce: 'old',
    };
    expect(
      (await raw(`${JSON.stringify({ ...stale, sig: sign(key, stale) })}\n`))
        .error,
    ).toBe('STALE');
    const once = {
      v: 1,
      id: 'j',
      op: 'inspect',
      app: 'nb3-edu',
      ts: clock,
      nonce: 'same',
    };
    const line = `${JSON.stringify({ ...once, sig: sign(key, once) })}\n`;
    expect((await raw(line)).ok).toBe(true);
    expect((await raw(line)).error).toBe('REPLAY');
  });

  it('answers garbage and oversized input without crashing', async () => {
    await start();
    expect((await raw('not json\n')).error).toBe('BAD_REQUEST');
    expect((await raw(`${'x'.repeat(70_000)}\n`)).error).toBe('TOO_LARGE');
    expect((await request({ op: 'inspect', app: 'nb3-edu' })).ok).toBe(true);
  });
});

describe('what it refuses to run', () => {
  it('refuses an app it does not know, a bad app name and an unknown operation', async () => {
    await start();
    expect((await request({ op: 'inspect', app: 'nb3-other' })).error).toBe(
      'UNKNOWN_APP',
    );
    expect((await request({ op: 'inspect', app: '../etc' })).error).toBe(
      'BAD_APP',
    );
    expect((await request({ op: 'inspect', app: 'nocoedu' })).error).toBe(
      'BAD_APP',
    );
    expect((await request({ op: 'exec', app: 'nb3-edu' })).error).toBe(
      'BAD_OP',
    );
    expect(calls()).toBe('');
  });

  it('runs only a command that is in the allowlist exactly', async () => {
    await start();
    for (const argv of [
      ['edu', 'import-lark'],
      ['edu', 'import-lark', '--dry-run', '--commit'],
      ['edu', 'import-lark', '--dry-run; touch /tmp/pwned'],
      ['sh', '-c', 'id'],
      ['db', 'apply', '--force'],
      [],
    ]) {
      const answer = await request({ op: 'run', app: 'nb3-edu', argv });
      expect(answer.ok).toBe(false);
      expect(['NOT_ALLOWED', 'BAD_REQUEST']).toContain(answer.error);
    }
    expect(calls()).toBe('');
  });
});

describe('what it runs', () => {
  it('runs an allowed command in the job service with no shell and answers the exit code and the log', async () => {
    await start();
    const answer = await request({
      id: 'job-1',
      op: 'run',
      app: 'nb3-edu',
      argv: ['edu', 'import-lark', '--dry-run'],
    });
    expect(answer).toMatchObject({ ok: true, exitCode: 0, timedOut: false });
    expect(answer.log).toContain('job output line');
    expect(answer.sha256).toHaveLength(64);
    const call = calls().trim().split('\n')[0];
    expect(call).toContain(
      'compose -p proj-edu run --rm --no-deps --name ds-job-job-1 nb3-edu-job node dist/cli/index.js edu import-lark --dry-run',
    );
  });

  it('passes a failing exit code back', async () => {
    await start();
    process.env.FAKE_EXIT = '3';
    expect(
      (await request({ op: 'run', app: 'nb3-edu', argv: ['db', 'apply'] }))
        .exitCode,
    ).toBe(3);
  });

  it('runs one job at a time for an app', async () => {
    await start();
    process.env.FAKE_SLEEP = '1';
    const first = request({ op: 'run', app: 'nb3-edu', argv: ['db', 'apply'] });
    await new Promise((resolve) => setTimeout(resolve, 200));
    const second = await request({
      op: 'run',
      app: 'nb3-edu',
      argv: ['db', 'apply'],
    });
    expect(second.error).toBe('BUSY');
    expect((await first).ok).toBe(true);
  });

  it('stops a job that runs too long and removes its container', async () => {
    await start({ timeoutMs: 300 });
    process.env.FAKE_SLEEP = '5';
    const answer = await request({
      op: 'run',
      app: 'nb3-edu',
      argv: ['db', 'apply'],
    });
    expect(answer).toMatchObject({ ok: true, timedOut: true, exitCode: null });
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(calls()).toMatch(/rm -f ds-job-/u);
  });
});

describe('what it says back', () => {
  it('hides the values of the job environment and secret-looking assignments in the log', async () => {
    await start();
    mkdirSync(path.join(folder, 'jobs'));
    writeFileSync(
      path.join(folder, 'jobs/nb3-edu.env'),
      `LARK_APP_SECRET=${SECRET}\nLARK_APP_ID=cli_a1b2c3d4\n`,
      { mode: 0o600 },
    );
    process.env.FAKE_PRINT_SECRET = SECRET;
    const answer = await request({
      op: 'run',
      app: 'nb3-edu',
      argv: ['edu', 'import-lark', '--dry-run'],
    });
    expect(answer.log).not.toContain(SECRET);
    expect(answer.log).toContain('[HIDDEN]');
    expect(answer.log).toContain('job output line');
  });

  it('keeps the last 20 KB of a long log and counts the whole', async () => {
    await start();
    process.env.FAKE_BIG = '1';
    const answer = await request({
      op: 'run',
      app: 'nb3-edu',
      argv: ['db', 'apply'],
    });
    expect(answer.logBytes).toBeGreaterThan(60_000);
    expect(Buffer.byteLength(answer.log)).toBeLessThanOrEqual(20 * 1024);
  });

  it('answers container logs and state', async () => {
    await start();
    expect(
      (await request({ op: 'logs', app: 'nb3-edu', since: '30m', tail: 50 }))
        .log,
    ).toContain('app log line one');
    expect(calls()).toContain('logs --since 30m --tail 50 cid123');
    const state = await request({ op: 'inspect', app: 'nb3-edu' });
    expect(state).toMatchObject({
      ok: true,
      state: 'running',
      health: 'healthy',
      restartCount: 2,
      oomKilled: false,
    });
    // A bad "since" falls back instead of reaching docker.
    await request({ op: 'logs', app: 'nb3-edu', since: '1h; id', tail: 5000 });
    expect(calls()).toContain('logs --since 1h --tail 1000 cid123');
  });
});

describe('job secrets', () => {
  it('stores a secret in a file only root reads, replaces it, and lists names but never values', async () => {
    await start();
    const set = await request({
      op: 'secretSet',
      app: 'nb3-edu',
      name: 'LARK_APP_SECRET',
      value: SECRET,
    });
    expect(set).toMatchObject({ ok: true, stored: 'LARK_APP_SECRET' });
    const file = path.join(folder, 'jobs/nb3-edu.env');
    expect(statSync(file).mode & 0o777).toBe(0o600);
    await request({
      op: 'secretSet',
      app: 'nb3-edu',
      name: 'LARK_APP_ID',
      value: 'cli_a1b2c3d4',
    });
    await request({
      op: 'secretSet',
      app: 'nb3-edu',
      name: 'LARK_APP_SECRET',
      value: 'Another-Value-789',
    });
    expect(
      readFileSync(file, 'utf8').split('\n').filter(Boolean).sort(),
    ).toEqual([
      'LARK_APP_ID=cli_a1b2c3d4',
      'LARK_APP_SECRET=Another-Value-789',
    ]);
    const names = await request({ op: 'secretNames', app: 'nb3-edu' });
    expect(names.names.sort()).toEqual(['LARK_APP_ID', 'LARK_APP_SECRET']);
    expect(JSON.stringify(names)).not.toContain('Another-Value');
    expect(JSON.stringify(set)).not.toContain(SECRET);
  });

  it('refuses a bad name, a value with a line break, and a name the app does not allow', async () => {
    await start();
    expect(
      (
        await request({
          op: 'secretSet',
          app: 'nb3-edu',
          name: 'lower',
          value: 'x',
        })
      ).error,
    ).toBe('BAD_NAME');
    expect(
      (
        await request({
          op: 'secretSet',
          app: 'nb3-edu',
          name: 'A_B',
          value: 'one\nTWO=2',
        })
      ).error,
    ).toBe('BAD_VALUE');
    expect(
      (
        await request({
          op: 'secretSet',
          app: 'nb3-edu',
          name: 'LD_PRELOAD',
          value: 'x',
        })
      ).error,
    ).toBe('NAME_NOT_ALLOWED');
    expect(existsSync(path.join(folder, 'jobs/nb3-edu.env'))).toBe(false);
  });
});
