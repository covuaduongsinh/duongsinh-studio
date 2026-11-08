import { afterEach, expect, test, vi } from 'vitest';
import { createAppTest } from '@nocobase/app-testing/server';
import {
  signIn,
  DEFAULT_ADMIN_CREDENTIALS,
} from '@nocobase/app-plugin-authentication/testing';
import { databaseManagerToken } from '@nocobase/db';
import { gitServiceToken } from '../../server/providers/git.js';
import { reviewsServiceToken } from '../../server/providers/reviews.js';
import { createAutopilotEvaluator } from '../../server/autopilot/evaluator.js';

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
const TOKEN = 'ghp_test_token';

const json = (body: unknown, method = 'POST') => ({
  method,
  headers: {
    'content-type': 'application/json',
    origin: 'http://localhost',
  },
  body: JSON.stringify(body),
});

function fakeGitHub(
  headSha: string,
  changedFiles: string[] = ['src/index.ts'],
) {
  const repo = '/repos/acme/sandbox';
  const pullJson = {
    number: 1,
    title: 'Auto test PR',
    html_url: 'https://github.test/acme/sandbox/pull/1',
    state: 'open',
    merged: false,
    draft: false,
    head: { ref: 'agent/TEST-1', sha: headSha },
    base: { ref: 'main' },
    mergeable_state: 'clean',
    merged_at: null,
    merge_commit_sha: null,
    closed_at: null,
    user: { login: 'agent-author' },
    updated_at: new Date().toISOString(),
  };

  const answer = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { 'content-type': 'application/json' },
    });

  const original = globalThis.fetch;
  vi.stubGlobal(
    'fetch',
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = new URL(
        typeof input === 'string'
          ? input
          : input instanceof Request
            ? input.url
            : input.toString(),
      );
      if (!url.href.startsWith(API)) return original(input, init);
      const method = init?.method ?? 'GET';
      const path = url.pathname.slice('/api'.length);

      if (path === '/user') return answer({ login: 'ds-bot' });
      if (path === repo)
        return answer({
          id: 1,
          name: 'sandbox',
          full_name: 'acme/sandbox',
          private: false,
          default_branch: 'main',
          clone_url: 'https://github.test/acme/sandbox.git',
          permissions: { push: true },
        });
      if (method === 'GET' && path === `${repo}/pulls`)
        return answer([pullJson]);
      if (method === 'GET' && path === `${repo}/pulls/1`)
        return answer(pullJson);
      if (method === 'GET' && path.startsWith(`${repo}/pulls/1/files`))
        return answer(changedFiles.map((filename) => ({ filename })));
      if (method === 'GET' && /\/commits\/[^/]+\/check-runs/u.test(path))
        return answer({
          check_runs: [
            {
              id: 101,
              name: 'build-and-test',
              status: 'completed',
              conclusion: 'success',
            },
          ],
        });
      if (method === 'GET' && path === `${repo}/actions/runs`)
        return answer({ workflow_runs: [] });
      if (method === 'GET' && /\/commits\/[^/]+\/status$/u.test(path))
        return answer({ state: 'success', statuses: [] });
      if (method === 'PUT' && path === `${repo}/pulls/1/merge`)
        return answer({
          sha: 'merged-sha-123',
          merged: true,
          message: 'Pull Request successfully merged',
        });
      return answer({ message: 'Not Found' }, 404);
    },
  );
  return { pullJson };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

