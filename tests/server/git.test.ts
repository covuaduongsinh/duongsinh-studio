// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { afterEach, expect, vi } from 'vitest';
import { createAppTest } from '@nocobase/app-testing/server';
import {
  signIn,
  DEFAULT_ADMIN_CREDENTIALS,
} from '@nocobase/app-plugin-authentication/testing';
import { agentsToken } from '@nocobase/app-plugin-agents/server/tokens';
import { createStandaloneServer } from '../../server/standalone.js';
import { CONTRIBUTOR_SET_KEY } from '../../server/access/roles.js';
import { DEFAULT_AGENT_ACTIONS } from '../../server/agents/actions.js';
import { AGENT_KIND } from '../../server/agents/ids.js';
import { gitServiceToken } from '../../server/providers/git.js';

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
const TOKEN = 'ghp_test_token_never_returned';
const CLONE_URL = 'https://github.test/acme/sandbox.git';
const PASSWORD = 'Studio-test-123!';
const MODEL = 'claude-sonnet-4-5';
/** The runner protocol this agents plugin speaks (`PROTOCOL_VERSION` of `@nocobase/agent-protocol`). */
const PROTOCOL_VERSION = 14;

const json = (body: unknown, method = 'POST') => ({
  method,
  headers: {
    'content-type': 'application/json',
    origin: 'http://localhost',
    'Idempotency-Key': `${Date.now()}.${randomUUID()}`,
  },
  body: JSON.stringify(body),
});

/** GitHub as the tests set it: one repository with pull request #5. */
interface FakeGitHub {
  headRef: string;
  checks: 'pending' | 'failure' | 'success';
  merged: boolean;
  calls: { method: string; path: string; body: unknown; auth: string | null }[];
}

function fakeGitHub(): FakeGitHub {
  const state: FakeGitHub = {
    headRef: 'agent/none',
    checks: 'pending',
    merged: false,
    calls: [],
  };
  const pull = () => ({
    number: 5,
    title: 'Thêm trường mới',
    html_url: 'https://github.test/acme/sandbox/pull/5',
    state: state.merged ? 'closed' : 'open',
    merged: state.merged,
    draft: false,
    head: { ref: state.headRef, sha: 'head-sha-1' },
    base: { ref: 'main' },
    mergeable_state: 'clean',
    merged_at: state.merged ? new Date().toISOString() : null,
    merge_commit_sha: state.merged ? 'merge-sha-1' : null,
    closed_at: state.merged ? new Date().toISOString() : null,
    user: { login: 'agent-bot' },
    updated_at: new Date().toISOString(),
  });
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
      const headers = new Headers(init?.headers);
      state.calls.push({
        method,
        path: `${path}${url.search}`,
        body: typeof init?.body === 'string' ? JSON.parse(init.body) : null,
        auth: headers.get('authorization'),
      });
      const answer = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), {
          status,
          headers: { 'content-type': 'application/json' },
        });
      if (headers.get('authorization') !== `Bearer ${TOKEN}`)
        return answer({ message: 'Bad credentials' }, 401);
      const repo = '/repos/acme/sandbox';
      if (method === 'GET' && path === '/user')
        return answer({ login: 'ds-bot' });
      if (method === 'GET' && path === repo)
        return answer({
          id: 42,
          full_name: 'acme/sandbox',
          default_branch: 'main',
          clone_url: CLONE_URL,
          html_url: 'https://github.test/acme/sandbox',
          permissions: { push: true },
        });
      if (method === 'GET' && path === `${repo}/pulls`)
        return answer(
          url.searchParams.get('state') === 'open' && !state.merged
            ? [pull()]
            : [],
        );
      if (method === 'GET' && path === `${repo}/pulls/5`) return answer(pull());
      if (method === 'GET' && path === `${repo}/commits/head-sha-1/check-runs`)
        return answer({
          check_runs: [
            {
              name: 'verify',
              status: state.checks === 'pending' ? 'in_progress' : 'completed',
              conclusion: state.checks === 'pending' ? null : state.checks,
              html_url: 'https://github.test/acme/sandbox/runs/1',
            },
          ],
        });
      if (method === 'GET' && path === `${repo}/commits/head-sha-1/status`)
        return answer({ state: 'success', statuses: [] });
      if (method === 'PUT' && path === `${repo}/pulls/5/merge`) {
        state.merged = true;
        return answer({ merged: true, sha: 'merge-sha-1' });
      }
      if (method === 'POST' && path === `${repo}/issues/5/comments`)
        return answer({ id: 1 }, 201);
      return answer({ message: 'Not Found' }, 404);
    },
  );
  return state;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

interface PullRequest {
  id: string;
  issueId: string | null;
  state: string;
  ciState: string | null;
  mergeBlocker: string | null;
  linkedBy: string | null;
}

