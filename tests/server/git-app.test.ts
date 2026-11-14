// @vitest-environment node
import {
  createHmac,
  createVerify,
  generateKeyPairSync,
  randomUUID,
} from 'node:crypto';
import { afterEach, expect, vi } from 'vitest';
import { createAppTest } from '@nocobase/app-testing/server';
import {
  signIn,
  DEFAULT_ADMIN_CREDENTIALS,
} from '@nocobase/app-plugin-authentication/testing';
import { agentsToken } from '@nocobase/app-plugin-agents/server/tokens';
import type { Run } from '@nocobase/app-plugin-agents/server/tokens';
import { createStandaloneServer } from '../../server/standalone.js';
import { CONTRIBUTOR_SET_KEY } from '../../server/access/roles.js';
import { gitServiceToken } from '../../server/providers/git.js';
import {
  appJwt,
  appManifest,
  missingPermissions,
  REQUIRED_APP_PERMISSIONS,
  verifySignature,
} from '../../server/git/github-app.js';

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

const API = 'https://github.test/api';
const CLONE_URL = 'https://github.test/acme/sandbox.git';
const WEBHOOK_SECRET = 'whsec-test-never-returned';
const CODE = 'manifest-code-1';
const PASSWORD = 'Studio-test-123!';
const { privateKey: PRIVATE_KEY, publicKey: PUBLIC_KEY } = generateKeyPairSync(
  'rsa',
  {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  },
);

const json = (body: unknown, method = 'POST') => ({
  method,
  headers: {
    'content-type': 'application/json',
    origin: 'http://localhost',
    'Idempotency-Key': `${Date.now()}.${randomUUID()}`,
  },
  body: JSON.stringify(body),
});

/** Whether `jwt` is an RS256 JWT of App 99 signed with the App's key. */
function validJwt(jwt: string): boolean {
  const [header, payload, signature] = jwt.split('.');
  if (!header || !payload || !signature) return false;
  const verifier = createVerify('RSA-SHA256');
  verifier.update(`${header}.${payload}`);
  verifier.end();
  if (!verifier.verify(PUBLIC_KEY, Buffer.from(signature, 'base64url')))
    return false;
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString()) as {
    iss: string;
    exp: number;
  };
  return claims.iss === '99' && claims.exp * 1000 > Date.now();
}

interface FakeGitHub {
  tokenLifetimeMs: number;
  minted: { repositories: string[] | null }[];
  calls: { method: string; path: string }[];
}

