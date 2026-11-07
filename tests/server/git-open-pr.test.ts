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
import {
  DEFAULT_AGENT_ACTIONS,
  OPEN_PR_ACTION,
} from '../../server/agents/actions.js';
import { AGENT_KIND } from '../../server/agents/ids.js';

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

interface FakePull {
  number: number;
  title: string;
  body: string;
  head: string;
  base: string;
  draft: boolean;
}

/** GitHub as the tests set it: `acme/sandbox`, where pull requests can be opened. */
function fakeGitHub() {
  const pulls: FakePull[] = [];
  const created: unknown[] = [];
  // A token without "Checks: Read" gets 403 on check runs (seen live on the sandbox, 02/11/2026).
  const state = { checksForbidden: false, actionsForbidden: false };
  const original = globalThis.fetch;
  const answer = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  const pullJson = (pull: FakePull) => ({
    number: pull.number,
    title: pull.title,
    html_url: `https://github.test/acme/sandbox/pull/${pull.number}`,
    state: 'open',
    merged: false,
    draft: pull.draft,
    head: { ref: pull.head, sha: `sha-${pull.number}` },
    base: { ref: pull.base },
    mergeable_state: 'clean',
    merged_at: null,
    merge_commit_sha: null,
    closed_at: null,
    user: { login: 'ds-bot' },
    updated_at: new Date().toISOString(),
  });
  vi.stubGlobal(
    'fetch',
    async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(
        typeof input === 'string' || input instanceof URL ? input : input.url,
      );
      if (!url.href.startsWith(API)) return original(input, init);
      const method = init?.method ?? 'GET';
      const path = url.pathname.slice('/api'.length);
      if (new Headers(init?.headers).get('authorization') !== `Bearer ${TOKEN}`)
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
      if (method === 'GET' && path === `${repo}/pulls`) {
        const head = url.searchParams.get('head');
        return answer(
          pulls
            .filter((pull) => !head || `acme:${pull.head}` === head)
            .map(pullJson),
        );
      }
      if (method === 'POST' && path === `${repo}/pulls`) {
        const body = JSON.parse(String(init?.body)) as Omit<FakePull, 'number'>;
        created.push(body);
        if (pulls.some((pull) => pull.head === body.head))
          return answer({ message: 'A pull request already exists' }, 422);
        const pull = { ...body, number: 7 + pulls.length };
        pulls.push(pull);
        return answer(pullJson(pull), 201);
      }
      const single = /^\/repos\/acme\/sandbox\/pulls\/(\d+)$/u.exec(path);
      const found = single
        ? pulls.find((pull) => pull.number === Number(single[1]))
        : undefined;
      if (method === 'GET' && found) return answer(pullJson(found));
      if (method === 'GET' && /\/commits\/[^/]+\/check-runs$/u.test(path))
        return state.checksForbidden
          ? answer(
              { message: 'Resource not accessible by personal access token' },
              403,
            )
          : answer({ check_runs: [] });
      if (method === 'GET' && path === `${repo}/actions/runs`)
        return state.actionsForbidden
          ? answer(
              { message: 'Resource not accessible by personal access token' },
              403,
            )
          : answer({
              // Newest first, as GitHub lists them: the re-run passed after the first attempt failed.
              workflow_runs: [
                {
                  name: 'ci',
                  status: 'completed',
                  conclusion: 'success',
                  html_url: 'https://github.test/acme/sandbox/actions/runs/2',
                },
                {
                  name: 'ci',
                  status: 'completed',
                  conclusion: 'failure',
                  html_url: 'https://github.test/acme/sandbox/actions/runs/1',
                },
              ],
            });
      if (method === 'GET' && /\/commits\/[^/]+\/status$/u.test(path))
        return answer({ state: 'pending', statuses: [] });
      return answer({ message: 'Not Found' }, 404);
    },
  );
  return { pulls, created, state };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

