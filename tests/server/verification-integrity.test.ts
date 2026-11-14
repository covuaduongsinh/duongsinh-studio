// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import { createAppTest } from '@nocobase/app-testing/server';
import {
  signIn,
  DEFAULT_ADMIN_CREDENTIALS,
} from '@nocobase/app-plugin-authentication/testing';
import { databaseManagerToken } from '@nocobase/db';
import { projectsKindsToken } from '@nocobase/app-plugin-projects/server/tokens';
import {
  IN_REVIEW_STATUS,
  IN_PROGRESS_STATUS,
} from '@nocobase/app-plugin-projects/shared/statuses';
import { AGENT_KIND } from '../../server/agents/ids.js';
import { createStandaloneServer } from '../../server/standalone.js';
import { contradictVerifications } from '../../server/verifications/contradiction.js';
import { verificationReviewProblem } from '../../server/reviews/verification-check.js';

// T2 (plan T): a verification is what the command's exit code says, not what an agent claims, and CI has the last word.
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

const PASSWORD = 'Contributor#2026-pass';
const json = (body: unknown, method = 'POST') => ({
  method,
  headers: {
    'content-type': 'application/json',
    origin: 'http://localhost',
    'Idempotency-Key': `${Date.now()}.${randomUUID()}`,
  },
  body: JSON.stringify(body),
});

const HEAD = '1111111111111111111111111111111111111111';
const NEWER = '2222222222222222222222222222222222222222';

