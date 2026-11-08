// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { afterEach, expect, vi } from 'vitest';
import { createAppTest } from '@nocobase/app-testing/server';
import bcrypt from 'bcryptjs';
import {
  signIn,
  DEFAULT_ADMIN_CREDENTIALS,
} from '@nocobase/app-plugin-authentication/testing';
import { secretsServiceToken } from '@nocobase/app-server/secrets';
import { databaseManagerToken } from '@nocobase/db';
import { createStandaloneServer } from '../../server/standalone.js';
import { CONTRIBUTOR_SET_KEY } from '../../server/access/roles.js';
import type { GitService } from '../../server/git/service.js';
import {
  BLOCKED_HOSTS,
  SETUP_SCRIPT,
  composeEnv,
  composeFile,
} from '../../server/previews/compose.js';
import {
  DokployRefused,
  createDokployClient,
  type DokployClient,
} from '../../server/previews/dokploy.js';
import {
  createPreviewService,
  type ResourceProbe,
} from '../../server/previews/service.js';

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

const DOKPLOY = 'https://dokploy.test';
const GITHUB = 'https://github.test/api';
const TOKEN = 'ghp_preview_token_never_returned';
const PASSWORD = 'Studio-test-123!';

const json = (body: unknown, method = 'POST') => ({
  method,
  headers: {
    'content-type': 'application/json',
    origin: 'http://localhost',
    'Idempotency-Key': `${Date.now()}.${randomUUID()}`,
  },
  body: JSON.stringify(body),
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Dokploy as one project with one environment and whatever composes the test says exist. */
function fakeDokploy(
  composes: Record<string, { name: string; environmentId: string }>,
) {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(
        typeof input === 'string' || input instanceof URL ? input : input.url,
      );
      const path = url.pathname.replace(/^\/api\//u, '');
      calls.push(`${init?.method ?? 'GET'} ${path}`);
      const answer = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), {
          status,
          headers: { 'content-type': 'application/json' },
        });
      if (new Headers(init?.headers).get('x-api-key') !== 'dokploy-key')
        return answer({ message: 'unauthorized' }, 401);
      if (path === 'project.one')
        return answer({
          environments: [{ environmentId: 'env-1', name: 'production' }],
        });
      if (path === 'compose.one') {
        const id = url.searchParams.get('composeId') ?? '';
        const compose = composes[id];
        return compose
          ? answer({ composeId: id, appName: `app-${id}`, ...compose })
          : answer({ message: 'not found' }, 404);
      }
      if (path === 'compose.create') {
        const body = JSON.parse(String(init?.body)) as {
          name: string;
          environmentId: string;
        };
        composes['new-1'] = {
          name: body.name,
          environmentId: body.environmentId,
        };
        return answer({
          composeId: 'new-1',
          appName: 'app-new-1',
          name: body.name,
          environmentId: body.environmentId,
        });
      }
      return answer({});
    },
  );
  return calls;
}

test('the Dokploy client touches only the preview composes Studio recorded', async () => {
  const calls = fakeDokploy({
    mine: { name: 'nocobase-preview', environmentId: 'env-1' },
    production: { name: 'nocobase-dsc', environmentId: 'env-9' },
    renamed: { name: 'studio', environmentId: 'env-1' },
    elsewhere: { name: 'nocobase-preview', environmentId: 'env-9' },
  });
  const allowed = new Set(['mine', 'renamed', 'elsewhere']);
  const client = createDokployClient(
    { url: DOKPLOY, apiKey: 'dokploy-key', projectId: 'p1' },
    async () => allowed,
  );

  // An id Studio never recorded is refused before anything is sent.
  for (const call of [
    () => client.deploy('production', 'x'),
    () => client.stop('production'),
    () => client.remove('production'),
  ])
    await expect(call()).rejects.toBeInstanceOf(DokployRefused);
  expect(calls).toEqual([]);
  // A recorded id that Dokploy says is another compose, or in another environment, is refused too.
  await expect(client.remove('renamed')).rejects.toBeInstanceOf(DokployRefused);
  await expect(client.stop('elsewhere')).rejects.toBeInstanceOf(DokployRefused);
  expect(
    calls.filter(
      (call) => !call.endsWith('compose.one') && !call.endsWith('project.one'),
    ),
  ).toEqual([]);
  // Only the two names may be created.
  await expect(
    client.create('nocobase-dsc' as 'nocobase-preview'),
  ).rejects.toBeInstanceOf(DokployRefused);
  // The real thing goes through.
  await client.deploy('mine', 'PR #5');
  await client.remove('mine');
  expect(calls).toContain('POST compose.deploy');
  expect(calls).toContain('POST compose.delete');
  const created = await client.create('nocobase-staging');
  expect(created).toMatchObject({ composeId: 'new-1', environmentId: 'env-1' });
});

