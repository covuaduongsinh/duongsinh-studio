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
import { CONTRIBUTOR_SET_KEY } from '../../server/access/roles.js';
import { AGENT_KIND } from '../../server/agents/ids.js';
import { gitServiceToken } from '../../server/providers/git.js';
import { createStandaloneServer } from '../../server/standalone.js';

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
const PERSONAL = 'ghp_personal_never_returned';
const PASSWORD = 'Studio-test-123!';
const MODEL = 'claude-sonnet-4-5';
const PROTOCOL_VERSION = 14;
const HEAD = 'abc1234def5678';

const json = (body: unknown, method = 'POST') => ({
  method,
  headers: {
    'content-type': 'application/json',
    origin: 'http://localhost',
    'Idempotency-Key': `${Date.now()}.${randomUUID()}`,
  },
  body: JSON.stringify(body),
});

function fakeGitHub(branch: { name: string }): void {
  const pull = () => ({
    number: 5,
    title: 'Thêm trường mới',
    html_url: 'https://github.test/acme/sandbox/pull/5',
    state: 'open',
    merged: false,
    draft: false,
    head: { ref: branch.name, sha: HEAD },
    base: { ref: 'main' },
    mergeable_state: 'clean',
    merged_at: null,
    merge_commit_sha: null,
    closed_at: null,
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
      const path = url.pathname.slice('/api'.length);
      const headers = new Headers(init?.headers);
      const answer = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), {
          status,
          headers: { 'content-type': 'application/json' },
        });
      const auth = headers.get('authorization');
      if (auth !== `Bearer ${TOKEN}` && auth !== `Bearer ${PERSONAL}`)
        return answer({ message: 'Bad credentials' }, 401);
      const repo = '/repos/acme/sandbox';
      if (path === '/user')
        return answer({
          login: auth === `Bearer ${PERSONAL}` ? 'me-on-github' : 'ds-bot',
        });
      if (path === repo)
        return answer({
          id: 42,
          full_name: 'acme/sandbox',
          default_branch: 'main',
          clone_url: 'https://github.test/acme/sandbox.git',
          html_url: 'https://github.test/acme/sandbox',
          permissions: { push: true },
        });
      if (path === '/user/repos' && init?.method === 'POST') {
        // GitHub takes this only from a person's token.
        if (auth !== `Bearer ${PERSONAL}`)
          return answer(
            { message: 'Resource not accessible by integration' },
            403,
          );
        return answer(
          {
            id: 44,
            full_name: 'me-on-github/moi',
            default_branch: 'main',
            clone_url: 'https://github.test/me-on-github/moi.git',
            html_url: 'https://github.test/me-on-github/moi',
            permissions: { push: true },
          },
          201,
        );
      }
      if (path === '/user/repos')
        return answer([
          {
            id: 42,
            full_name: 'acme/sandbox',
            default_branch: 'main',
            clone_url: 'https://github.test/acme/sandbox.git',
            html_url: 'https://github.test/acme/sandbox',
            permissions: { push: true },
          },
          { id: 45, full_name: 'acme/khac', permissions: {} },
        ]);
      if (path === `${repo}/pulls`)
        return answer(url.searchParams.get('state') === 'open' ? [pull()] : []);
      if (path === `${repo}/pulls/5`) return answer(pull());
      if (path === `${repo}/commits/${HEAD}/check-runs`)
        return answer({
          check_runs: [
            {
              name: 'verify',
              status: 'completed',
              conclusion: 'failure',
              html_url: 'https://github.test/acme/sandbox/runs/1',
            },
          ],
        });
      if (path === `${repo}/commits/${HEAD}/status`)
        return answer({ state: 'success', statuses: [] });
      if (path === `${repo}/branches/trunk`)
        return answer({ name: 'trunk', commit: { sha: 'feedface0001' } });
      if (init?.method === 'POST' && path === `${repo}/issues/5/comments`)
        return answer({ id: 1 }, 201);
      return answer({ message: 'Not Found' }, 404);
    },
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

interface Pull {
  id: string;
  issueId: string | null;
  ciState: string | null;
  checks: { name: string }[];
  mergeBlocker: string | null;
  autoCompleteDisabled: boolean;
  state: string;
}