test(
  'T2: exit code decides, the head must match, CI contradicts, and the plan comes from Studio',
  { timeout: 180_000 },
  async ({ testApp, app, request }) => {
    const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
    const conn = app.container.resolve(databaseManagerToken).connection();

    // Anonymous callers get nothing.
    expect((await request('/issues/none/verificationPlan')).status).toBe(401);

    const projectId = (
      (await (
        await admin.fetch('/projects', json({ name: 'Integrity Project' }))
      ).json()) as { data: { id: string } }
    ).data.id;
    const issueId = (
      (await (
        await admin.fetch(
          '/projects/issues',
          json({ title: 'Needs honest verification', projectId }),
        )
      ).json()) as { data: { id: string } }
    ).data.id;
    const agentId = 'ds-project-manager';
    await conn.query
      .updateTable('pmIssues')
      .set({
        executorType: AGENT_KIND,
        executorId: agentId,
        statusKey: IN_PROGRESS_STATUS,
      })
      .where('id', '=', issueId)
      .execute();

    const criteria = (
      (await (
        await admin.fetch(
          `/issues/${issueId}/criteria`,
          json(
            {
              criteria: [
                {
                  text: 'Unit tests',
                  checkKind: 'test',
                  checkValue: 'pnpm exec vitest run a',
                },
                {
                  text: 'Lint',
                  checkKind: 'command',
                  checkValue: 'pnpm exec eslint a',
                },
                { text: 'CI is green', checkKind: 'ci' },
                { text: 'A person looked', checkKind: 'human' },
              ],
            },
            'PUT',
          ),
        )
      ).json()) as { data: { id: string; checkKind: string }[] }
    ).data;
    const idOf = (kind: string) =>
      criteria.find((c) => c.checkKind === kind)!.id;

    await conn.query
      .insertInto('dsPullRequests')
      .values({
        id: 'pr-int-1',
        repositoryId: 'repo-int',
        number: 7,
        issueId,
        headBranch: 'agent/INT-1',
        headSha: HEAD,
        baseBranch: 'main',
        state: 'open',
        draft: 0 as never,
        title: 'PR',
        url: 'https://github.test/x/y/pull/7',
        mergeability: 'clean',
        ciState: 'passed',
        checks: JSON.stringify([]),
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .execute();

    // --- The plan: the commands come from Studio, not from the agent.
    const plan = await admin.fetch(`/issues/${issueId}/verificationPlan`);
    expect(plan.status).toBe(200);
    const planData = ((await plan.json()) as { data: any }).data;
    expect(planData.headSha).toBe(HEAD);
    expect(
      planData.criteria.find((c: any) => c.id === idOf('test')),
    ).toMatchObject({ checkKind: 'test', command: 'pnpm exec vitest run a' });
    expect(
      planData.criteria.find((c: any) => c.id === idOf('ci')).command,
    ).toBeNull();
    // Someone who cannot see the issue is refused.
    expect((await admin.fetch('/issues/missing/verificationPlan')).status).toBe(
      404,
    );
    expect(
      (
        await admin.fetch(
          '/users',
          json({
            name: 'outsider1',
            username: 'outsider1',
            email: 'outsider1@example.test',
            password: PASSWORD,
            roleScopes: { app: [] },
          }),
        )
      ).status,
    ).toBe(201);
    const outsider = await signIn(testApp, {
      username: 'outsider1',
      password: PASSWORD,
    });
    expect([403, 404]).toContain(
      (await outsider.fetch(`/issues/${issueId}/verificationPlan`)).status,
    );
    expect([403, 404]).toContain(
      (
        await outsider.fetch(
          '/verifications',
          json({ issueId, headSha: HEAD, items: [] }),
        )
      ).status,
    );

    const submit = (headSha: string, items: unknown[]) =>
      admin.fetch('/verifications', json({ issueId, headSha, items }));

    // --- A test or command item without an exit code is refused, even with a claimed result.
    const noExit = await submit(HEAD, [
      { criterionId: idOf('test'), result: 'pass', output: 'ok' },
    ]);
    expect(noExit.status).toBe(400);
    expect(((await noExit.json()) as any).error.reason).toBe(
      'EXIT_CODE_REQUIRED',
    );
    const nullExit = await submit(HEAD, [
      { criterionId: idOf('command'), exitCode: null, output: 'ok' },
    ]);
    expect(nullExit.status).toBe(400);
    // Nothing was recorded by the refused submissions.
    const none = await conn.query
      .selectFrom('dsVerifications')
      .select('id')
      .where('issueId', '=', issueId)
      .execute();
    expect(none).toHaveLength(0);

    // --- The result follows the exit code: a claimed `pass` with exit code 1 fails, and the other way round.
    const lying = await submit(HEAD, [
      { criterionId: idOf('test'), result: 'pass', exitCode: 1, output: 'x' },
      {
        criterionId: idOf('command'),
        result: 'fail',
        exitCode: 0,
        output: 'y',
      },
      { criterionId: idOf('human'), result: 'pass' },
    ]);
    expect(lying.status).toBe(200);
    const lyingData = ((await lying.json()) as { data: any }).data;
    expect(lyingData.verification.result).toBe('failed');
    const byCriterion = (items: any[], id: string) =>
      items.find((i) => i.criterionId === id);
    expect(byCriterion(lyingData.items, idOf('test')).result).toBe('fail');
    expect(byCriterion(lyingData.items, idOf('command')).result).toBe('pass');

    // --- A submission for a head other than the open pull request's is not counted at all.
    const before = (
      await conn.query
        .selectFrom('dsVerifications')
        .select('id')
        .where('issueId', '=', issueId)
        .execute()
    ).length;
    const stale = await submit(NEWER, [
      { criterionId: idOf('test'), exitCode: 0, output: 'ok' },
    ]);
    expect(stale.status).toBe(400);
    expect(((await stale.json()) as any).error.reason).toBe('STALE_HEAD');
    expect(
      (
        await conn.query
          .selectFrom('dsVerifications')
          .select('id')
          .where('issueId', '=', issueId)
          .execute()
      ).length,
    ).toBe(before);

    // --- A real pass: the CI criterion reads the stored `passed` state (not only the legacy `success`).
    const good = await submit(HEAD, [
      {
        criterionId: idOf('test'),
        exitCode: 0,
        output: 'green',
        durationMs: 5,
      },
      { criterionId: idOf('command'), exitCode: 0, output: 'clean' },
      { criterionId: idOf('human'), result: 'pass' },
    ]);
    expect(good.status).toBe(200);
    const goodData = ((await good.json()) as { data: any }).data;
    expect(byCriterion(goodData.items, idOf('ci')).result).toBe('pass');
    expect(goodData.verification.result).toBe('passed');

    const agentKind = app.container
      .resolve(projectsKindsToken)
      .get(AGENT_KIND)!;
    const move = {
      issue: {
        id: issueId,
        identifier: 'INT-1',
        executor: { type: AGENT_KIND, id: agentId },
      } as never,
      from: IN_PROGRESS_STATUS,
      to: IN_REVIEW_STATUS,
    };
    const actor = { type: AGENT_KIND, id: agentId } as never;
    expect(await agentKind.mayMove!(conn, actor, move)).toBe(true);

    // --- CI turns red on the very head that was verified: the verification becomes `contradicted`, the move is refused.
    expect(await contradictVerifications(conn, issueId, NEWER)).toBe(0);
    expect(await contradictVerifications(conn, issueId, HEAD)).toBe(1);
    const row = await conn.query
      .selectFrom('dsVerifications')
      .selectAll()
      .where('id', '=', goodData.verification.id)
      .executeTakeFirstOrThrow();
    expect(row.result).toBe('contradicted');
    expect(row.contradictedBy).toBe('ci');
    expect(row.contradictedAt).toBeTruthy();
    expect(await agentKind.mayMove!(conn, actor, move)).toBe(false);
    // Said again, it changes nothing.
    expect(await contradictVerifications(conn, issueId, HEAD)).toBe(0);

    // The list shows it with its new result.
    const list = (await (
      await admin.fetch(`/issues/${issueId}/verifications`)
    ).json()) as { data: { id: string; result: string }[] };
    expect(
      list.data.find((v) => v.id === goodData.verification.id)?.result,
    ).toBe('contradicted');
  },
);

test('T2: a review approves only after the verification output was read, and never over a contradicted one', () => {
  const ok = {
    result: 'passed',
    items: [{ checkKind: 'test', exitCode: 0 }],
  };
  // No verification, or none with test/command items: nothing to read.
  expect(verificationReviewProblem(null, 'approve', {})).toBeNull();
  expect(
    verificationReviewProblem(
      { result: 'passed', items: [{ checkKind: 'ci', exitCode: null }] },
      'approve',
      {},
    ),
  ).toBeNull();
  // Approving without the checklist entry is refused; with it, accepted.
  expect(verificationReviewProblem(ok, 'approve', {})).toBe(
    'VERIFICATION_OUTPUT_NOT_REVIEWED',
  );
  expect(
    verificationReviewProblem(ok, 'approve', {
      verificationOutputReviewed: 'yes',
    }),
  ).toBe('VERIFICATION_OUTPUT_NOT_REVIEWED');
  expect(
    verificationReviewProblem(ok, 'approve', {
      verificationOutputReviewed: true,
    }),
  ).toBeNull();
  // A review asking for changes needs no such proof.
  expect(verificationReviewProblem(ok, 'changes', {})).toBeNull();
  // A contradicted verification can never be approved over.
  expect(
    verificationReviewProblem({ ...ok, result: 'contradicted' }, 'approve', {
      verificationOutputReviewed: true,
    }),
  ).toBe('VERIFICATION_CONTRADICTED');
});
