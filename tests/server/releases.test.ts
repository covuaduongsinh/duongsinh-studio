// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { afterEach, expect, vi } from 'vitest';
import { createAppTest } from '@nocobase/app-testing/server';
import {
  signIn,
  DEFAULT_ADMIN_CREDENTIALS,
} from '@nocobase/app-plugin-authentication/testing';
import { agentsToken } from '@nocobase/app-plugin-agents/server/tokens';
import { databaseManagerToken } from '@nocobase/db';
import { createStandaloneServer } from '../../server/standalone.js';
import {
  ADMIN_SET_KEY,
  CONTRIBUTOR_SET_KEY,
} from '../../server/access/roles.js';
import { DEFAULT_AGENT_ACTIONS } from '../../server/agents/actions.js';
import { AGENT_KIND } from '../../server/agents/ids.js';
import { patternToRegExp } from '../../server/releases/service.js';

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
const TOKEN = 'ghp_release_token_never_returned';
const PASSWORD = 'Studio-test-123!';
const MODEL = 'claude-sonnet-4-5';
const PROTOCOL_VERSION = 14;
const DAY = 24 * 60 * 60 * 1000;

const json = (body: unknown, method = 'POST') => ({
  method,
  headers: {
    'content-type': 'application/json',
    origin: 'http://localhost',
    'Idempotency-Key': `${Date.now()}.${randomUUID()}`,
  },
  body: JSON.stringify(body),
});

/**
 * GitHub as two tags of `main`: `v1.0` at t1, which reaches the merge commit m1, and `v1.1` at t2, which adds m2.
 * `tags` may be changed to delete one.
 */
function fakeGitHub(): {
  calls: string[];
  tags: { name: string; commit: { sha: string } }[];
} {
  const state = {
    calls: [] as string[],
    tags: [
      { name: 'v1.1', commit: { sha: 't2' } },
      { name: 'v1.0', commit: { sha: 't1' } },
      { name: 'nightly-1', commit: { sha: 't3' } },
    ],
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
      state.calls.push(`${method} ${path}`);
      const answer = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), {
          status,
          headers: { 'content-type': 'application/json' },
        });
      if (new Headers(init?.headers).get('authorization') !== `Bearer ${TOKEN}`)
        return answer({ message: 'Bad credentials' }, 401);
      const repo = '/repos/acme/sandbox';
      if (path === '/user') return answer({ login: 'ds-bot' });
      if (path === repo)
        return answer({
          id: 42,
          full_name: 'acme/sandbox',
          default_branch: 'main',
          clone_url: 'https://github.test/acme/sandbox.git',
          html_url: 'https://github.test/acme/sandbox',
          permissions: { push: true },
        });
      if (path === `${repo}/pulls`) return answer([]);
      if (path === `${repo}/tags`) return answer(state.tags);
      const commit = /^\/repos\/acme\/sandbox\/commits\/(t\d)$/u.exec(path);
      if (commit)
        return answer({
          sha: commit[1],
          commit: {
            committer: {
              date:
                commit[1] === 't1'
                  ? '2026-11-01T00:00:00Z'
                  : '2026-11-02T00:00:00Z',
            },
          },
        });
      const compare = /^\/repos\/acme\/sandbox\/compare\/(.+)\.\.\.(.+)$/u.exec(
        path,
      );
      if (compare) {
        const [, base, head] = compare;
        if (base === 't1' && head === 't2')
          return answer({
            status: 'ahead',
            ahead_by: 2,
            commits: [{ sha: 'm2' }, { sha: 'x9' }],
          });
        if (base === 'm1' && head === 't1')
          return answer({ status: 'ahead', ahead_by: 3, commits: [] });
        if (base === 'm2' && head === 't1')
          return answer({ status: 'behind', ahead_by: 0, commits: [] });
        return answer({ status: 'diverged', ahead_by: 0, commits: [] });
      }
      return answer({ message: 'Not Found' }, 404);
    },
  );
  return state;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