test(
  'checks come from one source, pull requests are decided by who may, and personal tokens stay secret',
  { timeout: 240_000 },
  async ({ testApp, app, request }) => {
    for (const [path, init] of [
      ['/git/status'],
      ['/git/pullRequests/marks?issueIds=a'],
      ['/git/authorizations'],
      ['/git/resources/x'],
      ['/git/commitChecks?issueId=a&resourceId=b&sha=abcdef1'],
      ['/git/checks', json({ name: 'ci', status: 'success' })],
    ] as const)
      expect((await request(path, init)).status).toBe(401);

    const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
    const agents = app.container.resolve(agentsToken);
    const ownerId = (
      (await (await admin.fetch('/auth/get-session')).json()) as {
        user: { id: string };
      }
    ).user.id;
    const coder = await agents.agents.ensureSystem({
      id: 'ds-test-coder',
      name: 'Test coder',
      description: 'Implements.',
      instructions: null,
      actions: ['pm.issues/view', 'pm.issues/comment'],
      modelEntries: [{ tool: 'claude', model: MODEL }],
    });

    const branch = { name: 'feature/none' };
    fakeGitHub(branch);
    const connection = (
      (await (
        await admin.fetch(
          '/git/connections',
          json({ name: 'GitHub', token: TOKEN, apiBaseUrl: API }),
        )
      ).json()) as { data: { id: string } }
    ).data;
    const repository = (
      (await (
        await admin.fetch(
          '/git/repositories',
          json({ connectionId: connection.id, repo: 'acme/sandbox' }),
        )
      ).json()) as { data: { id: string } }
    ).data;
    const project = (
      await (
        await admin.fetch(
          '/projects',
          json({ name: 'Sandbox', visibility: 'members' }),
        )
      ).json()
    ).data as { id: string };
    expect(
      (
        await admin.fetch(
          `/projects/${project.id}/codeLocations`,
          json({ repositoryId: repository.id, primary: true }),
        )
      ).status,
    ).toBe(201);

    // Status, usage and renaming a connection.
    const status = (await (await admin.fetch('/git/status')).json()).data as {
      enabled: boolean;
      canManage: boolean;
      connections: unknown[];
    };
    expect(status).toMatchObject({ enabled: true, canManage: true });
    expect(status.connections).toHaveLength(1);
    expect(JSON.stringify(status)).not.toContain(TOKEN);
    const usage = (
      await (
        await admin.fetch(`/git/connections/${connection.id}/usage`)
      ).json()
    ).data as { repo: string; projectName: string }[];
    expect(usage).toEqual([
      expect.objectContaining({ repo: 'acme/sandbox', projectName: 'Sandbox' }),
    ]);
    const renamed = await admin.fetch(
      `/git/connections/${connection.id}`,
      json({ name: 'GitHub chính' }, 'PATCH'),
    );
    expect(((await renamed.json()).data as { name: string }).name).toBe(
      'GitHub chính',
    );

    // A contributor outside the project reads nothing and changes nothing.
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
      (await contributor.fetch(`/git/resources/${repository.id}`)).status,
    ).toBe(404);
    expect(
      (await contributor.fetch(`/git/connections/${connection.id}/usage`))
        .status,
    ).toBe(403);

    // A repository's settings: wake rules are not Studio's way, and one branch rule is.
    const resource = (
      await (await admin.fetch(`/git/resources/${repository.id}`)).json()
    ).data as { checksSource: string; branchRules: string[] };
    expect(resource.checksSource).toBe('host');
    expect(resource.branchRules).toEqual(['agent/*']);
    expect(
      (
        await admin.fetch(
          `/git/resources/${repository.id}`,
          json({ wakeOnChecks: true }, 'PATCH'),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await admin.fetch(
          `/git/resources/${repository.id}`,
          json({ branchRules: ['a', 'b'] }, 'PATCH'),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await admin.fetch(
          `/git/resources/${repository.id}/repairWebhook`,
          json({}),
        )
      ).status,
    ).toBe(400);

    // An issue with a pull request on its branch.
    const issue = (
      await (
        await admin.fetch(
          '/projects/issues',
          json({
            title: 'Việc có PR',
            statusKey: 'in_progress',
            projectId: project.id,
            executor: { type: AGENT_KIND, id: coder.id },
          }),
        )
      ).json()
    ).data as { id: string; identifier: string };
    branch.name = `agent/${issue.identifier}`;
    const git = app.container.resolve(gitServiceToken);
    await git.syncRepository(repository.id);
    const pulls = (
      await (await admin.fetch(`/git/pullRequests?issueId=${issue.id}`)).json()
    ).data as Pull[];
    expect(pulls).toHaveLength(1);
    const pull = pulls[0] as Pull;

    // The list's marks: one summary per issue, open before merged; an issue nobody may see is left out.
    const marksOf = async (client: typeof admin, ids: string) =>
      (
        await (
          await client.fetch(`/git/pullRequests/marks?issueIds=${ids}`)
        ).json()
      ).data as Record<
        string,
        { count: number; merged: boolean; state: string }
      >;
    expect(
      (await marksOf(admin, `${issue.id},no-such-issue`))[issue.id],
    ).toMatchObject({
      count: 1,
      merged: false,
      state: 'open',
    });
    expect(Object.keys(await marksOf(admin, 'no-such-issue'))).toEqual([]);

    // Checks read from the host: a report is refused, failures are listed, and one marked reference no longer decides.
    const report = (body: object) =>
      admin.fetch(
        '/git/checks',
        json({ repository: 'acme/sandbox', sha: HEAD, name: 'ci', ...body }),
      );
    const fromHost = await report({ status: 'success' });
    expect(fromHost.status).toBe(403);
    expect(
      ((await fromHost.json()) as { error: { reason: string } }).error.reason,
    ).toBe('CHECKS_FROM_HOST');
    const failed = (
      await (await admin.fetch(`/git/pullRequests/${pull.id}/checks`)).json()
    ).data as {
      headSha: string;
      checks: { name: string; reference: boolean }[];
    };
    expect(failed.headSha).toBe(HEAD);
    expect(failed.checks).toEqual([
      expect.objectContaining({ name: 'verify', reference: false }),
    ]);
    const commit = (
      await (
        await admin.fetch(
          `/git/commitChecks?issueId=${issue.id}&resourceId=${repository.id}&sha=${HEAD}`,
        )
      ).json()
    ).data as { state: string };
    expect(commit.state).toBe('failure');
    expect(
      (
        await admin.fetch(
          `/git/commitChecks?issueId=${issue.id}&resourceId=${repository.id}&sha=${HEAD}&branch=x`,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await admin.fetch(
          `/git/resources/${repository.id}`,
          json({ referenceChecks: ['verify'] }, 'PATCH'),
        )
      ).status,
    ).toBe(200);
    const merge = (
      await (
        await admin.fetch(`/git/pullRequests/${pull.id}/checkMerge`, json({}))
      ).json()
    ).data as {
      blocker: string | null;
      headSha: string;
      failedChecks: unknown[];
      referenceFailures: { name: string }[];
    };
    expect(merge.headSha).toBe(HEAD);
    expect(merge.failedChecks).toEqual([]);
    expect(merge.referenceFailures.map((item) => item.name)).toEqual([
      'verify',
    ]);

    // An external CI reports with an organization key that has the group; a person and a key without it do not.
    expect(
      (
        await admin.fetch(
          `/git/resources/${repository.id}`,
          json({ checksSource: 'external', referenceChecks: [] }, 'PATCH'),
        )
      ).status,
    ).toBe(200);
    const fromPerson = await report({ status: 'success' });
    expect(fromPerson.status).toBe(403);
    expect(
      ((await fromPerson.json()) as { error: { reason: string } }).error.reason,
    ).toBe('CHECKS_FROM_EXTERNAL_CI');
    const keyFor = async (groups: object) =>
      (
        (await (
          await admin.fetch(
            '/organizationKeys',
            json({ name: 'CI', expiresInDays: 1, scope: { groups } }),
          )
        ).json()) as { data: { secret: string } }
      ).data.secret;
    const ciKey = await keyFor({ 'studio.checks': { level: 'write' } });
    const otherKey = await keyFor({ 'releases.apps': { level: 'read' } });
    const asKey = (secret: string, body: object) => {
      const init = json({ repository: 'acme/sandbox', ...body });
      return request('/git/checks', {
        ...init,
        headers: { ...init.headers, 'x-api-key': secret },
      });
    };
    expect(
      (await asKey(otherKey, { sha: HEAD, name: 'ci', exitCode: 0 })).status,
    ).toBe(403);
    expect((await asKey(ciKey, { name: 'ci', exitCode: 0 })).status).toBe(400);
    const reported = await asKey(ciKey, {
      sha: HEAD,
      name: 'ci',
      exitCode: 0,
      url: 'https://ci.test/1',
      summary: 'Xanh',
    });
    expect(reported.status).toBe(201);
    expect((await reported.json()).data).toMatchObject({
      status: 'success',
      source: 'ci',
      pullRequests: [{ repo: 'acme/sandbox', number: 5 }],
    });
    // The report becomes the pull request's checks, and survives reading the pull request again.
    const after = (
      await (
        await admin.fetch(`/git/pullRequests/${pull.id}/refresh`, json({}))
      ).json()
    ).data as Pull;
    expect(after.ciState).toBe('success');
    expect(after.checks.map((check) => check.name)).toEqual(['ci']);
    // The latest report of a name replaces the one before.
    expect(
      (await asKey(ciKey, { sha: HEAD, name: 'ci', exitCode: 1 })).status,
    ).toBe(201);
    const listed = (
      await (
        await admin.fetch(`/git/resources/${repository.id}/reportedChecks`)
      ).json()
    ).data as { source: string; sha: string; checks: { status: string }[] };
    expect(listed).toMatchObject({ source: 'ci', sha: HEAD });
    expect(listed.checks.map((check) => check.status)).toEqual(['failure']);

    // An agent's run reports for its own issue's pull request only.
    expect(
      (
        await admin.fetch(
          `/git/resources/${repository.id}`,
          json({ checksSource: 'agent' }, 'PATCH'),
        )
      ).status,
    ).toBe(200);
    const fromKey = await asKey(ciKey, { sha: HEAD, name: 'ci', exitCode: 0 });
    expect(fromKey.status).toBe(403);
    expect(
      ((await fromKey.json()) as { error: { reason: string } }).error.reason,
    ).toBe('CHECKS_FROM_AGENT');
    const registration = await agents.runners.createRegistrationToken(ownerId, {
      trust: 'ownerOnly',
    });
    const registered = await agents.runners.register({
      registrationToken: registration.token,
      name: 'test-runner',
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
    const asRun = (body: object) => {
      const init = json(body);
      return request('/git/checks', {
        ...init,
        headers: {
          ...init.headers,
          'x-nocobase-run-token': String(payload?.cli.credential.content.token),
        },
      });
    };
    const otherCommit = await asRun({ sha: 'feedface', name: 'self' });
    expect(otherCommit.status).toBe(403);
    const self = await asRun({ name: 'self', status: 'success' });
    expect(self.status).toBe(201);
    expect((await self.json()).data).toMatchObject({
      sha: HEAD,
      source: 'agent',
      status: 'success',
    });

    // Pull requests default to not auto-completing issues on merge
    expect(pull.autoCompleteDisabled).toBe(true);

    // Who may decide about the pull request: not the outsider.
    expect(
      (
        await contributor.fetch(
          `/git/pullRequests/${pull.id}`,
          json({ autoCompleteDisabled: true }, 'PATCH'),
        )
      ).status,
    ).toBe(403);
    const noAuto = (
      await (
        await admin.fetch(
          `/git/pullRequests/${pull.id}`,
          json({ autoCompleteDisabled: true }, 'PATCH'),
        )
      ).json()
    ).data as Pull;
    expect(noAuto.autoCompleteDisabled).toBe(true);

    // Merged outside Studio: recorded, and with auto-complete off the issue stays where it is.
    const marked = (
      await (
        await admin.fetch(`/git/pullRequests/${pull.id}/markMerged`, json({}))
      ).json()
    ).data as Pull;
    expect(marked.state).toBe('merged');
    const unmoved = (
      await (await admin.fetch(`/projects/issues/${issue.id}`)).json()
    ).data as { statusKey?: string; status?: { key: string } };
    expect(unmoved.statusKey ?? unmoved.status?.key).toBe('in_progress');

    // Unlinked: gone from the issue, and polling does not bring it back.
    expect(
      (
        await admin.fetch(`/git/pullRequests/${pull.id}`, {
          ...json({}, 'DELETE'),
          body: undefined,
        })
      ).status,
    ).toBe(204);
    await git.syncRepository(repository.id);
    const relinked = (
      await (await admin.fetch(`/git/pullRequests?issueId=${issue.id}`)).json()
    ).data as Pull[];
    expect(relinked).toEqual([]);

    // What a connection reaches, narrowed by name.
    const reached = (
      await (
        await admin.fetch(
          `/git/connections/${connection.id}/repositories?q=sandbox`,
        )
      ).json()
    ).data as { fullName: string }[];
    expect(reached.map((item) => item.fullName)).toEqual(['acme/sandbox']);
    expect(
      (
        await contributor.fetch(
          `/git/connections/${connection.id}/repositories`,
        )
      ).status,
    ).toBe(403);

    // An App under a personal account cannot create a repository without the person's own token.
    const database = app.container.resolve(databaseManagerToken).connection();
    const appConnection = randomUUID();
    const now = new Date();
    await database.query
      .insertInto('dsGitConnections')
      .values({
        id: appConnection,
        provider: 'github',
        kind: 'app',
        name: 'App',
        apiBaseUrl: API,
        createdById: ownerId,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    await database.query
      .insertInto('dsGitApps')
      .values({
        connectionId: appConnection,
        appId: '1',
        slug: 'app',
        htmlUrl: 'https://github.test/apps/app',
        ownerLogin: 'me-on-github',
        privateKeySealed: 'x',
        webhookSecretSealed: 'x',
        installationId: '1',
        installationAccount: 'me-on-github',
        installationTargetType: 'User',
        permissions: JSON.stringify({}),
        events: JSON.stringify([]),
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    const createOn = (id: string) =>
      admin.fetch(
        `/git/connections/${id}/repositories`,
        json({ name: 'moi', private: true }),
      );
    const noToken = await createOn(appConnection);
    expect(noToken.status).toBe(400);
    expect(
      ((await noToken.json()) as { error: { reason: string } }).error.reason,
    ).toBe('GIT_PERSONAL_TOKEN_REQUIRED');
    expect(
      (
        await admin.fetch(
          `/git/authorizations/${appConnection}/useToken`,
          json({ token: PERSONAL }),
        )
      ).status,
    ).toBe(200);
    const withToken = await createOn(appConnection);
    expect(withToken.status).toBe(201);
    expect(
      ((await withToken.json()).data as { repo: { fullName: string } }).repo
        .fullName,
    ).toBe('me-on-github/moi');
    expect(
      (
        await admin.fetch(`/git/authorizations/${appConnection}`, {
          ...json({}, 'DELETE'),
          body: undefined,
        })
      ).status,
    ).toBe(204);

    // A personal token is checked on the host, kept sealed and never answered.
    const bad = await admin.fetch(
      `/git/authorizations/${connection.id}/useToken`,
      json({ token: 'wrong' }),
    );
    expect(bad.status).not.toBe(200);
    const good = await admin.fetch(
      `/git/authorizations/${connection.id}/useToken`,
      json({ token: PERSONAL }),
    );
    expect(good.status).toBe(200);
    const goodText = await good.text();
    expect(goodText).not.toContain(PERSONAL);
    expect(JSON.parse(goodText).data).toMatchObject({
      login: 'me-on-github',
      method: 'token',
    });
    const mine = await (await admin.fetch('/git/authorizations')).text();
    expect(mine).toContain('me-on-github');
    expect(mine).not.toContain(PERSONAL);
    // Each person sees their own.
    expect(
      await (await contributor.fetch('/git/authorizations')).text(),
    ).not.toContain('me-on-github');
    expect(
      (
        await admin.fetch(`/git/authorizations/${connection.id}`, {
          ...json({}, 'DELETE'),
          body: undefined,
        })
      ).status,
    ).toBe(204);
    expect(
      await (await admin.fetch('/git/authorizations')).text(),
    ).not.toContain('me-on-github');
  },
);
