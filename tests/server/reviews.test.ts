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
import { DEFAULT_AGENT_ACTIONS } from '../../server/agents/actions.js';
import { AGENT_KIND } from '../../server/agents/ids.js';
import { databaseManagerToken } from '@nocobase/db';
import { gitServiceToken } from '../../server/providers/git.js';
import { reviewsServiceToken } from '../../server/providers/reviews.js';

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
const MODEL = 'claude-sonnet-4-5';
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
  sha: string;
}

function fakeGitHub(headSha = 'sha-head-123') {
  const pulls: FakePull[] = [
    {
      number: 1,
      title: 'Test PR',
      body: 'Testing',
      head: 'agent/TEST-1',
      base: 'main',
      draft: false,
      sha: headSha,
    },
  ];
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
    head: { ref: pull.head, sha: pull.sha },
    base: { ref: pull.base },
    mergeable_state: 'clean',
    merged_at: null,
    merge_commit_sha: null,
    closed_at: null,
    user: { login: 'agent-bot' },
    updated_at: new Date().toISOString(),
  });

  vi.stubGlobal(
    'fetch',
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = new URL(
        typeof input === 'string' || input instanceof URL ? input : input.url,
      );
      if (!url.href.startsWith(API)) return original(input, init);
      const method = init?.method ?? 'GET';
      const path = url.pathname.slice('/api'.length);
      const repo = '/repos/acme/sandbox';

      if (method === 'GET' && path === '/user')
        return answer({ login: 'ds-bot' });
      if (path === repo)
        return answer({
          id: 42,
          full_name: 'acme/sandbox',
          default_branch: 'main',
          clone_url: CLONE_URL,
          html_url: 'https://github.test/acme/sandbox',
          permissions: { push: true },
        });
      if (method === 'GET' && path === `${repo}/pulls`) {
        return answer(pulls.map(pullJson));
      }
      if (method === 'GET' && path === `${repo}/pulls/1`) {
        return answer(pullJson(pulls[0]));
      }
      if (method === 'GET' && /\/commits\/[^/]+\/check-runs$/u.test(path))
        return answer({ check_runs: [] });
      if (method === 'GET' && path === `${repo}/actions/runs`)
        return answer({ workflow_runs: [] });
      if (method === 'GET' && /\/commits\/[^/]+\/status$/u.test(path))
        return answer({ state: 'success', statuses: [] });
      return answer({ message: 'Not Found' }, 404);
    },
  );
  return { pulls };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