test('the compose file blocks production, gates the pages with basic auth and holds no secret', () => {
  const users = `preview:${bcrypt.hashSync('gate-password', 4)}`;
  const file = composeFile({
    slot: 'preview',
    host: 'preview.dsc.edu.vn',
    basicAuthUsers: users,
  });
  // The pages are behind basic auth; `/api/` and `/ws` (NocoBase sends its own Authorization) have a router without it.
  expect(file).toContain(`basicauth.users=${users.replaceAll('$', '$$$$')}`);
  expect(file).not.toContain(users);
  expect(file).toContain(
    'routers.ds-nocobase-preview.middlewares=ds-nocobase-preview-auth,ds-nocobase-preview-headers',
  );
  expect(file).toContain(
    'routers.ds-nocobase-preview-api.middlewares=ds-nocobase-preview-headers',
  );
  expect(file).toMatch(
    /ds-nocobase-preview-api\.rule=Host\(`preview\.dsc\.edu\.vn`\) && \(PathPrefix\(`\/api\/`\) \|\| PathPrefix\(`\/ws`\)\)/u,
  );
  expect(file).not.toContain('gate-password');
  expect(() =>
    composeFile({
      slot: 'preview',
      host: 'preview.dsc.edu.vn',
      basicAuthUsers: 'preview:plain',
    }),
  ).toThrow();
  for (const host of BLOCKED_HOSTS) expect(file).toContain(`${host}:0.0.0.0`);
  expect(file).toContain('mem_limit: 1g');
  expect(file).toContain('Host(`preview.dsc.edu.vn`)');
  expect(file).toContain('ds-preview-app');
  expect(file).not.toMatch(/^ {2}(app|db):$/mu);
  expect(SETUP_SCRIPT).not.toContain('$');
  // The one-shot setup does nothing when the stopped preview is started again.
  expect(SETUP_SCRIPT.indexOf("fs.existsSync('/state/done')")).toBeLessThan(
    SETUP_SCRIPT.indexOf('api.github.com'),
  );
  expect(file).toContain('setupstate:/state');
  expect(SETUP_SCRIPT).not.toContain('`');
  expect(() =>
    composeFile({
      slot: 'preview',
      host: 'evil`) || Host(`x',
      basicAuthUsers: users,
    }),
  ).toThrow();
  expect(() =>
    composeEnv({
      APP_KEY: 'a\nb',
      DB_PASSWORD: '',
      NB_ACCOUNT: '',
      NB_PASSWORD: '',
      DSC_SEPAY_API_KEY: '',
      GH_TOKEN: '',
      REPO: '',
      SHA: '',
      ARTIFACT_URL: '',
      CALLBACK_URL: '',
      CALLBACK_TOKEN: '',
    }),
  ).toThrow();
});

/** A recording Dokploy client that trusts whatever ids the service recorded (the allowlist is tested above). */
function recordingDokploy(): { client: DokployClient; calls: string[] } {
  const calls: string[] = [];
  let next = 0;
  return {
    calls,
    client: {
      environmentId: async () => 'env-1',
      create: async (name) => {
        next += 1;
        calls.push(`create ${name} c${next}`);
        return {
          composeId: `c${next}`,
          name,
          appName: `app-c${next}`,
          environmentId: 'env-1',
          status: 'idle',
        };
      },
      get: async (id) => ({
        composeId: id,
        name: 'nocobase-preview',
        appName: id,
        environmentId: 'env-1',
        status: 'done',
      }),
      update: async (id, input) => {
        calls.push(`update ${id}`);
        expect(input.env).toContain('GH_TOKEN=installation-token');
        expect(input.composeFile).toContain('ds-');
      },
      deploy: async (id) => {
        calls.push(`deploy ${id}`);
      },
      stop: async (id) => {
        calls.push(`stop ${id}`);
      },
      start: async (id) => {
        calls.push(`start ${id}`);
      },
      remove: async (id) => {
        calls.push(`remove ${id}`);
      },
    },
  };
}