/** GitHub as the tests set it: App 99, installed on organization `acme` (installation 7), PR #5 of acme/sandbox. */
function fakeGitHub(): FakeGitHub {
  const state: FakeGitHub = {
    tokenLifetimeMs: 60 * 60 * 1000,
    minted: [],
    calls: [],
  };
  const installation = {
    id: 7,
    account: { login: 'acme' },
    target_type: 'Organization',
    permissions: { ...REQUIRED_APP_PERMISSIONS },
    events: ['pull_request'],
  };
  const pull = {
    number: 5,
    title: 'Thêm trường mới',
    html_url: 'https://github.test/acme/sandbox/pull/5',
    state: 'open',
    merged: false,
    draft: false,
    head: { ref: 'agent/none', sha: 'head-sha-1' },
    base: { ref: 'main' },
    mergeable_state: 'clean',
    merged_at: null,
    merge_commit_sha: null,
    closed_at: null,
    user: { login: 'agent-bot' },
    updated_at: new Date().toISOString(),
  };
  const original = globalThis.fetch;
  vi.stubGlobal(
    'fetch',
    async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(
        typeof input === 'string' || input instanceof URL ? input : input.url,
      );
      if (!url.href.startsWith(API)) return original(input, init);
      const method = init?.method ?? 'GET';
      const path = url.pathname.slice('/api'.length);
      state.calls.push({ method, path });
      const auth = new Headers(init?.headers).get('authorization') ?? '';
      const answer = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), {
          status,
          headers: { 'content-type': 'application/json' },
        });
      if (method === 'POST' && path === `/app-manifests/${CODE}/conversions`)
        return auth
          ? answer({ message: 'No credentials here' }, 400)
          : answer(
              {
                id: 99,
                slug: 'ds-studio-test',
                name: 'Duong Sinh Studio',
                html_url: 'https://github.test/apps/ds-studio-test',
                owner: { login: 'acme' },
                pem: PRIVATE_KEY,
                webhook_secret: WEBHOOK_SECRET,
                permissions: { ...REQUIRED_APP_PERMISSIONS },
                events: ['pull_request'],
              },
              201,
            );
      if (path.startsWith('/app/')) {
        if (!validJwt(auth.replace(/^Bearer /u, '')))
          return answer(
            { message: 'A JSON web token could not be decoded' },
            401,
          );
        if (method === 'GET' && path === '/app/installations')
          return answer([installation]);
        if (method === 'GET' && path === '/app/installations/7')
          return answer(installation);
        if (
          method === 'POST' &&
          path === '/app/installations/7/access_tokens'
        ) {
          const body =
            typeof init?.body === 'string'
              ? (JSON.parse(init.body) as { repositories?: string[] })
              : {};
          state.minted.push({ repositories: body.repositories ?? null });
          return answer(
            {
              token: `ghs_installation_${state.minted.length}`,
              expires_at: new Date(
                Date.now() + state.tokenLifetimeMs,
              ).toISOString(),
            },
            201,
          );
        }
        return answer({ message: 'Not Found' }, 404);
      }
      if (!auth.startsWith('Bearer ghs_installation_'))
        return answer({ message: 'Bad credentials' }, 401);
      const repo = '/repos/acme/sandbox';
      if (method === 'GET' && path === repo)
        return answer({
          id: 42,
          full_name: 'acme/sandbox',
          default_branch: 'main',
          clone_url: CLONE_URL,
          html_url: 'https://github.test/acme/sandbox',
        });
      if (method === 'GET' && path === `${repo}/pulls`)
        return answer(url.searchParams.get('state') === 'open' ? [pull] : []);
      if (method === 'GET' && path === `${repo}/pulls/5`) return answer(pull);
      if (method === 'GET' && path === `${repo}/commits/head-sha-1/check-runs`)
        return answer({
          check_runs: [
            {
              name: 'verify',
              status: 'completed',
              conclusion: 'success',
              html_url: 'https://github.test/acme/sandbox/runs/1',
            },
          ],
        });
      if (method === 'GET' && path === `${repo}/commits/head-sha-1/status`)
        return answer({ state: 'success', statuses: [] });
      // One release tag, for the push webhook (S5.5).
      if (method === 'GET' && path === `${repo}/tags`)
        return answer([{ name: 'v2026.11.0', commit: { sha: 'tag-sha-1' } }]);
      if (method === 'GET' && path === `${repo}/commits/tag-sha-1`)
        return answer({
          sha: 'tag-sha-1',
          commit: { committer: { date: '2026-11-03T00:00:00Z' } },
        });
      return answer({ message: 'Not Found' }, 404);
    },
  );
  return state;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

test('GitHub App pieces: manifest, JWT, signatures and missing permissions', () => {
  const manifest = appManifest({
    name: 'Duong Sinh Studio',
    baseUrl: 'https://studio.example.test/main/',
    connectionId: 'c-1',
  });
  expect(manifest).toMatchObject({
    public: false,
    redirect_url: 'https://studio.example.test/main/settings/git',
    setup_url: 'https://studio.example.test/main/settings/git?githubApp=c-1',
    hook_attributes: {
      url: 'https://studio.example.test/main/api/webhooks/github/connections/c-1',
      active: true,
    },
    default_permissions: REQUIRED_APP_PERMISSIONS,
  });
  expect(manifest.default_events).toEqual(
    expect.arrayContaining([
      'pull_request',
      'check_run',
      'workflow_run',
      'pull_request_review',
      'pull_request_review_comment',
    ]),
  );

  const jwt = appJwt('99', PRIVATE_KEY);
  expect(validJwt(jwt)).toBe(true);
  // Issued a minute back for clock drift, valid at most ten minutes.
  const claims = JSON.parse(
    Buffer.from(jwt.split('.')[1], 'base64url').toString(),
  ) as { iat: number; exp: number };
  expect(claims.exp - claims.iat).toBeLessThanOrEqual(600);

  const body = new TextEncoder().encode('{"zen":"Keep it logically awesome."}');
  const signature = `sha256=${createHmac('sha256', 'secret').update(body).digest('hex')}`;
  expect(verifySignature('secret', body, signature)).toBe(true);
  expect(verifySignature('other', body, signature)).toBe(false);
  expect(verifySignature('secret', body, null)).toBe(false);
  expect(verifySignature('secret', body, 'sha1=abc')).toBe(false);

  expect(missingPermissions({ ...REQUIRED_APP_PERMISSIONS })).toEqual([]);
  expect(
    missingPermissions({ ...REQUIRED_APP_PERMISSIONS, contents: 'read' }),
  ).toEqual(['contents:write']);
  expect(missingPermissions({ contents: 'admin' })).toEqual(
    expect.arrayContaining(['pull_requests:write', 'checks:write']),
  );
});