test('evaluates 7 autopilot conditions and merges when eligible', async ({
  testApp,
  app,
}) => {
  const HEAD_SHA = 'sha-head-auto-1';
  fakeGitHub(HEAD_SHA, ['src/index.ts']);

  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const conn = app.container.resolve(databaseManagerToken).connection();

  const gitConnRes = await admin.fetch(
    '/git/connections',
    json({ name: 'GitHub', token: TOKEN, apiBaseUrl: API }),
  );
  const gitConnection = ((await gitConnRes.json()) as { data: { id: string } })
    .data;

  const repoRes = await admin.fetch(
    '/git/repositories',
    json({ connectionId: gitConnection.id, repo: 'acme/sandbox' }),
  );
  const repository = ((await repoRes.json()) as { data: { id: string } }).data;

  const projRes = await admin.fetch(
    '/projects',
    json({ name: 'Sandbox Autopilot' }),
  );
  const project = ((await projRes.json()) as { data: { id: string } }).data;

  await admin.fetch(
    `/projects/${project.id}/codeLocations`,
    json({ repositoryId: repository.id }),
  );

  const git = app.container.resolve(gitServiceToken);
  await git.syncRepository(repository.id);

  const pullRequests = await git.listPullRequests();
  expect(pullRequests.length).toBeGreaterThan(0);
  const pullRequest = pullRequests[0];

  // Create issue in in_progress then move to in_review with acceptance
  const issueRes = await admin.fetch(
    '/projects/issues',
    json({
      title: 'Autopilot Test Issue',
      projectId: project.id,
      statusKey: 'in_progress',
      description: 'Task description',
    }),
  );
  const issue = ((await issueRes.json()) as { data: { id: string } }).data;

  // Set status in_review, acceptance report and attach PR to issue
  await conn.query
    .updateTable('pmIssues')
    .set({
      statusKey: 'in_review',
      acceptance: '## Kết quả bàn giao\nĐã test xong và sẵn sàng.',
      needsYou: null,
    })
    .where('id', '=', issue.id)
    .execute();

  await conn.query
    .updateTable('dsPullRequests')
    .set({
      issueId: issue.id,
      ciState: 'passed',
      mergeability: 'clean',
    })
    .where('id', '=', pullRequest.id)
    .execute();

  // Insert structured review
  const reviews = app.container.resolve(reviewsServiceToken);
  await conn.query
    .insertInto('dsReviews')
    .values({
      id: 'rev-auto-1',
      pullRequestId: pullRequest.id,
      issueId: issue.id,
      headSha: HEAD_SHA,
      reviewerAgentId: 'agent-reviewer-1',
      reviewerRunId: 'run-review-1',
      authorAgentId: 'agent-author-1',
      verdict: 'approve',
      mustFix: 0,
      shouldFix: 0,
      kind: 'code',
      sameModel: false,
      checklist: JSON.stringify({ tests: true }),
      summary: 'Review approved',
      createdAt: new Date(),
    })
    .execute();

  // Create autopilot evaluator
  const evaluator = createAutopilotEvaluator({
    database: app.container.resolve(databaseManagerToken),
    git: () => git,
    reviews: () => reviews,
  });

  // 1. Initially autopilot is disabled -> eligible: false
  const eval1 = await evaluator.evaluate(issue.id);
  expect(eval1.eligible).toBe(false);
  expect(eval1.reasons.some((r) => r.includes('not enabled'))).toBe(true);

  // 2. Enable autopilot for project
  await evaluator.saveSettings(project.id, {
    enabled: true,
    mergeMethod: 'squash',
    stallMinutes: 30,
    sensitivePolicy: 'extraReview',
  });

  // Now eligible: true!
  const eval2 = await evaluator.evaluate(issue.id);
  expect(eval2.eligible).toBe(true);
  expect(eval2.reasons).toHaveLength(0);

  // 3. Test condition: paused project
  await evaluator.saveSettings(project.id, {
    enabled: true,
    pausedReason: 'Maintenance in progress',
  });
  const evalPaused = await evaluator.evaluate(issue.id);
  expect(evalPaused.eligible).toBe(false);
  expect(evalPaused.reasons.some((r) => r.includes('paused'))).toBe(true);
  await evaluator.saveSettings(project.id, {
    enabled: true,
    pausedReason: null,
  });

  // 4. Test condition: issue has needsYou
  await conn.query
    .updateTable('pmIssues')
    .set({ needsYou: 'Waiting for stakeholder decision' })
    .where('id', '=', issue.id)
    .execute();
  const evalNeedsYou = await evaluator.evaluate(issue.id);
  expect(evalNeedsYou.eligible).toBe(false);
  expect(evalNeedsYou.reasons.some((r) => r.includes('needsYou'))).toBe(true);
  await conn.query
    .updateTable('pmIssues')
    .set({ needsYou: null })
    .where('id', '=', issue.id)
    .execute();

  // 5. Test condition: missing acceptance
  await conn.query
    .updateTable('pmIssues')
    .set({ acceptance: null })
    .where('id', '=', issue.id)
    .execute();
  const evalNoAcceptance = await evaluator.evaluate(issue.id);
  expect(evalNoAcceptance.eligible).toBe(false);
  expect(evalNoAcceptance.reasons.some((r) => r.includes('acceptance'))).toBe(
    true,
  );
  await conn.query
    .updateTable('pmIssues')
    .set({ acceptance: 'Valid acceptance report' })
    .where('id', '=', issue.id)
    .execute();

  // 6. Test condition: CI failed
  await conn.query
    .updateTable('dsPullRequests')
    .set({ ciState: 'failed' })
    .where('id', '=', pullRequest.id)
    .execute();
  const evalCiFailed = await evaluator.evaluate(issue.id);
  expect(evalCiFailed.eligible).toBe(false);
  expect(evalCiFailed.reasons.some((r) => r.includes('CI'))).toBe(true);
  await conn.query
    .updateTable('dsPullRequests')
    .set({ ciState: 'passed' })
    .where('id', '=', pullRequest.id)
    .execute();

  // 7. Test condition: PR conflicts
  await conn.query
    .updateTable('dsPullRequests')
    .set({ mergeability: 'conflicts' })
    .where('id', '=', pullRequest.id)
    .execute();
  const evalConflicts = await evaluator.evaluate(issue.id);
  expect(evalConflicts.eligible).toBe(false);
  expect(evalConflicts.reasons.some((r) => r.includes('mergeability'))).toBe(
    true,
  );
  await conn.query
    .updateTable('dsPullRequests')
    .set({ mergeability: 'clean' })
    .where('id', '=', pullRequest.id)
    .execute();

  // 8. Test condition: sensitive path without security review
  fakeGitHub(HEAD_SHA, ['database/main/migrations/2026110899_test.ts']);
  const evalSensitive = await evaluator.evaluate(issue.id);
  expect(evalSensitive.eligible).toBe(false);
  expect(evalSensitive.reasons.some((r) => r.includes('security'))).toBe(true);

  // Add security review -> becomes eligible again!
  await conn.query
    .insertInto('dsReviews')
    .values({
      id: 'rev-sec-1',
      pullRequestId: pullRequest.id,
      issueId: issue.id,
      headSha: HEAD_SHA,
      reviewerAgentId: 'agent-security-1',
      reviewerRunId: 'run-sec-1',
      authorAgentId: 'agent-author-1',
      verdict: 'approve',
      mustFix: 0,
      shouldFix: 0,
      kind: 'security',
      sameModel: false,
      checklist: JSON.stringify({
        tenantIsolation: true,
        permissionBoundaries: true,
        migrationDown: true,
        dependenciesLicense: true,
        noSecrets: true,
      }),
      summary: 'Security review pass',
      createdAt: new Date(),
    })
    .execute();

  const evalSecPassed = await evaluator.evaluate(issue.id);
  expect(evalSecPassed.eligible).toBe(true);

  // 9. Execute mergeIfEligible
  const mergeResult = await evaluator.mergeIfEligible(issue.id);
  expect(mergeResult.merged).toBe(true);

  // Check audit event was recorded
  const events = await conn.query
    .selectFrom('dsAutopilotEvents')
    .selectAll()
    .where('issueId', '=', issue.id)
    .where('kind', '=', 'merged')
    .execute();
  expect(events.length).toBe(1);

  // Second immediate merge attempt does not duplicate merge
  const secondMerge = await evaluator.mergeIfEligible(issue.id);
  expect(secondMerge.merged).toBe(false);
}, 120_000);