const workflowRun = (number: number, sha: string, runId: number) => ({
  action: 'completed',
  workflow_run: {
    id: runId,
    name: 'preview',
    conclusion: 'success',
    event: 'pull_request',
    head_sha: sha,
    head_branch: `agent/DS-${number}`,
    html_url: `https://github.test/acme/nocobase/actions/runs/${runId}`,
    pull_requests: [{ number }],
  },
});

test('one preview slot: queue, report, close, idle and resources', async ({
  app,
}) => {
  const db = app.container.resolve(databaseManagerToken);
  const dokploy = recordingDokploy();
  let available = 4000;
  let clock = new Date('2026-11-03T10:00:00Z');
  const probe: ResourceProbe = {
    availableMb: async () => available,
    productionMs: async () => 200,
  };
  let tokenCounter = 0;
  const git = {
    getRepository: async () => ({
      repo: 'acme/nocobase',
      defaultBranch: 'main',
    }),
    clientForRepository: async () => ({
      runArtifacts: async () => [
        {
          id: 1,
          name: 'duongsinh-plugins',
          expired: false,
          downloadUrl: 'https://github.test/zip',
        },
      ],
    }),
    repositoryToken: async () => ({
      token: 'installation-token',
      expiresAt: '',
      fullName: 'acme/nocobase',
    }),
  } as unknown as GitService;
  const service = createPreviewService({
    database: db,
    secrets: () => app.container.resolve(secretsServiceToken),
    git: () => git,
    dokploy: () => dokploy.client,
    publicBase: () => 'https://studio.test/main',
    hosts: { preview: 'preview.test', staging: 'staging.test' },
    probe,
    now: () => clock,
    random: (bytes) => `r${(tokenCounter += 1)}`.padEnd(bytes, 'x'),
  });

  expect(
    await service.onWebhook(
      'repo-1',
      'workflow_run',
      workflowRun(5, 'aaa', 11),
    ),
  ).toBe('preview');
  const [five] = await service.list({ repositoryIds: ['repo-1'] });
  expect(five).toMatchObject({
    pullNumber: 5,
    status: 'deploying',
    url: 'https://preview.test',
  });
  expect(dokploy.calls).toEqual([
    'create nocobase-preview c1',
    'update c1',
    'deploy c1',
  ]);
  expect(await service.allowedComposeIds()).toEqual(new Set(['c1']));

  // Another pull request waits for the slot.
  await service.onWebhook('repo-1', 'workflow_run', workflowRun(6, 'bbb', 12));
  const six = (await service.list({ repositoryIds: ['repo-1'] })).find(
    (item) => item.pullNumber === 6,
  );
  expect(six).toMatchObject({ status: 'blocked' });
  expect(six?.reason).toMatch(/^slotBusy:/u);

  // The setup's report needs its token; a wrong one changes nothing.
  expect(
    await service.report({
      id: five.id,
      token: 'wrong-token-wrong-token',
      status: 'ready',
      reason: null,
    }),
  ).toBe(false);
  // The callback token is the second value drawn for a deploy (after the password); its report makes the preview ready.
  expect(
    await service.report({
      id: five.id,
      token: 'r2'.padEnd(24, 'x'),
      status: 'ready',
      reason: null,
    }),
  ).toBe(true);
  expect((await service.get(five.id)).status).toBe('ready');
  const credentials = await service.credentials(five.id);
  expect(credentials).toMatchObject({
    url: 'https://preview.test',
    account: 'preview-root@example.com',
    basicUser: 'preview',
  });
  expect(credentials?.basicPassword).toMatch(/^r\d/u);

  // Closing pull request #5 removes its compose and gives the slot to #6.
  await service.onWebhook('repo-1', 'pull_request', {
    action: 'closed',
    pull_request: { number: 5 },
  });
  expect((await service.get(five.id)).status).toBe('destroyed');
  expect(dokploy.calls.slice(3)).toEqual([
    'remove c1',
    'create nocobase-preview c2',
    'update c2',
    'deploy c2',
  ]);
  expect((await service.get(six?.id ?? '')).status).toBe('deploying');

  // Idle for 30 minutes after being ready: stopped (the slot keeps its data).
  const sixRow = await db
    .connection()
    .query.selectFrom('dsPreviews')
    .selectAll()
    .where('id', '=', six?.id ?? '')
    .executeTakeFirstOrThrow();
  await db
    .connection()
    .query.updateTable('dsPreviews')
    .set({ status: 'ready', lastUsedAt: clock })
    .where('id', '=', sixRow.id as string)
    .execute();
  clock = new Date(clock.getTime() + 31 * 60 * 1000);
  expect(await service.sweep()).toBe(1);
  expect((await service.get(six?.id ?? '')).status).toBe('stopped');
  expect(dokploy.calls.at(-1)).toBe('stop c2');
  // Opening it starts it again.
  expect((await service.open(six?.id ?? '')).status).toBe('ready');
  expect(dokploy.calls.at(-1)).toBe('start c2');

  // Not enough memory on the VPS: the next build waits for resources and nothing is created.
  available = 500;
  await service.onWebhook('repo-1', 'pull_request', {
    action: 'unlabeled',
    label: { name: 'preview' },
    pull_request: { number: 6 },
  });
  const before = dokploy.calls.length;
  await service.onWebhook('repo-1', 'workflow_run', workflowRun(7, 'ccc', 13));
  const seven = (await service.list({ repositoryIds: ['repo-1'] })).find(
    (item) => item.pullNumber === 7,
  );
  expect(seven).toMatchObject({ status: 'blocked' });
  expect(seven?.reason).toMatch(/^resources:/u);
  expect(dokploy.calls.length).toBe(before);

  // A failed setup stops its compose and frees the slot; closing its pull request then removes the compose.
  available = 4000;
  await service.onWebhook('repo-1', 'workflow_run', workflowRun(8, 'ddd', 14));
  const eight = (await service.list({ repositoryIds: ['repo-1'] })).find(
    (item) => item.pullNumber === 8,
  );
  expect(eight?.status).toBe('deploying');
  const created = dokploy.calls.at(-1)?.split(' ')[1] ?? '';
  const drawn = tokenCounter;
  expect(
    await service.report({
      id: eight?.id ?? '',
      token: `r${drawn - 4}`.padEnd(24, 'x'),
      status: 'failed',
      reason: 'boom',
    }),
  ).toBe(true);
  expect(await service.get(eight?.id ?? '')).toMatchObject({
    status: 'failed',
    reason: 'boom',
  });
  expect(dokploy.calls.at(-1)).toBe(`stop ${created}`);
  expect(await service.occupant('preview')).toBeNull();
  await service.onWebhook('repo-1', 'pull_request', {
    action: 'closed',
    pull_request: { number: 8 },
  });
  expect(dokploy.calls.at(-1)).toBe(`remove ${created}`);

  // A failed build or another workflow is ignored.
  expect(
    await service.onWebhook('repo-1', 'workflow_run', {
      action: 'completed',
      workflow_run: { name: 'verify', conclusion: 'success' },
    }),
  ).toBe('ignored');
});

