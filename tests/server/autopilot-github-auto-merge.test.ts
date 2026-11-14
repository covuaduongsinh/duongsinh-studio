// @vitest-environment node
import { createAppTest } from '@nocobase/app-testing/server';
import {
  signIn,
  DEFAULT_ADMIN_CREDENTIALS,
} from '@nocobase/app-plugin-authentication/testing';
import { databaseManagerToken } from '@nocobase/db';
import { expect } from 'vitest';
import { createAutopilotEvaluator } from '../../server/autopilot/evaluator.js';

// S2 (plan S): a ready pull request is merged directly; GitHub's auto-merge is asked for only while the checks run, and
// is switched off again when what it was told to merge changes.
const test = createAppTest({
  createServer: (await import('../../server/standalone.js'))
    .createStandaloneServer,
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

const json = (body: unknown) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: 'http://localhost' },
  body: JSON.stringify(body),
});

test(
  'S2: merges a clean pull request directly, asks GitHub only while checks run, and turns it off when the head changes or an evaluation fails',
  { timeout: 180_000 },
  async ({ testApp, app }) => {
    const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
    const conn = app.container.resolve(databaseManagerToken).connection();
    const projectId = (
      (await (await admin.fetch('/projects', json({ name: 'S2' }))).json()) as {
        data: { id: string };
      }
    ).data.id;
    const issueId = (
      (await (
        await admin.fetch(
          '/projects/issues',
          json({ title: 'S2', projectId, statusKey: 'in_progress' }),
        )
      ).json()) as { data: { id: string } }
    ).data.id;
    await conn.query
      .updateTable('pmIssues')
      .set({ statusKey: 'in_review', acceptance: '## Kết quả\nXong.' })
      .where('id', '=', issueId)
      .execute();

    const pull = {
      id: 'pr-s2',
      state: 'open',
      number: 3,
      draft: false,
      mergeability: 'blocked',
      mergeBlocker: 'ciPending',
      ciState: 'pending',
      headSha: 'sha-one-1234',
    };
    const calls: string[] = [];
    const git = {
      listPullRequests: async () => [pull],
      pullFiles: async () => ['src/a.ts'],
      readBranchProtection: async () => ({ status: 'read', verdict: 'ok' }),
      enableAutoMerge: async (id: string) => {
        calls.push(`enable:${id}`);
        return pull;
      },
      disableAutoMerge: async (id: string) => {
        calls.push(`disable:${id}`);
      },
      mergePullRequest: async (id: string) => {
        calls.push(`merge:${id}`);
        return pull;
      },
    };
    const approve = async (headSha: string) => {
      await conn.query
        .insertInto('dsReviews')
        .values({
          id: `rev-${headSha}`,
          pullRequestId: pull.id,
          issueId,
          headSha,
          reviewerAgentId: 'reviewer',
          reviewerRunId: `run-${headSha}`,
          authorAgentId: 'author',
          verdict: 'approve',
          mustFix: 0,
          shouldFix: 0,
          kind: 'code',
          sameModel: false,
          checklist: JSON.stringify({ tests: true }),
          summary: 'ok',
          createdAt: new Date(),
        })
        .execute();
      await conn.query
        .insertInto('dsVerifications')
        .values({
          id: `ver-${headSha}`,
          issueId,
          runId: `vrun-${headSha}`,
          agentId: 'author',
          headSha,
          attempt: 1,
          result: 'passed',
          createdAt: new Date(),
        })
        .execute();
    };
    await approve('sha-one-1234');
    const evaluator = createAutopilotEvaluator({
      database: app.container.resolve(databaseManagerToken),
      git: () => git as never,
      reviews: () =>
        ({
          latestFor: async (_pr: string, headSha: string) => {
            const row = await conn.query
              .selectFrom('dsReviews')
              .selectAll()
              .where('headSha', '=', headSha)
              .executeTakeFirst();
            return row
              ? {
                  id: row.id,
                  verdict: row.verdict,
                  mustFix: Number(row.mustFix),
                  reviewerAgentId: row.reviewerAgentId,
                  authorAgentId: row.authorAgentId,
                  createdAt: new Date(String(row.createdAt)),
                }
              : null;
          },
        }) as never,
    });
    await evaluator.saveSettings(projectId, {
      enabled: true,
      mergeMethod: 'squash',
      stallMinutes: 30,
      sensitivePolicy: 'extraReview',
      autoMergeOnGithub: true,
    });

    // Checks still running: GitHub is asked once, and not again for the same head.
    const waiting = await evaluator.evaluate(issueId);
    expect(waiting.waitingOnChecks).toBe(true);
    await evaluator.mergeIfEligible(issueId);
    await evaluator.mergeIfEligible(issueId);
    expect(calls).toEqual(['enable:pr-s2']);

    // A new head: auto-merge is turned off, and not turned on again without a review of the new head.
    pull.headSha = 'sha-two-5678';
    await evaluator.mergeIfEligible(issueId);
    expect(calls).toEqual(['enable:pr-s2', 'disable:pr-s2']);
    const kinds = (
      await conn.query
        .selectFrom('dsAutopilotEvents')
        .select('kind')
        .where('issueId', '=', issueId)
        .orderBy('createdAt', 'asc')
        .execute()
    ).map((row) => row.kind);
    expect(kinds).toEqual(['autoMergeOn', 'autoMergeOff']);

    // The new head is reviewed and still running: on again; then the checks fail: off again.
    await approve('sha-two-5678');
    await evaluator.mergeIfEligible(issueId);
    expect(calls.at(-1)).toBe('enable:pr-s2');
    pull.ciState = 'failure';
    pull.mergeBlocker = 'ciFailed';
    await evaluator.mergeIfEligible(issueId);
    expect(calls.at(-1)).toBe('disable:pr-s2');

    // Ready (clean, checks passed): merged directly, even with the GitHub option on, and GitHub is not asked.
    pull.ciState = 'success';
    pull.mergeBlocker = null as never;
    pull.mergeability = 'clean';
    const before = calls.length;
    const result = await evaluator.mergeIfEligible(issueId);
    expect(result.merged).toBe(true);
    expect(calls.slice(before)).toEqual(['merge:pr-s2']);
  },
);