test('an issue’s agent opens its pull request through Studio', async ({
  testApp,
  app,
  request,
}) => {
  const github = fakeGitHub();
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const ownerId = (
    (await (await admin.fetch('/access/me')).json()).data as { userId: string }
  ).userId;

  // GitHub connected, `acme/sandbox` linked and attached to the project as its primary repository.
  const gitConnection = (
    await (
      await admin.fetch(
        '/git/connections',
        json({ name: 'GitHub', token: TOKEN, apiBaseUrl: API }),
      )
    ).json()
  ).data as { id: string };
  const repository = (
    await (
      await admin.fetch(
        '/git/repositories',
        json({ connectionId: gitConnection.id, repo: 'acme/sandbox' }),
      )
    ).json()
  ).data as { id: string };
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

  // An agent with the default actions works on an issue of the project.
  expect(DEFAULT_AGENT_ACTIONS).toContain(OPEN_PR_ACTION);
  const agents = app.container.resolve(agentsToken);
  const coder = await agents.agents.ensureSystem({
    id: 'ds-test-pr-coder',
    name: 'PR coder',
    description: 'Implements small changes.',
    instructions: null,
    actions: [...DEFAULT_AGENT_ACTIONS],
    modelEntries: [{ tool: 'claude', model: MODEL }],
  });
  const issue = (
    await (
      await admin.fetch(
        '/projects/issues',
        json({
          title: 'PR issue',
          projectId: project.id,
          statusKey: 'in_progress',
          executor: { type: AGENT_KIND, id: coder.id },
        }),
      )
    ).json()
  ).data as { id: string; identifier: string };
  const registration = await agents.runners.createRegistrationToken(ownerId, {
    trust: 'ownerOnly',
  });
  const registered = await agents.runners.register({
    registrationToken: registration.token,
    name: 'pr-runner',
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
  const [payload] = await agents.claims.claim(runner, 1);
  expect(payload).toBeDefined();
  const runToken = String(payload.cli.credential.content.token);
  const asRun = (path: string, init: RequestInit = {}) =>
    request(path, {
      ...init,
      headers: {
        ...(init.headers as Record<string, string> | undefined),
        'x-nocobase-run-token': runToken,
      },
    });

  // The run's command manifest offers `pr open` and `pr list`.
  const manifestResponse = await asRun('/cli/manifest');
  expect(manifestResponse.status).toBe(200);
  const manifest = (await manifestResponse.json()).data as {
    identity: { actions: string[] };
    commands: { id: string }[];
  };
  expect(manifest.identity.actions).toContain(OPEN_PR_ACTION);
  const commandIds = manifest.commands.map((command) => command.id);
  expect(commandIds).toContain('pr:open');
  expect(commandIds).toContain('pr:list');
  expect(commandIds).not.toContain('pr:merge');

  // The run opens the pull request of `agent/<IDENTIFIER>` by the issue's identifier; it is linked to the issue at once.
  const opened = await asRun(
    '/git/pullRequests',
    json({
      issueId: issue.identifier,
      title: 'Add the toggle',
      body: '## Summary\n\nAdds the toggle.',
    }),
  );
  expect(opened.status).toBe(201);
  const pull = (await opened.json()).data as {
    id: string;
    number: number;
    issueId: string;
    headRef: string;
    baseRef: string;
    state: string;
    linkedBy: string;
  };
  expect(pull).toMatchObject({
    number: 7,
    issueId: issue.id,
    headRef: `agent/${issue.identifier}`,
    baseRef: 'main',
    state: 'open',
    linkedBy: 'opened',
  });
  expect(github.created).toEqual([
    {
      title: 'Add the toggle',
      head: `agent/${issue.identifier}`,
      base: 'main',
      body: '## Summary\n\nAdds the toggle.',
      draft: false,
    },
  ]);

  // Calling again answers the open pull request; GitHub is not asked to open another.
  const again = await asRun(
    '/git/pullRequests',
    json({ issueId: issue.id, title: 'Add the toggle' }),
  );
  expect(again.status).toBe(200);
  expect(((await again.json()).data as { id: string }).id).toBe(pull.id);
  expect(github.created).toHaveLength(1);

  // `pr list --issue <IDENTIFIER>` finds it, for the run and for people.
  const listed = (
    await (await asRun(`/git/pullRequests?issueId=${issue.identifier}`)).json()
  ).data as { id: string }[];
  expect(listed.map((item) => item.id)).toEqual([pull.id]);

  // Nothing was posted on the issue: the agent comments itself.
  const threads = (
    await (await admin.fetch(`/projects/issues/${issue.id}/comments`)).json()
  ).data as unknown[];
  expect(threads).toEqual([]);

  // A person who sees the issue but may not edit it gets 403.
  const role = await admin.fetch(
    '/access/roles',
    json({
      key: 'pr-reader',
      title: 'PR reader',
      pages: ['pm-issues'],
      abilities: { 'pm.issues/view': 'all', 'pm.issues/comment': 'all' },
    }),
  );
  expect(role.status).toBe(201);
  expect(
    (
      await admin.fetch(
        '/users',
        json({
          name: 'reader1',
          username: 'reader1',
          email: 'reader1@example.test',
          password: PASSWORD,
          roleScopes: { app: ['ds-pr-reader'] },
        }),
      )
    ).status,
  ).toBe(201);
  const reader = await signIn(testApp, {
    username: 'reader1',
    password: PASSWORD,
  });
  expect(
    (await (await reader.fetch(`/projects/issues/${issue.id}`)).json()).data,
  ).toBeTruthy();
  const refused = await reader.fetch(
    '/git/pullRequests',
    json({ issueId: issue.id, title: 'Not mine', head: 'feature/x' }),
  );
  expect(refused.status).toBe(403);
  expect(github.created).toHaveLength(1);

  // The administrator, who may edit it, opens one from another branch of the same project.
  const byPerson = await admin.fetch(
    '/git/pullRequests',
    json({
      issueId: issue.id,
      title: 'Follow-up',
      head: 'feature/follow-up',
      draft: true,
    }),
  );
  expect(byPerson.status).toBe(201);
  expect((await byPerson.json()).data).toMatchObject({
    number: 8,
    issueId: issue.id,
    headRef: 'feature/follow-up',
    draft: true,
  });

  // A fine-grained token cannot read check runs (no "Checks" permission exists for it): the CI comes from the commit's
  // GitHub Actions runs instead, each workflow's latest attempt.
  github.state.checksForbidden = true;
  const viaActions = await admin.fetch(
    '/git/pullRequests',
    json({ issueId: issue.id, title: 'Via Actions', head: 'feature/actions' }),
  );
  expect(viaActions.status).toBe(201);
  const actionsPull = (await viaActions.json()).data as {
    ciState: string | null;
    checks: { name: string }[];
  };
  expect(actionsPull.ciState).toBe('success');
  expect(actionsPull.checks.map((check) => check.name)).toEqual(['ci']);

  // A token that can read neither still opens and links the pull request; its CI reads as missing.
  github.state.actionsForbidden = true;
  const unreadable = await admin.fetch(
    '/git/pullRequests',
    json({ issueId: issue.id, title: 'No checks', head: 'feature/no-checks' }),
  );
  expect(unreadable.status).toBe(201);
  expect((await unreadable.json()).data).toMatchObject({
    issueId: issue.id,
    headRef: 'feature/no-checks',
    ciState: null,
  });
  // Booting a fresh application on SQLite takes most of a minute on the development machine.
}, 240_000);