test('a GitHub App connection: manifest flow, installation, tokens, webhooks and run credentials', async ({
  testApp,
  app,
  connection,
  request,
}) => {
  const github = fakeGitHub();
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);

  // Only an administrator starts making an App.
  expect(
    (
      await admin.fetch(
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
  expect(
    (
      await contributor.fetch(
        '/git/connections/startAppManifest',
        json({ apiBaseUrl: API }),
      )
    ).status,
  ).toBe(403);

  const started = await admin.fetch(
    '/git/connections/startAppManifest',
    json({ apiBaseUrl: API }),
  );
  expect(started.status).toBe(201);
  const start = (await started.json()).data as {
    connectionId: string;
    postUrl: string;
    manifest: { hook_attributes: { url: string }; redirect_url: string };
  };
  expect(start.postUrl).toMatch(
    /^https:\/\/github\.test\/settings\/apps\/new\?state=[0-9a-f]{48}$/u,
  );
  // The webhook and the redirect point at the configured public origin, never at the request's host.
  expect(start.manifest.hook_attributes.url).toMatch(
    new RegExp(
      `^http://localhost(/[\\w-]+)?/api/webhooks/github/connections/${start.connectionId}$`,
      'u',
    ),
  );
  const state = new URL(start.postUrl).searchParams.get('state') ?? '';

  // GitHub sends the person back with a code: a wrong state is refused, the right one works once.
  expect(
    (
      await admin.fetch(
        '/git/connections/appManifest/complete',
        json({ code: CODE, state: 'f'.repeat(48) }),
      )
    ).status,
  ).toBe(400);
  const completed = await admin.fetch(
    '/git/connections/appManifest/complete',
    json({ code: CODE, state }),
  );
  expect(completed.status).toBe(201);
  const completedText = await completed.text();
  expect(completedText).not.toContain('PRIVATE KEY');
  expect(completedText).not.toContain(WEBHOOK_SECRET);
  const appConnection = JSON.parse(completedText).data as {
    id: string;
    kind: string;
    problems: string[];
    app: { installationId: string | null; installUrl: string };
  };
  expect(appConnection).toMatchObject({
    id: start.connectionId,
    kind: 'app',
    problems: ['appNotInstalled'],
    app: {
      installationId: null,
      installUrl: 'https://github.test/apps/ds-studio-test/installations/new',
    },
  });
  expect(
    (
      await admin.fetch(
        '/git/connections/appManifest/complete',
        json({ code: CODE, state }),
      )
    ).status,
  ).toBe(400);
  const sealed = await connection.query
    .selectFrom('dsGitApps')
    .select(['privateKeySealed', 'webhookSecretSealed'])
    .where('connectionId', '=', appConnection.id)
    .executeTakeFirst();
  expect(String(sealed?.privateKeySealed)).not.toContain('PRIVATE KEY');
  expect(String(sealed?.webhookSecretSealed)).not.toContain(WEBHOOK_SECRET);

  // Installed on GitHub: Studio records the App's only installation, read with a JWT signed by its key.
  const installed = await admin.fetch(
    `/git/connections/${appConnection.id}/installation`,
    json({}),
  );
  expect(installed.status).toBe(200);
  expect((await installed.json()).data).toMatchObject({
    problems: [],
    webhooks: true,
    app: {
      installationId: '7',
      installationAccount: 'acme',
      permissionsUrl:
        'https://github.test/organizations/acme/settings/installations/7',
      missingPermissions: [],
    },
  });

  // Linking a repository goes through an installation token, minted once and then reused from the cache.
  const linked = await admin.fetch(
    '/git/repositories',
    json({ connectionId: appConnection.id, repo: 'acme/sandbox' }),
  );
  expect(linked.status).toBe(201);
  const repository = (await linked.json()).data as { id: string };
  const git = app.container.resolve(gitServiceToken);
  await git.syncRepository(repository.id);
  expect(github.minted).toEqual([{ repositories: null }]);

  // Webhooks: no signature, a wrong one or an unknown connection are all 401, and nothing is read.
  const deliver = (
    event: string,
    payload: unknown,
    options: { id?: string; secret?: string; connectionId?: string } = {},
  ) => {
    const body = JSON.stringify(payload);
    return request(
      `/webhooks/github/connections/${options.connectionId ?? appConnection.id}`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-github-event': event,
          'x-github-delivery': options.id ?? randomUUID(),
          'x-hub-signature-256': `sha256=${createHmac(
            'sha256',
            options.secret ?? WEBHOOK_SECRET,
          )
            .update(body)
            .digest('hex')}`,
        },
        body,
      },
    );
  };
  const pullPayload = {
    action: 'synchronize',
    number: 5,
    pull_request: { number: 5 },
    repository: { full_name: 'acme/sandbox' },
  };
  const unsigned = await request(
    `/webhooks/github/connections/${appConnection.id}`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-github-event': 'pull_request',
        'x-github-delivery': randomUUID(),
      },
      body: JSON.stringify(pullPayload),
    },
  );
  expect(unsigned.status).toBe(401);
  expect(
    (await deliver('pull_request', pullPayload, { secret: 'wrong' })).status,
  ).toBe(401);
  expect(
    (
      await deliver('pull_request', pullPayload, {
        connectionId: randomUUID(),
      })
    ).status,
  ).toBe(401);

  // A review delivery reaches the review listeners (the reaction rules, plan T T1.3) and refreshes nothing.
  const heard: string[] = [];
  const stopListening = git.onReviewEvent(async (repositoryId, event, body) => {
    heard.push(
      `${repositoryId === repository.id}:${event}:${String(body.action)}`,
    );
  });
  const reviewed = await deliver('pull_request_review', {
    action: 'submitted',
    review: { id: 1, state: 'changes_requested' },
    pull_request: { number: 5 },
    repository: { full_name: 'acme/sandbox' },
  });
  expect(reviewed.status).toBe(202);
  expect(heard).toEqual(['true:pull_request_review:submitted']);
  stopListening();

  // A signed delivery refreshes the pull request at once; the same delivery again is not handled twice.
  await connection.query
    .deleteFrom('dsPullRequests')
    .where('repositoryId', '=', repository.id)
    .execute();
  const readsBefore = github.calls.filter(
    (call) => call.path === '/repos/acme/sandbox/pulls/5',
  ).length;
  const deliveryId = randomUUID();
  const handled = await deliver('pull_request', pullPayload, {
    id: deliveryId,
  });
  expect(handled.status).toBe(202);
  expect((await handled.json()).data).toEqual({
    handled: 'pull_request.refreshed',
    duplicate: false,
  });
  const stored = await connection.query
    .selectFrom('dsPullRequests')
    .select(['number', 'ciState'])
    .execute();
  expect(stored).toEqual([{ number: 5, ciState: 'passed' }]);
  const replayed = await deliver('pull_request', pullPayload, {
    id: deliveryId,
  });
  expect(replayed.status).toBe(200);
  expect((await replayed.json()).data.duplicate).toBe(true);
  expect(
    github.calls.filter((call) => call.path === '/repos/acme/sandbox/pulls/5')
      .length,
  ).toBe(readsBefore + 1);

  // A check of the pull request's head refreshes it too.
  const checked = await deliver('check_run', {
    action: 'completed',
    check_run: { head_sha: 'head-sha-1', pull_requests: [] },
    repository: { full_name: 'acme/sandbox' },
  });
  expect((await checked.json()).data.handled).toBe('check_run.refreshed');
  // An unlinked repository is acknowledged and left alone.
  const unlinked = await deliver('pull_request', {
    ...pullPayload,
    repository: { full_name: 'acme/other' },
  });
  expect((await unlinked.json()).data.handled).toBe('pull_request.unlinked');

  // A pushed tag is read at once into a version (S5.5); a pushed branch is not a release.
  const branchPush = await deliver('push', {
    ref: 'refs/heads/main',
    repository: { full_name: 'acme/sandbox' },
  });
  expect((await branchPush.json()).data.handled).toBe('push.ignored');
  const tagPush = await deliver('push', {
    ref: 'refs/tags/v2026.11.0',
    repository: { full_name: 'acme/sandbox' },
  });
  expect((await tagPush.json()).data.handled).toBe('push.tags');
  expect(
    await connection.query
      .selectFrom('dsVersions')
      .select(['tag', 'sha'])
      .where('repositoryId', '=', repository.id)
      .execute(),
  ).toEqual([{ tag: 'v2026.11.0', sha: 'tag-sha-1' }]);

  // The connection says how its webhook does; with deliveries coming in, its repositories are polled only every 10 min.
  const view = (
    await (await admin.fetch(`/git/connections/${appConnection.id}`)).json()
  ).data as { app: { lastDeliveryAt: string | null; lastEvent: string } };
  expect(view.app.lastDeliveryAt).not.toBeNull();
  expect(view.app.lastEvent).toBe('push');
  expect(
    (await git.pollIntervals(new Date())).get(repository.id)?.seconds,
  ).toBe(600);

  // Runs: the provider mints, before the claim, an installation token limited to the project's repository.
  const project = (
    await (await admin.fetch('/projects', json({ name: 'Sandbox' }))).json()
  ).data as { id: string };
  expect(
    (
      await admin.fetch(
        `/projects/${project.id}/codeLocations`,
        json({ repositoryId: repository.id }),
      )
    ).status,
  ).toBe(201);
  const issue = (
    await (
      await admin.fetch(
        '/projects/issues',
        json({ title: 'App issue', projectId: project.id }),
      )
    ).json()
  ).data as { id: string };
  const provider = app.container
    .resolve(agentsToken)
    .repoAccess.list()
    .find((candidate) => candidate.key === 'duongsinh-studio/github-token');
  expect(provider?.prepare).toBeDefined();
  const run = { subject: { kind: 'issue', id: issue.id } } as unknown as Run;
  const prepared = await provider?.prepare?.(run, {
    onDemand: false,
    tools: false,
    responsibleUserId: null,
  });
  expect(github.minted.at(-1)).toEqual({ repositories: ['sandbox'] });
  const credentials = await git.credentialsFor(
    connection,
    project.id,
    [CLONE_URL],
    prepared as ReadonlyMap<string, { token: string; expiresAt: string }>,
  );
  expect(credentials).toEqual([
    expect.objectContaining({
      url: CLONE_URL,
      token: `ghs_installation_${github.minted.length}`,
      expiresAt: expect.any(String),
    }),
  ]);
  // Without a prepared token the App repository is left out, unless the runner asks on demand.
  expect(await git.credentialsFor(connection, project.id, [CLONE_URL])).toEqual(
    [],
  );
  expect(
    await git.credentialsFor(
      connection,
      project.id,
      [CLONE_URL],
      undefined,
      true,
    ),
  ).toEqual([expect.objectContaining({ url: CLONE_URL, token: '' })]);
  // On demand, `refresh` mints a new token rather than the cached one.
  const before = github.minted.length;
  await git.appCredentialsFor(project.id, [CLONE_URL]);
  expect(github.minted.length).toBe(before);
  await git.appCredentialsFor(project.id, [CLONE_URL], true);
  expect(github.minted.length).toBe(before + 1);

  // A token with less than five minutes left is minted again.
  github.tokenLifetimeMs = 2 * 60 * 1000;
  await git.appCredentialsFor(project.id, [CLONE_URL], true);
  await git.appCredentialsFor(project.id, [CLONE_URL]);
  expect(github.minted.length).toBe(before + 3);

  // Uninstalled on GitHub: the connection forgets its installation.
  const removed = await deliver('installation', {
    action: 'deleted',
    installation: { id: 7, account: { login: 'acme' } },
  });
  expect((await removed.json()).data.handled).toBe('installation.deleted');
  expect(
    (await (await admin.fetch(`/git/connections/${appConnection.id}`)).json())
      .data.app.installationId,
  ).toBeNull();
});
