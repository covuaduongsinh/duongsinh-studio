// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect } from 'vitest';
import { createAppTest } from '@nocobase/app-testing/server';
import {
  signIn,
  DEFAULT_ADMIN_CREDENTIALS,
} from '@nocobase/app-plugin-authentication/testing';
import {
  ADMIN_SET_KEY,
  CONTRIBUTOR_SET_KEY,
} from '../../server/access/roles.js';
import { createStandaloneServer } from '../../server/standalone.js';
// @ts-expect-error The daemon is a plain .mjs file without types.
import { sign } from '../../deploy/nb3-exec/ds-nb3-exec.mjs';

const test = createAppTest({
  createServer: createStandaloneServer,
  config: {
    app: { publicOrigin: 'http://localhost' },
    auth: { secret: 'test-auth-secret-at-least-32-characters' },
    secrets: {
      keys: [
        { version: 1, key: 'test-secrets-key-at-least-32-characters-long' },
      ],
    },
  },
});

const PASSWORD = 'Studio-test-123!';
const KEY = 'k'.repeat(40);
const json = (body: unknown, method = 'POST') => ({
  method,
  headers: {
    'content-type': 'application/json',
    origin: 'http://localhost',
    'Idempotency-Key': `${Date.now()}.${randomUUID()}`,
  },
  body: JSON.stringify(body),
});

let daemon: Server | undefined;
afterEach(() => {
  daemon?.close();
  daemon = undefined;
  delete process.env['NB3_EXEC_SOCKET'];
  delete process.env['NB3_EXEC_KEY_FILE'];
});

/** A stand-in daemon: checks the signature the way the real one does, records the argv and answers after `delayMs`. */
function startFakeDaemon(delayMs = 0): Promise<{ argvs: string[][] }> {
  const dir = mkdtempSync(path.join(tmpdir(), 'nb3-jobs-'));
  const socket = path.join(dir, 'exec.sock');
  const keyFile = path.join(dir, 'hmac.key');
  writeFileSync(keyFile, KEY);
  const seen: { argvs: string[][] } = { argvs: [] };
  daemon = createServer((connection) => {
    let data = '';
    connection.setEncoding('utf8');
    connection.on('data', (chunk: string) => {
      data += chunk;
      const end = data.indexOf('\n');
      if (end < 0) return;
      const request = JSON.parse(data.slice(0, end)) as {
        sig: string;
        argv: string[];
      };
      const valid = request.sig === (sign(KEY, request) as string);
      if (valid) seen.argvs.push(request.argv);
      setTimeout(
        () =>
          connection.end(
            `${JSON.stringify(
              valid
                ? {
                    ok: true,
                    exitCode: 0,
                    durationMs: 12,
                    log: 'done',
                    sha256: 'abc',
                  }
                : { ok: false, error: 'BAD_SIGNATURE', message: 'no' },
            )}\n`,
          ),
        delayMs,
      );
    });
  });
  process.env['NB3_EXEC_SOCKET'] = socket;
  process.env['NB3_EXEC_KEY_FILE'] = keyFile;
  return new Promise((resolve) => daemon!.listen(socket, () => resolve(seen)));
}

async function until<T>(read: () => Promise<T>, done: (v: T) => boolean) {
  for (let i = 0; i < 50; i += 1) {
    const value = await read();
    if (done(value)) return value;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('Timed out waiting.');
}

test(
  'jobs: sign-in, permission, owner-only writes, 503 while the daemon is off, 202 then the finished job, 409 while one runs',
  { timeout: 240_000 },
  async ({ testApp, app, request }) => {
    expect((await request('/releases/apps/nb3-x/jobs')).status).toBe(401);
    expect((await request('/releases/apps/nb3-x/jobs', json({}))).status).toBe(
      401,
    );

    const owner = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
    expect(
      (await owner.fetch('/builds/apps/nb3-x/ensure', json({}))).status,
    ).toBe(200);
    for (const [name, set] of [
      ['administrator1', ADMIN_SET_KEY],
      ['contributor1', CONTRIBUTOR_SET_KEY],
    ] as const)
      expect(
        (
          await owner.fetch(
            '/users',
            json({
              name,
              username: name,
              email: `${name}@example.test`,
              password: PASSWORD,
              roleScopes: { app: [set] },
            }),
          )
        ).status,
      ).toBe(201);
    const admin = await signIn(testApp, {
      username: 'administrator1',
      password: PASSWORD,
    });
    const contributor = await signIn(testApp, {
      username: 'contributor1',
      password: PASSWORD,
    });
    const start = (who: typeof owner, command: string) =>
      who.fetch('/releases/apps/nb3-x/jobs', json({ command }));

    // Without the daemon configured: 503.
    const down = await start(owner, 'larkImportDry');
    expect(down.status).toBe(503);
    expect((await down.json()).error.reason).toBe('NB3_JOB_CHANNEL_DOWN');

    const seen = await startFakeDaemon(400);
    // A contributor may not operate the App at all; an administrator may check but not change data.
    expect((await start(contributor, 'larkImportDry')).status).toBe(403);
    expect((await start(admin, 'larkImportCommit')).status).toBe(403);
    expect((await start(admin, 'dbApply')).status).toBe(403);
    expect((await start(owner, 'rm -rf')).status).toBe(400);
    expect(seen.argvs).toEqual([]);

    const first = await start(admin, 'larkImportDry');
    expect(first.status).toBe(202);
    const job = (await first.json()).data as { id: string; status: string };
    expect(job.status).toBe('running');
    // One job per App at a time.
    expect((await start(owner, 'dbApply')).status).toBe(409);

    const finished = await until(
      async () =>
        (
          (await (
            await owner.fetch(`/releases/apps/nb3-x/jobs/${job.id}`)
          ).json()) as { data: { status: string; logTail: string } }
        ).data,
      (value) => value.status !== 'running',
    );
    expect(finished).toMatchObject({ status: 'succeeded', logTail: 'done' });
    expect(seen.argvs).toEqual([['edu', 'import-lark', '--dry-run']]);

    // The owner changes data; the list keeps both, newest first.
    expect((await start(owner, 'dbApply')).status).toBe(202);
    const listed = (
      await (await owner.fetch('/releases/apps/nb3-x/jobs')).json()
    ).data as { command: string }[];
    expect(listed.map((item) => item.command)).toEqual([
      'dbApply',
      'larkImportDry',
    ]);
    expect((await contributor.fetch('/releases/apps/nb3-x/jobs')).status).toBe(
      403,
    );
    void app;
  },
);