test('git connections, repositories, pull request sync, merge and run credentials', async ({
  testApp,
  app,
  connection,
  request,
}) => {
  const github = fakeGitHub();
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const ownerId = (
    (await (await admin.fetch('/access/me')).json()).data as { userId: string }
  ).userId;

  // Anonymous callers get nothing; a contributor may not manage connections.
  expect((await request('/git/connections')).status).toBe(401);
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
        '/git/connections',
        json({ name: 'Nope', token: TOKEN, apiBaseUrl: API }),
      )
    ).status,
  ).toBe(403);
  expect((await contributor.fetch('/git/connections')).status).toBe(403);

  // An administrator connects GitHub with a token: it is checked on GitHub, sealed, and never answered.
  const created = await admin.fetch(
    '/git/connections',
    json({ name: 'GitHub', token: TOKEN, apiBaseUrl: API }),
  );
  expect(created.status).toBe(201);
  const createdText = await created.text();
  expect(createdText).not.toContain(TOKEN);
  const gitConnection = JSON.parse(createdText).data as {
    id: string;
    hasToken: boolean;
    account: string;
  };
  expect(gitConnection).toMatchObject({ hasToken: true, account: 'ds-bot' });
  const listed = await (await admin.fetch('/git/connections')).text();
  expect(listed).toContain(gitConnection.id);
  expect(listed).not.toContain(TOKEN);
  const sealed = await connection.query
    .selectFrom('dsGitConnections')
    .select(['tokenSealed'])
    .where('id', '=', gitConnection.id)
    .executeTakeFirst();
  expect(String(sealed?.tokenSealed)).not.toContain(TOKEN);

  // Linking a repository asks GitHub whether the token reaches it.
  const linked = await admin.fetch(
    '/git/repositories',
    json({ connectionId: gitConnection.id, repo: 'acme/sandbox' }),
  );
  expect(linked.status).toBe(201);
  const repository = (await linked.json()).data as {
    id: string;
    cloneUrl: string;
    branchPrefix: string;
  };
  expect(repository).toMatchObject({
    cloneUrl: CLONE_URL,
    branchPrefix: 'agent/',
  });
  expect(
    github.calls.some(
      (call) => call.method === 'GET' && call.path === '/repos/acme/sandbox',
    ),
  ).toBe(true);
  expect(
    (
      await contributor.fetch(
        '/git/repositories',
        json({ connectionId: gitConnection.id, repo: 'acme/other' }),
      )
    ).status,
  ).toBe(403);

  // The repository becomes the project's working directory.
  const project = (
    await (await admin.fetch('/projects', json({ name: 'Sandbox' }))).json()
  ).data as { id: string };
  const attached = await admin.fetch(
    `/projects/${project.id}/codeLocations`,
    json({ repositoryId: repository.id }),
  );
  expect(attached.status).toBe(201);
  expect((await attached.json()).data.projects).toEqual([
    { projectId: project.id, isPrimary: true },
  ]);
  const detail = (await (await admin.fetch(`/projects/${project.id}`)).json())
    .data as { resources: { url: string; binding: { repoId: string } }[] };
  expect(detail.resources).toEqual([
    expect.objectContaining({
      url: CLONE_URL,
      binding: expect.objectContaining({ repoId: repository.id }),
    }),
  ]);

  // An agent works on an issue of the project: its run checks the repository out with the connection's token.
  const agents = app.container.resolve(agentsToken);
  const coder = await agents.agents.ensureSystem({
    id: 'ds-test-git-coder',
    name: 'Git coder',
    description: 'Implements small changes.',
    instructions: null,
    actions: [...DEFAULT_AGENT_ACTIONS],
    modelEntries: [{ tool: 'claude', model: MODEL }],
  });
  const issueResponse = await admin.fetch(
    '/projects/issues',
    json({
      title: 'Git issue',
      projectId: project.id,
      statusKey: 'in_progress',
      executor: { type: AGENT_KIND, id: coder.id },
    }),
  );
  expect(issueResponse.status).toBe(201);
  const issue = (await issueResponse.json()).data as {
    id: string;
    identifier: string;
  };
  const registration = await agents.runners.createRegistrationToken(ownerId, {
    trust: 'ownerOnly',
  });
  const registered = await agents.runners.register({
    registrationToken: registration.token,
    name: 'git-runner',
    hostname: 'test-host',
    os: 'linux',
    arch: 'x64',
    version: '0.0.0-test',
    protocolVersion: PROTOCOL_VERSION,
    features: ['input', 'workspaceKey', 'checkout', 'skills'],
    tools: [
      {
        kind: 'claude',
        authenticated: true,
        status: 'ready',
        models: [{ id: MODEL }],
      },
    ],
  });
  const runner = await agents.runners.authenticate(registered.runnerKey);
  const payloads = await agents.claims.claim(runner, 1);
  expect(payloads).toHaveLength(1);
  const workspace = payloads[0].workspace;
  expect(workspace.dirs).toEqual([
    expect.objectContaining({
      kind: 'repo',
      url: CLONE_URL,
      branch: `agent/${issue.identifier}`,
    }),
  ]);
  expect(workspace.git?.credentials).toEqual([
    {
      url: CLONE_URL,
      username: 'x-access-token',
      password: TOKEN,
      expiresAt: expect.any(String),
    },
  ]);
  expect(workspace.git?.author?.email).toBeTruthy();
  expect(workspace.git?.trailers?.[0]).toMatch(/^Co-Authored-By: Git coder </u);
  const runToken = String(payloads[0].cli.credential.content.token);

  // Sync links the pull request on `agent/<identifier>` to the issue and reads its checks.
  github.headRef = `agent/${issue.identifier}`;
  github.checks = 'pending';
  const git = app.container.resolve(gitServiceToken);
  await git.syncRepository(repository.id);
  const pulls = async (): Promise<PullRequest[]> =>
    (await (await admin.fetch(`/git/pullRequests?issueId=${issue.id}`)).json())
      .data as PullRequest[];
  const [pending] = await pulls();
  expect(pending).toMatchObject({
    issueId: issue.id,
    linkedBy: 'branch',
    state: 'open',
    ciState: 'pending',
    mergeBlocker: 'ciPending',
  });
  github.checks = 'failure';
  const refreshed = await admin.fetch(
    `/git/pullRequests/${pending.id}/refresh`,
    json({}),
  );
  expect(refreshed.status).toBe(200);
  expect((await refreshed.json()).data).toMatchObject({
    ciState: 'failure',
    mergeBlocker: 'ciFailed',
  });

  // A run reads its issue's pull requests but never merges; failed checks refuse the merge.
  const asRun = (path: string, init: RequestInit = {}) =>
    request(path, {
      ...init,
      headers: {
        ...(init.headers as Record<string, string> | undefined),
        'x-nocobase-run-token': runToken,
      },
    });
  const runRead = await asRun(`/git/pullRequests/${pending.id}`);
  expect(runRead.status).toBe(200);
  expect(
    (await asRun(`/git/pullRequests/${pending.id}/merge`, json({}))).status,
  ).toBe(403);
  const blocked = await admin.fetch(
    `/git/pullRequests/${pending.id}/merge`,
    json({}),
  );
  expect(blocked.status).toBe(400);
  expect((await blocked.json()).error).toMatchObject({
    reason: 'MERGE_BLOCKED',
    metadata: { mergeBlocker: 'ciFailed' },
  });
  expect(github.calls.some((call) => call.method === 'PUT')).toBe(false);
  // A contributor who neither owns the issue nor leads the project may not merge.
  expect([403, 404]).toContain(
    (await contributor.fetch(`/git/pullRequests/${pending.id}/merge`, json({})))
      .status,
  );

  // Passing checks: the pull request is squash-merged and the issue says so. An issue without `autoCompleteOnMerge`
  // does not finish on a merge: it goes on (`in_progress`) so its people decide.
  github.checks = 'success';
  const merged = await admin.fetch(
    `/git/pullRequests/${pending.id}/merge`,
    json({}),
  );
  expect(merged.status).toBe(200);
  expect((await merged.json()).data).toMatchObject({
    state: 'merged',
    ciState: 'success',
    mergeBlocker: 'merged',
    mergedBy: { id: ownerId },
  });
  expect(
    github.calls.find((call) => call.method === 'PUT')?.body,
  ).toMatchObject({ merge_method: 'squash', sha: 'head-sha-1' });
  const after = (
    await (await admin.fetch(`/projects/issues/${issue.id}`)).json()
  ).data as { statusKey?: string; issue?: { statusKey: string } };
  expect(after.issue?.statusKey ?? after.statusKey).toBe('in_progress');
  const threads = (
    await (await admin.fetch(`/projects/issues/${issue.id}/comments`)).json()
  ).data as { root: { content: string } }[];
  expect(
    threads.some((thread) =>
      thread.root.content.includes('acme/sandbox#5 đã được merge'),
    ),
  ).toBe(true);

  // Nothing any route answered carries the token.
  for (const path of [
    '/git/connections',
    `/git/connections/${gitConnection.id}`,
    '/git/repositories',
    `/git/pullRequests?issueId=${issue.id}`,
  ])
    expect(await (await admin.fetch(path)).text()).not.toContain(TOKEN);
  // Booting a fresh application on SQLite takes most of a minute on the development machine.
}, 240_000);