test('preview routes: who sees, who gets the sign-in, and the setup report', async ({
  testApp,
  app,
  request,
}) => {
  // GitHub for the token connection that links the repository.
  const original = globalThis.fetch;
  vi.stubGlobal(
    'fetch',
    async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(
        typeof input === 'string' || input instanceof URL ? input : input.url,
      );
      if (!url.href.startsWith(GITHUB)) return original(input, init);
      const path = url.pathname.slice('/api'.length);
      const answer = (body: unknown) =>
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      if (path === '/user') return answer({ login: 'bot' });
      if (path === '/repos/acme/nocobase')
        return answer({
          id: 1,
          full_name: 'acme/nocobase',
          default_branch: 'main',
          clone_url: 'https://github.test/acme/nocobase.git',
          html_url: 'https://github.test/acme/nocobase',
          permissions: { push: true },
        });
      return answer([]);
    },
  );
  const owner = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const connection = (
    await (
      await owner.fetch(
        '/git/connections',
        json({ name: 'GitHub', token: TOKEN, apiBaseUrl: GITHUB }),
      )
    ).json()
  ).data as { id: string };
  const repository = (
    await (
      await owner.fetch(
        '/git/repositories',
        json({ connectionId: connection.id, repo: 'acme/nocobase' }),
      )
    ).json()
  ).data as { id: string };
  const project = (
    await (
      await owner.fetch(
        '/projects',
        json({ name: 'NocoBase', visibility: 'members' }),
      )
    ).json()
  ).data as { id: string };
  expect(
    (
      await owner.fetch(
        `/projects/${project.id}/codeLocations`,
        json({ repositoryId: repository.id }),
      )
    ).status,
  ).toBe(201);
  const issue = (
    await (
      await owner.fetch(
        '/projects/issues',
        json({ title: 'Giao diện', projectId: project.id }),
      )
    ).json()
  ).data as { id: string };

  // A preview as the service writes it, with sealed credentials.
  const db = app.container.resolve(databaseManagerToken).connection();
  const id = randomUUID();
  const sealed = app.container.resolve(secretsServiceToken).seal(
    JSON.stringify({
      url: 'https://preview.test',
      account: 'preview-root@example.com',
      password: 'p4ss',
    }),
    {
      purpose: 'duongsinh-studio/preview-credentials',
      aad: [id],
    },
  );
  const at = new Date();
  await db.query
    .insertInto('dsPreviews')
    .values({
      id,
      slot: 'preview',
      repositoryId: repository.id,
      pullNumber: 5,
      pullRequestId: null,
      issueId: issue.id,
      branch: 'agent/DS-1',
      sha: 'abc1234',
      runId: 11,
      logsUrl: null,
      status: 'ready',
      reason: null,
      url: 'https://preview.test',
      credentialsSealed: sealed,
      callbackHash: 'x'.repeat(64),
      requestedById: null,
      readyAt: at,
      lastUsedAt: at,
      stoppedAt: null,
      createdAt: at,
      updatedAt: at,
    })
    .execute();

  const listed = (
    await (await owner.fetch(`/previews?issueId=${issue.id}`)).json()
  ).data as { id: string; status: string }[];
  expect(listed).toEqual([expect.objectContaining({ id, status: 'ready' })]);
  expect(JSON.stringify(listed)).not.toContain('p4ss');
  expect(
    (
      (await (await owner.fetch(`/previews/${id}/credentials`)).json())
        .data as { password: string }
    ).password,
  ).toBe('p4ss');

  // A contributor outside the members-only project sees nothing and gets no sign-in.
  expect(
    (
      await owner.fetch(
        '/users',
        json({
          name: 'contributor1',
          username: 'contributor1',
          email: 'contributor1@example.test',
          password: PASSWORD,
          roleScopes: { app: [CONTRIBUTOR_SET_KEY] },
        }),
      )
    ).status,
  ).toBe(201);
  const contributor = await signIn(testApp, {
    username: 'contributor1',
    password: PASSWORD,
  });
  expect((await (await contributor.fetch('/previews')).json()).data).toEqual(
    [],
  );
  expect((await contributor.fetch(`/previews/${id}/credentials`)).status).toBe(
    404,
  );
  expect(
    (await contributor.fetch(`/previews/${id}/down`, json({}))).status,
  ).toBe(404);

  // The setup report needs no session but its token: a wrong token is refused and changes nothing.
  const report = await request(`/previews/${id}/report`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token: 'not-the-token-at-all', status: 'failed' }),
  });
  expect(report.status).toBe(401);
  expect(
    (
      (await (await owner.fetch(`/previews/${id}`)).json()).data as {
        status: string;
      }
    ).status,
  ).toBe('ready');

  // Without Dokploy configured (development), managing a preview is refused, never faked.
  expect((await owner.fetch(`/previews/${id}/retry`, json({}))).status).toBe(
    400,
  );
});
