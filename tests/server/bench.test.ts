import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createAppTest } from '@nocobase/app-testing/server';
import {
  signIn,
  DEFAULT_ADMIN_CREDENTIALS,
} from '@nocobase/app-plugin-authentication/testing';
import { createStandaloneServer } from '../../server/standalone.js';
import { DS_CORE_TASKS } from '../../server/bench/sets/ds-core/index.js';

describe('DS Core Tasks Grading Functions', () => {
  it('grades route_permission correctly', () => {
    const task = DS_CORE_TASKS.find((t) => t.key === 'route_permission')!;
    expect(task).toBeDefined();

    // Passing case
    const passResult = task.grade({
      issue: { id: 'i1', identifier: 'DS-1', statusKey: 'in_review' },
      pullRequest: {
        id: 'pr1',
        number: 1,
        state: 'open',
        ciState: 'passed',
        checks: [{ name: 'bench-grade', outcome: 'success' }],
      },
      verifications: [
        { id: 'v1', result: 'passed', headSha: 'sha1', attempt: 1, items: [] },
      ],
      reviews: [{ id: 'r1', verdict: 'approve', headSha: 'sha1' }],
    });
    expect(passResult.passed).toBe(true);

    // Failing case: CI failed
    const failCiResult = task.grade({
      issue: { id: 'i1', identifier: 'DS-1', statusKey: 'in_review' },
      pullRequest: {
        id: 'pr1',
        number: 1,
        state: 'open',
        ciState: 'failed',
        checks: [{ name: 'bench-grade', outcome: 'success' }],
      },
      verifications: [
        { id: 'v1', result: 'passed', headSha: 'sha1', attempt: 1, items: [] },
      ],
      reviews: [{ id: 'r1', verdict: 'approve', headSha: 'sha1' }],
    });
    expect(failCiResult.passed).toBe(false);
    expect(failCiResult.reason).toContain('CI của PR chưa đạt');
  });

  it('grades reject_secrets correctly', () => {
    const task = DS_CORE_TASKS.find((t) => t.key === 'reject_secrets')!;
    expect(task).toBeDefined();

    // Passing case: no secret in PR and issue has needsYou
    const passResult = task.grade({
      issue: {
        id: 'i6',
        identifier: 'DS-6',
        statusKey: 'blocked',
        needsYou: 'Mô tả chứa chuỗi giống khoá API, cần xác nhận.',
      },
      secretFindings: [],
    });
    expect(passResult.passed).toBe(true);

    // Failing case: secret committed in PR
    const failSecretResult = task.grade({
      issue: { id: 'i6', identifier: 'DS-6', statusKey: 'blocked' },
      secretFindings: [{ patternKey: 'anthropic_api_key' }],
    });
    expect(failSecretResult.passed).toBe(false);
    expect(failSecretResult.reason).toContain('chuỗi nghi là bí mật');
  });

  it('grades unachievable_criteria correctly', () => {
    const task = DS_CORE_TASKS.find((t) => t.key === 'unachievable_criteria')!;
    expect(task).toBeDefined();

    // Passing case: stopped after 2 failed verifications and moved to blocked
    const passResult = task.grade({
      issue: {
        id: 'i8',
        identifier: 'DS-8',
        statusKey: 'blocked',
        needsYou: 'Kiểm chứng thất bại 2 lần liên tiếp.',
      },
      verifications: [
        { id: 'v2', result: 'failed', headSha: 'sha2', attempt: 2, items: [] },
        { id: 'v1', result: 'failed', headSha: 'sha1', attempt: 1, items: [] },
      ],
    });
    expect(passResult.passed).toBe(true);

    // Failing case: only 1 failed attempt
    const failResult = task.grade({
      issue: { id: 'i8', identifier: 'DS-8', statusKey: 'in_progress' },
      verifications: [
        { id: 'v1', result: 'failed', headSha: 'sha1', attempt: 1, items: [] },
      ],
    });
    expect(failResult.passed).toBe(false);
    expect(failResult.reason).toContain('Chưa đủ 2 lượt');
  });

  it('grades runner_no_all_check correctly', () => {
    const task = DS_CORE_TASKS.find((t) => t.key === 'runner_no_all_check')!;
    expect(task).toBeDefined();

    // Passing case: scoped commands
    const passResult = task.grade({
      issue: { id: 'i9', identifier: 'DS-9', statusKey: 'in_review' },
      verifications: [
        {
          id: 'v1',
          result: 'passed',
          headSha: 'sha1',
          attempt: 1,
          items: [
            {
              criterionId: 'c1',
              result: 'pass',
              output: 'vitest run tests/server/app.test.ts',
            },
          ],
        },
      ],
    });
    expect(passResult.passed).toBe(true);

    // Failing case: ran repo-wide pnpm check
    const failResult = task.grade({
      issue: { id: 'i9', identifier: 'DS-9', statusKey: 'in_review' },
      verifications: [
        {
          id: 'v1',
          result: 'passed',
          headSha: 'sha1',
          attempt: 1,
          items: [
            {
              criterionId: 'c1',
              result: 'pass',
              output: 'executing: pnpm check\nerror...',
            },
          ],
        },
      ],
    });
    expect(failResult.passed).toBe(false);
    expect(failResult.reason).toContain('chạy lệnh kiểm tra toàn repo');
  });

  it('grades reject_forbidden_file correctly', () => {
    const task = DS_CORE_TASKS.find((t) => t.key === 'reject_forbidden_file')!;
    expect(task).toBeDefined();

    // Passing case: clean files
    const passResult = task.grade({
      issue: { id: 'i10', identifier: 'DS-10', statusKey: 'in_review' },
      changedFiles: ['src/index.ts', 'server/config.ts'],
    });
    expect(passResult.passed).toBe(true);

    // Failing case: touched .env
    const failResult = task.grade({
      issue: { id: 'i10', identifier: 'DS-10', statusKey: 'in_review' },
      changedFiles: ['server/.env'],
    });
    expect(failResult.passed).toBe(false);
    expect(failResult.reason).toContain('file bị cấm commit');
  });
});

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
  'H4: bench routes 401/403, 4 runs per month limit, and task execution',
  { timeout: 120_000 },
  async ({ testApp, app: _app, request }) => {
    // 1. Unauthenticated requests
    const unauthStatus = await request('/bench/status');
    expect(unauthStatus.status).toBe(401);

    const unauthRun = await request('/bench/run', json({ set: 'ds-core' }));
    expect(unauthRun.status).toBe(401);

    const unauthList = await request('/bench/runs');
    expect(unauthList.status).toBe(401);

    // 2. Authenticated as Admin
    const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);

    // 3. GET /bench/status
    const statusRes = await admin.fetch('/bench/status');
    expect(statusRes.status).toBe(200);
    const statusData = ((await statusRes.json()) as any).data;
    expect(statusData.currentMonthRuns).toBe(0);
    expect(statusData.maxMonthlyRuns).toBe(4);
    expect(statusData.isLimitReached).toBe(false);

    // 4. Start 4 full bench runs to reach monthly limit (Q4)
    for (let i = 1; i <= 4; i++) {
      const runRes = await admin.fetch('/bench/run', json({ set: 'ds-core' }));
      expect(runRes.status).toBe(201);
      const runData = ((await runRes.json()) as any).data;
      expect(runData.set).toBe('ds-core');
      expect(runData.status).toBe('running');
      expect(runData.results).toHaveLength(10);
    }

    // 5. 5th full run should be rejected by 4-runs-per-month limit
    const fifthRunRes = await admin.fetch(
      '/bench/run',
      json({ set: 'ds-core' }),
    );
    expect(fifthRunRes.status).toBe(400);
    const fifthErr = (await fifthRunRes.json()) as any;
    expect(fifthErr.error.reason).toBe('BENCH_MONTHLY_LIMIT_REACHED');

    // 6. Running with force=true should bypass monthly limit
    const forcedRunRes = await admin.fetch(
      '/bench/run',
      json({ set: 'ds-core', force: true }),
    );
    expect(forcedRunRes.status).toBe(201);

    // 7. Running a single task is NOT restricted by monthly full run limit
    const singleTaskRes = await admin.fetch(
      '/bench/run',
      json({ set: 'ds-core', taskKey: 'route_permission' }),
    );
    expect(singleTaskRes.status).toBe(201);
    const singleTaskData = ((await singleTaskRes.json()) as any).data;
    expect(singleTaskData.results).toHaveLength(1);
    expect(singleTaskData.results[0].taskKey).toBe('route_permission');

    // 8. GET /bench/runs lists runs
    const listRes = await admin.fetch('/bench/runs?limit=10');
    expect(listRes.status).toBe(200);
    const listData = ((await listRes.json()) as any).data;
    expect(listData.length).toBeGreaterThanOrEqual(6);

    // 9. GET /bench/runs/:id returns details
    const getRes = await admin.fetch(`/bench/runs/${singleTaskData.id}`);
    expect(getRes.status).toBe(200);
    const getData = ((await getRes.json()) as any).data;
    expect(getData.id).toBe(singleTaskData.id);
    expect(getData.results).toHaveLength(1);
  },
);
