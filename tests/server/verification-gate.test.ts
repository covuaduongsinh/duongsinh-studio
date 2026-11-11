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
import { createAutopilotEvaluator } from '../../server/autopilot/evaluator.js';

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

const json = (body: unknown, method = 'POST') => ({
  method,
  headers: {
    'content-type': 'application/json',
    origin: 'http://localhost',
    'Idempotency-Key': `${Date.now()}.${randomUUID()}`,
  },
  body: JSON.stringify(body),
});

test(
  'H1b: verification gate, submission, mayMove gate, and autopilot merge requirements',
  { timeout: 180_000 },
  async ({ testApp, app, request }) => {
    const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
    const { container } = app;
    const db = container.resolve(databaseManagerToken);
    const conn = db.connection();

    // 1. Unauthenticated requests
    const unauthGet = await request('/issues/issue-test-1/verifications');
    expect(unauthGet.status).toBe(401);

    const unauthPost = await request(
      '/verifications',
      json({ issueId: 'issue-test-1', headSha: 'sha1', items: [] }),
    );
    expect(unauthPost.status).toBe(401);

    // 2. Chuẩn bị project và issue
    const projectRes = await admin.fetch(
      '/projects',
      json({ name: 'Verification Gate Project' }),
    );
    expect(projectRes.status).toBe(201);
    const project = ((await projectRes.json()) as { data: { id: string } })
      .data;
    const projectId = project.id;

    const issueRes = await admin.fetch(
      '/projects/issues',
      json({
        title: 'Task needing verification',
        projectId,
        description: 'Testing verification gate',
      }),
    );
    expect(issueRes.status).toBe(201);
    const issue = ((await issueRes.json()) as { data: { id: string } }).data;
    const issueId = issue.id;

    // Gán executor là agent
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

    // 3. Kiểm tra cổng mayMove khi CHƯA có tiêu chí nghiệm thu nào
    const kinds = container.resolve(projectsKindsToken);
    const agentKind = kinds.get(AGENT_KIND);
    expect(agentKind).toBeDefined();

    const moveAttemptToReview = {
      issue: {
        id: issueId,
        identifier: 'VG-1',
        executor: { type: AGENT_KIND, id: agentId },
      } as any,
      from: IN_PROGRESS_STATUS,
      to: IN_REVIEW_STATUS,
    };

    // Khi executor là agent: nếu chưa có tiêu chí, mayMove phải từ chối (false)
    const canMoveNoCriteria = await agentKind!.mayMove!(
      conn,
      { type: AGENT_KIND, id: agentId } as any,
      moveAttemptToReview,
    );
    expect(canMoveNoCriteria).toBe(false);

    // Người dùng (human) chuyển thì không bị chặn ở mayMove của AGENT_KIND
    const humanCanMove = await agentKind!.mayMove!(
      conn,
      { type: 'user', id: 'some-user-id' } as any,
      moveAttemptToReview,
    );
    expect(humanCanMove).toBe(true);

    // 4. Thêm tiêu chí nghiệm thu cho issue
    const criteriaRes = await admin.fetch(
      `/issues/${issueId}/criteria`,
      json(
        {
          criteria: [
            {
              text: 'Unit tests pass',
              checkKind: 'test',
              checkValue: 'pnpm test',
            },
            { text: 'CI build passes', checkKind: 'ci' },
            { text: 'Manual verification review', checkKind: 'human' },
          ],
        },
        'PUT',
      ),
    );
    expect(criteriaRes.status).toBe(200);
    const criteria = ((await criteriaRes.json()) as { data: any[] }).data;
    expect(criteria.length).toBe(3);

    const testCriterion = criteria.find((c) => c.checkKind === 'test')!;
    const ciCriterion = criteria.find((c) => c.checkKind === 'ci')!;

    // Vẫn chưa có lượt verification nào -> agent mayMove vẫn phải false
    const canMoveNoVerif = await agentKind!.mayMove!(
      conn,
      { type: AGENT_KIND, id: agentId } as any,
      moveAttemptToReview,
    );
    expect(canMoveNoVerif).toBe(false);

    // 5. Nộp lượt verification ĐẦU TIÊN nhưng thất bại (failed)
    // Giả lập PR đang mở của issue trên headSha1
    const prId = 'pr-1';
    const headSha1 = '1111111111111111111111111111111111111111';
    await conn.query
      .insertInto('dsPullRequests')
      .values({
        id: prId,
        repositoryId: 'repo-1',
        number: 101,
        issueId,
        headBranch: 'feat/test',
        headSha: headSha1,
        baseBranch: 'main',
        state: 'open',
        draft: 0 as any,
        title: 'PR for VG-1',
        url: 'https://github.com/repo/pull/101',
        mergeability: 'mergeable',
        ciState: 'failure',
        checks: JSON.stringify([]),
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .execute();

    const submitFail1 = await admin.fetch(
      '/verifications',
      json({
        issueId,
        headSha: headSha1,
        items: [
          {
            criterionId: testCriterion.id,
            result: 'fail',
            exitCode: 1,
            output: '1 test failed',
          },
          {
            criterionId: ciCriterion.id,
            result: 'pass', // Agent tự khai pass nhưng CI trong dsPullRequests đang failure -> Studio phải tính là fail!
          },
        ],
      }),
    );
    expect(submitFail1.status).toBe(200);
    const verif1 = ((await submitFail1.json()) as { data: any }).data;
    expect(verif1.verification.result).toBe('failed');
    expect(verif1.verification.attempt).toBe(1);

    // Vì kết quả failed -> mayMove vẫn false
    const canMoveFail1 = await agentKind!.mayMove!(
      conn,
      { type: AGENT_KIND, id: agentId } as any,
      moveAttemptToReview,
    );
    expect(canMoveFail1).toBe(false);

    // 6. Nộp lượt verification THỨ HAI tiếp tục thất bại (N = 2)
    // Sau 2 lượt failed liên tiếp, Studio phải tự động chuyển issue sang 'blocked' và ghi needsYou!
    const submitFail2 = await admin.fetch(
      '/verifications',
      json({
        issueId,
        headSha: headSha1,
        items: [
          {
            criterionId: testCriterion.id,
            result: 'fail',
            exitCode: 1,
            output: '1 test failed again',
          },
        ],
      }),
    );
    expect(submitFail2.status).toBe(200);
    const verif2 = ((await submitFail2.json()) as { data: any }).data;
    expect(verif2.verification.result).toBe('failed');
    expect(verif2.verification.attempt).toBe(2);

    // Kiểm tra issue đã bị chuyển sang 'blocked' và có needsYou
    const issueAfterFail2 = await conn.query
      .selectFrom('pmIssues')
      .selectAll()
      .where('id', '=', issueId)
      .executeTakeFirstOrThrow();
    expect(issueAfterFail2.statusKey).toBe('blocked');
    expect(String(issueAfterFail2.needsYou)).toContain('Kiểm chứng');

    // 7. Sửa lỗi, push commit mới lên headSha2, cập nhật PR ciState = 'success'
    const headSha2 = '2222222222222222222222222222222222222222';
    await conn.query
      .updateTable('dsPullRequests')
      .set({
        headSha: headSha2,
        ciState: 'success',
      })
      .where('id', '=', prId)
      .execute();

    // Reset issue về in_progress để test tiếp
    await conn.query
      .updateTable('pmIssues')
      .set({ statusKey: IN_PROGRESS_STATUS })
      .where('id', '=', issueId)
      .execute();

    // Nộp verification đạt (passed) tại headSha2
    const submitPass = await admin.fetch(
      '/verifications',
      json({
        issueId,
        headSha: headSha2,
        items: [
          {
            criterionId: testCriterion.id,
            result: 'pass',
            exitCode: 0,
            output: 'All tests passed',
            durationMs: 1200,
          },
        ],
      }),
    );
    expect(submitPass.status).toBe(200);
    const verifPass = ((await submitPass.json()) as { data: any }).data;
    expect(verifPass.verification.result).toBe('passed');
    expect(verifPass.verification.attempt).toBe(3);

    // 8. Kiểm tra mayMove: Bây giờ verification passed và headSha khớp với PR -> CHO PHÉP (true)!
    const canMoveSuccess = await agentKind!.mayMove!(
      conn,
      { type: AGENT_KIND, id: agentId } as any,
      moveAttemptToReview,
    );
    expect(canMoveSuccess).toBe(true);

    // Giả sử PR bị đẩy commit mới headSha3 nhưng chưa có verification mới:
    await conn.query
      .updateTable('dsPullRequests')
      .set({ headSha: '3333333333333333333333333333333333333333' })
      .where('id', '=', prId)
      .execute();

    // Cổng mayMove phải từ chối vì headSha verification không khớp đầu PR!
    const canMoveShaMismatch = await agentKind!.mayMove!(
      conn,
      { type: AGENT_KIND, id: agentId } as any,
      moveAttemptToReview,
    );
    expect(canMoveShaMismatch).toBe(false);

    // Đưa lại headSha2 để kiểm tra điều kiện merge
    await conn.query
      .updateTable('dsPullRequests')
      .set({ headSha: headSha2 })
      .where('id', '=', prId)
      .execute();

    // 9. Cổng merge của autopilot & stageMergeAllowed
    const evaluator = createAutopilotEvaluator({
      database: db,
      git: () =>
        ({
          pullFiles: async () => ['src/main.ts'],
          mergePullRequest: async () => ({}) as any,
        }) as any,
      reviews: () =>
        ({
          latestFor: async () => null,
        }) as any,
    });

    const stageAllowed = await evaluator.stageMergeAllowed({
      issueId,
      pullRequestId: prId,
    });
    // Với verification đạt tại headSha2 và không có sensitive paths -> allowed = true
    expect(stageAllowed.allowed).toBe(true);

    // Nếu đổi headSha của PR sang sha khác mà chưa verify -> stageMergeAllowed từ chối
    await conn.query
      .updateTable('dsPullRequests')
      .set({ headSha: '9999999999999999999999999999999999999999' })
      .where('id', '=', prId)
      .execute();

    const stageNotAllowed = await evaluator.stageMergeAllowed({
      issueId,
      pullRequestId: prId,
    });
    expect(stageNotAllowed.allowed).toBe(false);
    expect(stageNotAllowed.reason).toContain('Kiểm chứng');
  },
);