test('structured review submission, validation gates, security reviews, and listing', async ({
  testApp,
  app,
  request,
}) => {
  const HEAD_SHA = 'sha-head-123';
  fakeGitHub(HEAD_SHA);
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const ownerId = (
    (await (await admin.fetch('/access/me')).json()).data as { userId: string }
  ).userId;

  // Setup GitHub Connection, repository, project and link repo
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

  await admin.fetch(
    `/projects/${project.id}/codeLocations`,
    json({ repositoryId: repository.id }),
  );

  // Sync pull request into Studio
  const git = app.container.resolve(gitServiceToken);
  await git.syncRepository(repository.id);
  const pullRequestsRes = await admin.fetch('/git/pullRequests');
  const pullRequests = (await pullRequestsRes.json()).data as {
    id: string;
    headSha: string;
  }[];
  expect(pullRequests.length).toBeGreaterThan(0);
  const pullRequest = pullRequests[0];
  expect(pullRequest.headSha).toBe(HEAD_SHA);

  // Create author agent and reviewer agent
  const agents = app.container.resolve(agentsToken);
  const authorAgent = await agents.agents.ensureSystem({
    id: 'author-agent',
    name: 'Author Agent',
    description: 'Writes code',
    actions: [...DEFAULT_AGENT_ACTIONS],
    modelEntries: [{ tool: 'claude', model: MODEL }],
  });

  const reviewerAgent = await agents.agents.ensureSystem({
    id: 'reviewer-agent',
    name: 'Reviewer Agent',
    description: 'Reviews code',
    actions: [...DEFAULT_AGENT_ACTIONS],
    modelEntries: [{ tool: 'claude', model: MODEL }],
  });

  // Record that authorAgent pushed HEAD_SHA
  const conn = app.container.resolve(databaseManagerToken).connection();
  await conn.query
    .insertInto('agRuns')
    .values({
      id: 'author-run-1',
      agentId: authorAgent.id,
      agentType: 'runner',
      status: 'completed',
      subjectKind: 'issue',
      subjectId: 'issue-1',
      threadScope: 'scope-1',
      actorUserId: ownerId,
      model: MODEL,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .execute();

  await conn.query
    .insertInto('agRunRepos')
    .values({
      id: 'repo-1',
      runId: 'author-run-1',
      url: CLONE_URL,
      branch: 'agent/TEST-1',
      pushed: true,
      headSha: HEAD_SHA,
      updatedAt: new Date(),
    })
    .execute();

  // Create runner and register
  const registration = await agents.runners.createRegistrationToken(ownerId, {
    trust: 'ownerOnly',
  });
  const registered = await agents.runners.register({
    registrationToken: registration.token,
    name: 'review-runner',
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

  // 1. A person calling POST /api/reviews directly without run token is denied
  const personPostRes = await admin.fetch(
    '/reviews',
    json({
      pullRequestId: pullRequest.id,
      headSha: HEAD_SHA,
      verdict: 'approve',
      summary: 'Nice work',
      checklist: { tests: true },
    }),
  );
  expect(personPostRes.status).toBe(403);

  // 2. A run that is NOT read-only is denied by the action gate / service
  const nonReadOnlyIssue = (
    await (
      await admin.fetch(
        '/projects/issues',
        json({
          title: 'Non-read-only review issue',
          projectId: project.id,
          statusKey: 'in_progress',
          executor: { type: AGENT_KIND, id: reviewerAgent.id },
        }),
      )
    ).json()
  ).data as { id: string };

  const [nonReadOnlyPayload] = await agents.claims.claim(runner, 1);
  expect(nonReadOnlyPayload).toBeDefined();
  const nonReadOnlyToken = String(
    nonReadOnlyPayload.cli.credential.content.token,
  );

  const nonReadOnlySubmitRes = await request('/reviews', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-nocobase-run-token': nonReadOnlyToken,
    },
    body: JSON.stringify({
      pullRequestId: pullRequest.id,
      headSha: HEAD_SHA,
      verdict: 'approve',
      summary: 'Reviewing without read-only mode',
      checklist: { tests: true },
    }),
  });
  expect(nonReadOnlySubmitRes.status).toBe(403);

  // 3. Create a read-only review run by adding a comment with Mode: read-only
  // First complete previous run
  await conn.query
    .updateTable('agRuns')
    .set({ status: 'completed', finishedAt: new Date() })
    .where('id', '=', nonReadOnlyPayload.run.id)
    .execute();

  await admin.fetch(
    `/projects/issues/${nonReadOnlyIssue.id}/comments`,
    json({
      content: `[@reviewer-agent · ${MODEL}](mention://agent/${reviewerAgent.id}) Next: review PR #1. Mode: read-only`,
    }),
  );

  const [readOnlyPayload] = await agents.claims.claim(runner, 1);
  expect(readOnlyPayload).toBeDefined();
  const readOnlyToken = String(readOnlyPayload.cli.credential.content.token);
  const readOnlyRunId = readOnlyPayload.run.id;

  // 4. Test wrong head SHA is rejected
  const wrongHeadRes = await request('/reviews', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-nocobase-run-token': readOnlyToken,
    },
    body: JSON.stringify({
      pullRequestId: pullRequest.id,
      headSha: 'wrong-sha-000',
      verdict: 'approve',
      summary: 'Wrong head',
      checklist: { tests: true },
    }),
  });
  expect(wrongHeadRes.status).toBe(400);
  const wrongHeadJson = await wrongHeadRes.json();
  expect(wrongHeadJson.error.reason).toBe('HEAD_SHA_MISMATCH');

  // 5. Test author cannot review their own PR (self-review rejected)
  // Complete current run, start author run with read-only
  await conn.query
    .updateTable('agRuns')
    .set({ status: 'completed', finishedAt: new Date() })
    .where('id', '=', readOnlyRunId)
    .execute();

  await admin.fetch(
    `/projects/issues/${nonReadOnlyIssue.id}/comments`,
    json({
      content: `[@author-agent · ${MODEL}](mention://agent/${authorAgent.id}) Next: review self. Mode: read-only`,
    }),
  );
  const [authorPayload] = await agents.claims.claim(runner, 1);
  const authorToken = String(authorPayload.cli.credential.content.token);

  const selfReviewRes = await request('/reviews', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-nocobase-run-token': authorToken,
    },
    body: JSON.stringify({
      pullRequestId: pullRequest.id,
      headSha: HEAD_SHA,
      verdict: 'approve',
      summary: 'Self review',
      checklist: { tests: true },
    }),
  });
  expect(selfReviewRes.status).toBe(400);
  const selfReviewJson = await selfReviewRes.json();
  expect(selfReviewJson.error.reason).toBe('SELF_REVIEW_NOT_ALLOWED');

  await conn.query
    .updateTable('agRuns')
    .set({ status: 'completed', finishedAt: new Date() })
    .where('id', '=', authorPayload.run.id)
    .execute();

  // 5b. Test cross-model peer review under the same agent ID is allowed (e.g. Opus reviewing Sonnet's PR)
  await admin.fetch(
    `/projects/issues/${nonReadOnlyIssue.id}/comments`,
    json({
      content: `[@author-agent · claude-opus-5-5](mention://agent/${authorAgent.id}) Next: peer review. Mode: read-only`,
    }),
  );
  const [crossModelPayload] = await agents.claims.claim(runner, 1);
  const crossModelToken = String(crossModelPayload.cli.credential.content.token);
  await conn.query
    .updateTable('agRuns')
    .set({ model: 'claude-opus-5-5' })
    .where('id', '=', crossModelPayload.run.id)
    .execute();

  const crossModelReviewRes = await request('/reviews', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-nocobase-run-token': crossModelToken,
    },
    body: JSON.stringify({
      pullRequestId: pullRequest.id,
      headSha: HEAD_SHA,
      verdict: 'approve',
      summary: 'Cross-model peer review by Opus',
      checklist: { tests: true },
    }),
  });
  expect(crossModelReviewRes.status).toBe(200);
  const crossModelJson = await crossModelReviewRes.json();
  expect(crossModelJson.data.sameModel).toBe(false);

  await conn.query
    .updateTable('agRuns')
    .set({ status: 'completed', finishedAt: new Date() })
    .where('id', '=', crossModelPayload.run.id)
    .execute();

  // 6. Test security review with incomplete checklist is rejected
  await admin.fetch(
    `/projects/issues/${nonReadOnlyIssue.id}/comments`,
    json({
      content: `[@reviewer-agent · ${MODEL}](mention://agent/${reviewerAgent.id}) Next: security review. Mode: read-only`,
    }),
  );
  const [secPayload] = await agents.claims.claim(runner, 1);
  const secToken = String(secPayload.cli.credential.content.token);

  const secIncompleteRes = await request('/reviews', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-nocobase-run-token': secToken,
    },
    body: JSON.stringify({
      pullRequestId: pullRequest.id,
      headSha: HEAD_SHA,
      verdict: 'approve',
      kind: 'security',
      summary: 'Security review incomplete',
      checklist: {
        security: {
          tenantIsolation: true,
          permissionBoundaries: false, // failed!
          migrationDown: true,
          dependenciesLicense: true,
          noSecrets: true,
        },
      },
    }),
  });
  expect(secIncompleteRes.status).toBe(400);
  const secIncompleteJson = await secIncompleteRes.json();
  expect(secIncompleteJson.error.reason).toBe('SECURITY_CHECKLIST_INCOMPLETE');

  // 7. Test valid code review succeeds (verdict approve, sameModel true since both Claude)
  const validCodeRes = await request('/reviews', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-nocobase-run-token': secToken,
    },
    body: JSON.stringify({
      pullRequestId: pullRequest.id,
      headSha: HEAD_SHA,
      verdict: 'approve',
      kind: 'code',
      mustFix: 0,
      shouldFix: 1,
      summary: 'Code looks clean and verified.',
      checklist: { tests: true, cleanDiff: true },
    }),
  });
  expect(validCodeRes.status).toBe(201);
  const validCodeJson = await validCodeRes.json();
  expect(validCodeJson.data).toMatchObject({
    pullRequestId: pullRequest.id,
    headSha: HEAD_SHA,
    reviewerAgentId: reviewerAgent.id,
    authorAgentId: authorAgent.id,
    verdict: 'approve',
    mustFix: 0,
    shouldFix: 1,
    kind: 'code',
    sameModel: true,
  });

  // 8. Test valid security review succeeds
  const validSecRes = await request('/reviews', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-nocobase-run-token': secToken,
    },
    body: JSON.stringify({
      pullRequestId: pullRequest.id,
      headSha: HEAD_SHA,
      verdict: 'approve',
      kind: 'security',
      mustFix: 0,
      shouldFix: 0,
      summary: 'Security checklist passed completely.',
      checklist: {
        security: {
          tenantIsolation: true,
          permissionBoundaries: true,
          migrationDown: true,
          dependenciesLicense: true,
          noSecrets: true,
        },
      },
    }),
  });
  expect(validSecRes.status).toBe(201);

  // 9. Test latestFor query via service
  const reviewsService = app.container.resolve(reviewsServiceToken);
  const latestCode = await reviewsService.latestFor(
    pullRequest.id,
    HEAD_SHA,
    'code',
  );
  expect(latestCode).toBeDefined();
  expect(latestCode?.kind).toBe('code');
  expect(latestCode?.verdict).toBe('approve');

  const latestSec = await reviewsService.latestFor(
    pullRequest.id,
    HEAD_SHA,
    'security',
  );
  expect(latestSec).toBeDefined();
  expect(latestSec?.kind).toBe('security');

  // 10. List reviews via GET /api/git/pullRequests/:id/reviews
  const listRes = await admin.fetch(
    `/git/pullRequests/${pullRequest.id}/reviews`,
  );
  expect(listRes.status).toBe(200);
  const listJson = await listRes.json();
  expect(listJson.data.length).toBe(2);

  const listCodeRes = await admin.fetch(
    `/git/pullRequests/${pullRequest.id}/reviews?kind=code`,
  );
  expect(listCodeRes.status).toBe(200);
  const listCodeJson = await listCodeRes.json();
  expect(listCodeJson.data.length).toBe(1);
  expect(listCodeJson.data[0].kind).toBe('code');
});