test('tag patterns', () => {
  expect(patternToRegExp('v*').test('v1.0')).toBe(true);
  expect(patternToRegExp('v*').test('nightly-1')).toBe(false);
  expect(patternToRegExp('release-?.x').test('release-2.x')).toBe(true);
  expect(patternToRegExp('v1.0').test('v1x0')).toBe(false);
});

test('versions from tags, where issues are, and who may mark staging and production', async ({
  testApp,
  app,
  request,
}) => {
  const github = fakeGitHub();
  const owner = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const ownerId = (
    (await (await owner.fetch('/access/me')).json()).data as { userId: string }
  ).userId;

  // The three environments are seeded: all recorded only, production protected.
  const environments = (
    await (await owner.fetch('/deploys/environments')).json()
  ).data as {
    key: string;
    protected: boolean;
    recordOnly: boolean;
  }[];
  expect(
    environments.map((env) => [env.key, env.protected, env.recordOnly]),
  ).toEqual([
    ['preview', false, true],
    ['staging', false, true],
    ['production', true, true],
  ]);

  const connection = (
    await (
      await owner.fetch(
        '/git/connections',
        json({ name: 'GitHub', token: TOKEN, apiBaseUrl: API }),
      )
    ).json()
  ).data as { id: string };
  const repository = (
    await (
      await owner.fetch(
        '/git/repositories',
        json({ connectionId: connection.id, repo: 'acme/sandbox' }),
      )
    ).json()
  ).data as { id: string };
  const project = (
    await (
      await owner.fetch(
        '/projects',
        json({ name: 'Sandbox', visibility: 'members' }),
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

  const newIssue = async (title: string) =>
    (
      await (
        await owner.fetch(
          '/projects/issues',
          json({ title, projectId: project.id }),
        )
      ).json()
    ).data as {
      id: string;
      identifier: string;
    };
  const first = await newIssue('Hàm newRating');
  const second = await newIssue('Hàm expectedScore');

  // Two pull requests merged into main: m1 (five days ago) and m2 (yesterday).
  const db = app.container.resolve(databaseManagerToken).connection();
  const pull = (
    number: number,
    issueId: string,
    sha: string,
    mergedAt: Date,
  ) => ({
    id: randomUUID(),
    repositoryId: repository.id,
    number,
    issueId,
    linkedBy: 'branch',
    headBranch: `agent/${number}`,
    headSha: `h${number}`,
    baseBranch: 'main',
    state: 'merged',
    draft: false,
    title: `PR ${number}`,
    url: `https://github.test/acme/sandbox/pull/${number}`,
    authorLogin: 'bot',
    mergeability: 'unknown',
    hostMergeState: null,
    ciState: 'passed',
    checks: JSON.stringify([]),
    mergeCommitSha: sha,
    mergedAt,
    mergedById: null,
    mergeForcedReason: null,
    closedAt: mergedAt,
    snapshotAt: mergedAt,
    createdAt: mergedAt,
    updatedAt: mergedAt,
  });
  await db.query
    .insertInto('dsPullRequests')
    .values([
      pull(1, first.id, 'm1', new Date(Date.now() - 5 * DAY)),
      pull(2, second.id, 'm2', new Date(Date.now() - DAY)),
    ])
    .execute();

  // Reading the tags: only `v*` are versions, newest first; v1.0 brings the first issue, v1.1 the second.
  const sync = await owner.fetch(
    `/deploys/repositories/${repository.id}/sync`,
    json({}),
  );
  expect(sync.status).toBe(200);
  expect((await sync.json()).data).toEqual({
    added: ['v1.1', 'v1.0'],
    deleted: [],
  });
  const versions = async (who = owner) =>
    (
      await (
        await who.fetch(`/deploys/versions?projectId=${project.id}`)
      ).json()
    ).data as {
      id: string;
      tag: string;
      version: string;
      taskCount: number;
      issueIds: string[];
      deleted: boolean;
      current: { staging: boolean; production: boolean };
    }[];
  const [v11, v10] = await versions();
  expect(v11).toMatchObject({
    tag: 'v1.1',
    version: '1.1',
    taskCount: 1,
    issueIds: [second.id],
  });
  expect(v10).toMatchObject({
    tag: 'v1.0',
    version: '1.0',
    taskCount: 1,
    issueIds: [first.id],
  });

  const where = async () =>
    Object.fromEntries(
      (
        (
          await (
            await owner.fetch(
              `/deploys/marks?issueIds=${first.id},${second.id}`,
            )
          ).json()
        ).data as {
          issueId: string;
          where: string;
        }[]
      ).map((mark) => [mark.issueId, mark.where]),
    );
  expect(await where()).toEqual({
    [first.id]: 'released',
    [second.id]: 'released',
  });
  const pending = (await (await owner.fetch('/deploys/pending')).json())
    .data as {
    issue: { identifier: string };
  }[];
  expect(pending.map((mark) => mark.issue.identifier)).toEqual([
    first.identifier,
    second.identifier,
  ]);

  // Users: an administrator and a contributor outside the members-only project.
  const createUser = async (name: string, set: string) =>
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
  await createUser('admin1', ADMIN_SET_KEY);
  await createUser('contributor1', CONTRIBUTOR_SET_KEY);
  const admin = await signIn(testApp, {
    username: 'admin1',
    password: PASSWORD,
  });
  const contributor = await signIn(testApp, {
    username: 'contributor1',
    password: PASSWORD,
  });
  expect(await versions(contributor)).toEqual([]);

  // The demo's contract over the same records: a version with its issues and counts, and who sees it.
  for (const path of [
    `/deploys/versions/${v10.id}`,
    `/deploys/versions/${v10.id}/tasks`,
    `/deploys/versions/${v10.id}/deployments`,
    `/deploys/releaseLines/${repository.id}`,
    `/deploys/deploymentRecords`,
    `/deploys/hubCounts`,
    `/deploys/unreleasedTasks`,
    `/deploys/pendingVersionTasks`,
    `/deploys/versionProgress?issueIds=${first.id}`,
    `/deploys/projects/${project.id}/unreleasedIssues`,
    `/previews/status?issueId=${first.id}`,
  ])
    expect((await request(path)).status).toBe(401);
  const detail = (
    await (await owner.fetch(`/deploys/versions/${v10.id}`)).json()
  ).data as { tag: string; deploymentCount: number };
  expect(detail).toMatchObject({ tag: 'v1.0', deploymentCount: 0 });
  expect((await contributor.fetch(`/deploys/versions/${v10.id}`)).status).toBe(
    404,
  );
  const tasks = (await (
    await owner.fetch(`/deploys/versions/${v10.id}/tasks`)
  ).json()) as {
    data: { id: string; where: string; published: number }[];
    meta: { total: number };
  };
  expect(tasks.meta.total).toBe(1);
  expect(tasks.data[0]).toMatchObject({
    id: first.id,
    where: 'released',
    published: 1,
  });
  expect(
    (await (await owner.fetch('/deploys/hubCounts')).json()).data,
  ).toMatchObject({
    tagVersions: 2,
    pendingVersionTasks: 0,
    test: 0,
    releases: 0,
    unreleased: 2,
  });
  const unreleased = (await (
    await owner.fetch(`/deploys/projects/${project.id}/unreleasedIssues`)
  ).json()) as { data: { items: { id: string }[] } };
  expect(unreleased.data.items.map((item) => item.id).sort()).toEqual(
    [first.id, second.id].sort(),
  );
  const theirs = (await (
    await contributor.fetch(`/deploys/projects/${project.id}/unreleasedIssues`)
  ).json()) as { data: { items: unknown[] } };
  expect(theirs.data.items).toEqual([]);
  const line = (
    await (await owner.fetch(`/deploys/releaseLines/${repository.id}`)).json()
  ).data as { lines: { id: string; pattern: string }[]; canManage: boolean };
  expect(line.lines[0]?.pattern).toBe('v*');
  expect(line.canManage).toBe(true);
  expect(
    (
      await owner.fetch(
        `/deploys/releaseLines/${repository.id}`,
        json({ lines: [] }, 'PUT'),
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await contributor.fetch(
        `/deploys/releaseLines/${repository.id}`,
        json({ lines: [{ id: 'a', pattern: 'v*' }] }, 'PUT'),
      )
    ).status,
  ).toBe(403);
  expect(
    (await (await owner.fetch(`/previews/status?issueId=${first.id}`)).json())
      .data,
  ).toMatchObject({ issueId: first.id, previews: [], blocker: null });
  expect(
    (await contributor.fetch(`/previews/status?issueId=${first.id}`)).status,
  ).toBe(404);
  // Recording a deployment: production is the owner's here too.
  const recordOn = (who: typeof owner, environmentId: string) =>
    who.fetch(
      '/deploys/deploymentRecords',
      json({
        projectId: project.id,
        environmentId,
        version: 'v1.0',
        note: 'Ghi lại',
      }),
    );
  expect((await recordOn(admin, 'production')).status).toBe(403);
  expect((await recordOn(contributor, 'staging')).status).toBe(403);

  // Production is the owner's: an administrator and a contributor are refused; staging is an administrator's.
  const markBody = (environmentKey: string, note = 'Deploy bằng Dokploy') =>
    json({ environmentKey, note });
  expect(
    (
      await contributor.fetch(
        `/deploys/versions/${v10.id}/marks`,
        markBody('production'),
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await admin.fetch(
        `/deploys/versions/${v10.id}/marks`,
        markBody('production'),
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await contributor.fetch(
        `/deploys/versions/${v11.id}/marks`,
        markBody('staging'),
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await admin.fetch(
        `/deploys/versions/${v11.id}/marks`,
        markBody('staging'),
      )
    ).status,
  ).toBe(201);
  expect(
    (
      await owner.fetch(
        `/deploys/versions/${v10.id}/marks`,
        markBody('production', '   '),
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await owner.fetch(
        `/deploys/versions/${v10.id}/marks`,
        markBody('production'),
      )
    ).status,
  ).toBe(201);
  expect(await where()).toEqual({
    [first.id]: 'production',
    [second.id]: 'staging',
  });

  // The administrator asks the owner to put v1.1 on production; it waits in the owner's inbox, not in their own.
  const asked = await admin.fetch(
    `/deploys/versions/${v11.id}/requests`,
    json({ note: 'Đã deploy v1.1 lúc 20:00' }),
  );
  expect(asked.status).toBe(201);
  const requestView = (await asked.json()).data as {
    id: string;
    appId: string;
    status: string;
  };
  expect(requestView).toMatchObject({
    appId: 'sandbox-production',
    status: 'pending',
  });
  expect(
    (
      await contributor.fetch(
        `/deploys/versions/${v11.id}/requests`,
        json({ note: 'x' }),
      )
    ).status,
  ).toBe(403);
  expect(
    (await (await admin.fetch('/deploys/requests?awaitingMe=true')).json())
      .data as unknown[],
  ).toEqual([]);
  expect(
    (
      (await (await owner.fetch('/deploys/requests?awaitingMe=true')).json())
        .data as { id: string }[]
    ).map((r) => r.id),
  ).toEqual([requestView.id]);
  const attention = (await (await owner.fetch('/attention')).json()).data as {
    count: number;
    reasons: { reason: string; count: number }[];
  };
  expect(attention.reasons).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ reason: 'deployment_requested', count: 1 }),
      expect.objectContaining({ reason: 'pendingRelease', count: 1 }),
    ]),
  );
  // Only the owner decides, typing the App id again.
  expect(
    (
      await admin.fetch(
        `/deploys/requests/${requestView.id}/approve`,
        json({ confirmAppId: 'sandbox-production' }),
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await owner.fetch(
        `/deploys/requests/${requestView.id}/approve`,
        json({ confirmAppId: 'sandbox' }),
      )
    ).status,
  ).toBe(400);
  const approved = await owner.fetch(
    `/deploys/requests/${requestView.id}/approve`,
    json({ confirmAppId: 'sandbox-production', note: 'OK' }),
  );
  expect(approved.status).toBe(200);
  expect((await approved.json()).data.request.status).toBe('approved');
  expect(await where()).toEqual({
    [first.id]: 'production',
    [second.id]: 'production',
  });
  expect((await (await owner.fetch('/deploys/pending')).json()).data).toEqual(
    [],
  );

  // Rolling production back to v1.0 suggests reopening what v1.1 brought.
  const rolledBack = await owner.fetch(
    `/deploys/versions/${v10.id}/marks`,
    json({
      environmentKey: 'production',
      kind: 'rolledBack',
      note: 'Lỗi trên v1.1, quay về v1.0',
    }),
  );
  expect(rolledBack.status).toBe(201);
  expect((await rolledBack.json()).data.reopenSuggestions).toEqual([second.id]);
  expect(await where()).toEqual({
    [first.id]: 'production',
    [second.id]: 'staging',
  });

  // A tag deleted on GitHub keeps its version, marked deleted, and it can no longer be marked.
  github.tags = github.tags.filter((tag) => tag.name !== 'v1.1');
  expect(
    (
      await (
        await owner.fetch(
          `/deploys/repositories/${repository.id}/sync`,
          json({}),
        )
      ).json()
    ).data,
  ).toEqual({
    added: [],
    deleted: ['v1.1'],
  });
  expect(
    (await versions()).find((version) => version.tag === 'v1.1')?.deleted,
  ).toBe(true);
  expect(
    (
      await admin.fetch(
        `/deploys/versions/${v11.id}/marks`,
        markBody('staging'),
      )
    ).status,
  ).toBe(400);

  // The command line reads releases and versions (marking and deciding are people-only routes, not commands).
  const manifest = (await (await owner.fetch('/cli/manifest')).json()).data as {
    commands: { id: string }[];
  };
  const ids = manifest.commands.map((command) => command.id);
  expect(ids).toEqual(
    expect.arrayContaining([
      'release:list',
      'version:list',
      'release:pending',
      'environment:list',
    ]),
  );

  // An agent's run reads versions with its token, and is refused marking and requesting.
  const agents = app.container.resolve(agentsToken);
  const coder = await agents.agents.ensureSystem({
    id: 'ds-test-release-coder',
    name: 'Release coder',
    description: 'Implements small changes.',
    instructions: null,
    actions: [...DEFAULT_AGENT_ACTIONS],
    modelEntries: [{ tool: 'claude', model: MODEL }],
  });
  expect(
    (
      await owner.fetch(
        '/projects/issues',
        json({
          title: 'Release run',
          projectId: project.id,
          statusKey: 'in_progress',
          executor: { type: AGENT_KIND, id: coder.id },
        }),
      )
    ).status,
  ).toBe(201);
  const registration = await agents.runners.createRegistrationToken(ownerId, {
    trust: 'ownerOnly',
  });
  const registered = await agents.runners.register({
    registrationToken: registration.token,
    name: 'release-runner',
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
  const runToken = String(payload.cli.credential.content.token);
  const asRun = (path: string, init: RequestInit = {}) =>
    request(path, {
      ...init,
      headers: {
        ...(init.headers as Record<string, string> | undefined),
        'x-nocobase-run-token': runToken,
      },
    });
  expect(
    (await asRun(`/deploys/versions?projectId=${project.id}`)).status,
  ).toBe(200);
  expect(
    (await asRun(`/deploys/versions/${v10.id}/marks`, markBody('staging')))
      .status,
  ).toBe(403);
  expect(
    (await asRun(`/deploys/versions/${v10.id}/requests`, json({ note: 'x' })))
      .status,
  ).toBe(403);
  expect((await asRun('/deploys/requests')).status).toBe(403);

  // Nothing answered carries the token.
  expect(
    JSON.stringify(await (await owner.fetch('/deploys/releases')).json()),
  ).not.toContain(TOKEN);
  expect(github.calls.some((call) => call.includes('/tags'))).toBe(true);
});
