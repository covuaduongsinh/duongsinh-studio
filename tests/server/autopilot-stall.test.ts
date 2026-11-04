import { expect, vi } from 'vitest';
import { createAppTest } from '@nocobase/app-testing/server';
import {
  signIn,
  DEFAULT_ADMIN_CREDENTIALS,
} from '@nocobase/app-plugin-authentication/testing';
import { databaseManagerToken } from '@nocobase/db';
import { createAutopilotEvaluator } from '../../server/autopilot/evaluator.js';
import {
  createAutopilotStallDetector,
} from '../../server/autopilot/stall.js';
import { createStandaloneServer } from '../../server/standalone.js';
import { PROJECT_MANAGER_AGENT_ID } from '../../server/autopilot/scheduler.js';

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

test(
  'Autopilot Stall Detector: detect idle in_progress issues, wake project manager, escalate to blocked after 2 consecutive stalls, and handle toolQuota',
  { timeout: 120_000 },
  async ({ testApp, app }) => {
    await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
    const ownerUserId = 'user-admin';
    const db = app.container.resolve(databaseManagerToken);
    const conn = db.connection();

    const evaluator = createAutopilotEvaluator({
      database: db,
      git: () => ({ listPullRequests: vi.fn().mockResolvedValue([]) } as any),
      reviews: () => ({ latestFor: vi.fn().mockResolvedValue(null) } as any),
    });

    const enqueueMock = vi.fn().mockResolvedValue({ id: 'woken-run-1' });
    const retryMock = vi.fn().mockResolvedValue({ id: 'retried-run-1' });
    const notifyMock = vi.fn().mockResolvedValue(undefined);

    const stallDetector = createAutopilotStallDetector({
      database: db,
      evaluator,
      agents: {
        runs: {
          enqueue: enqueueMock,
          retry: retryMock,
        },
      },
      notify: notifyMock,
      owners: async () => [ownerUserId],
    });

    const projectId = 'proj-stall-test';
    await evaluator.saveSettings(projectId, {
      enabled: true,
      stallMinutes: 30,
    });

    const now = new Date();
    const staleTime = new Date(now.getTime() - 40 * 60 * 1000); // 40 minutes ago (> 30m)
    const freshTime = new Date(now.getTime() - 10 * 60 * 1000); // 10 minutes ago (< 30m)

    // Setup Runner with unpushed workspaces
    await conn.query
      .insertInto('agRunners')
      .values({
        id: 'runner-stall-1',
        name: 'Runner Alpha',
        hostname: 'runner-alpha.local',
        os: 'linux',
        arch: 'x64',
        version: '1.0.0',
        protocolVersion: 1,
        status: 'online',
        slots: 1,
        acceptJobs: true,
        workspaceUsage: JSON.stringify({ unpushedCount: 2 }),
        createdAt: now,
        updatedAt: now,
      })
      .execute();

    // Setup Issues:
    // 1. Issue with active run (running) -> NOT stalled
    const activeIssueId = 'issue-active-run';
    // 2. Issue with recent activity (10m ago) -> NOT stalled
    const freshIssueId = 'issue-fresh-activity';
    // 3. Stalled issue (40m ago, no active runs) -> STALLED (1st time)
    const stalledIssueId = 'issue-stalled-candidate';

    await conn.query
      .insertInto('pmIssues')
      .values([
        {
          id: activeIssueId,
          number: 201,
          identifier: 'STALL-201',
          title: 'Active issue',
          description: 'Has running task',
          statusKey: 'in_progress',
          priorityRank: 2,
          ownerUserId,
          projectId,
          createdAt: staleTime,
          updatedAt: staleTime,
          lastActivityAt: staleTime,
        },
        {
          id: freshIssueId,
          number: 202,
          identifier: 'STALL-202',
          title: 'Fresh issue',
          description: 'Worked on recently',
          statusKey: 'in_progress',
          priorityRank: 2,
          ownerUserId,
          projectId,
          createdAt: freshTime,
          updatedAt: freshTime,
          lastActivityAt: freshTime,
        },
        {
          id: stalledIssueId,
          number: 203,
          identifier: 'STALL-203',
          title: 'Stalled issue',
          description: 'Idle for 40 minutes',
          statusKey: 'in_progress',
          priorityRank: 1,
          ownerUserId,
          projectId,
          createdAt: staleTime,
          updatedAt: staleTime,
          lastActivityAt: staleTime,
        },
      ])
      .execute();

    // Create an active run for activeIssueId
    await conn.query
      .insertInto('agRuns')
      .values({
        id: 'run-active-1',
        agentId: PROJECT_MANAGER_AGENT_ID,
        agentType: 'runner',
        status: 'running',
        subjectKind: 'issue',
        subjectId: activeIssueId,
        threadScope: 'default',
        actorUserId: ownerUserId,
        requires: '[]',
        acceptsInput: false,
        createdAt: freshTime,
        updatedAt: freshTime,
      })
      .execute();

    // 1. First stall scan
    const firstScan = await stallDetector.detectAndHandleStalls(projectId);
    expect(firstScan.stalledCount).toBe(1);
    expect(firstScan.blockedCount).toBe(0);
    expect(firstScan.stalledIssueIds).toEqual([stalledIssueId]);

    // Verify Project Manager agent was woken with stalled trigger and unpushed runner info
    expect(enqueueMock).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: PROJECT_MANAGER_AGENT_ID,
        subject: { kind: 'issue', id: stalledIssueId },
        input: expect.objectContaining({
          payload: expect.objectContaining({
            trigger: 'autopilot.stalled',
            issueId: stalledIssueId,
            unpushedOn: expect.arrayContaining(['Runner Alpha']),
          }),
        }),
      }),
    );

    // Verify comment posted on issue
    const comments = await conn.query
      .selectFrom('pmComments')
      .selectAll()
      .where('issueId', '=', stalledIssueId)
      .execute();
    expect(comments.length).toBeGreaterThan(0);
    expect(comments[0].content).toContain('Phát hiện công việc có dấu hiệu bị đứng');

    // Verify audit event 'stalled' recorded
    let events = await evaluator.listEvents({ projectId, limit: 10 });
    const stallEvent = events.find((e) => e.kind === 'stalled' && e.issueId === stalledIssueId);
    expect(stallEvent).toBeDefined();

    // Issue still remains 'in_progress' after 1st stall
    let issueRow = await conn.query
      .selectFrom('pmIssues')
      .selectAll()
      .where('id', '=', stalledIssueId)
      .executeTakeFirst();
    expect(issueRow?.statusKey).toBe('in_progress');
    expect(issueRow?.needsYou).toBeNull();

    // 2. Second stall scan without progress -> 2nd consecutive stall -> escalate to 'blocked'
    enqueueMock.mockClear();
    const secondScan = await stallDetector.detectAndHandleStalls(projectId);
    expect(secondScan.stalledCount).toBe(0);
    expect(secondScan.blockedCount).toBe(1);
    expect(secondScan.blockedIssueIds).toEqual([stalledIssueId]);

    // Verify issue escalated to blocked and marked with needsYou
    issueRow = await conn.query
      .selectFrom('pmIssues')
      .selectAll()
      .where('id', '=', stalledIssueId)
      .executeTakeFirst();
    expect(issueRow?.statusKey).toBe('blocked');
    expect(issueRow?.needsYou).toContain('Tự lái: Phát hiện việc bị đứng 2 lần liên tiếp');

    // Verify Inbox notification was sent to owners
    expect(notifyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: [ownerUserId],
        title: expect.stringContaining('Cần tôi quyết định'),
      }),
    );

    // Verify audit event 'blocked' recorded
    events = await evaluator.listEvents({ projectId, limit: 10 });
    const blockedEvent = events.find((e) => e.kind === 'blocked' && e.issueId === stalledIssueId);
    expect(blockedEvent).toBeDefined();

    // 3. Test toolQuota handling: backoff, concurrency throttle, and delayed retry
    const quotaIssueId = 'issue-quota-test';
    await conn.query
      .insertInto('pmIssues')
      .values({
        id: quotaIssueId,
        number: 204,
        identifier: 'STALL-204',
        title: 'Quota limited issue',
        description: 'Failed with toolQuota',
        statusKey: 'in_progress',
        priorityRank: 1,
        ownerUserId,
        projectId,
        createdAt: now,
        updatedAt: now,
        lastActivityAt: now,
      })
      .execute();

    const quotaResult = await stallDetector.handleQuotaFailure(projectId, quotaIssueId, {
      runId: 'run-quota-1',
      failureReason: 'toolQuota',
      message: 'Claude Max hourly rate limit exceeded',
    });

    expect(quotaResult.throttled).toBe(true);
    expect(quotaResult.retryDelayMs).toBeGreaterThanOrEqual(30 * 60 * 1000); // at least 30m
    expect(quotaResult.effectiveConcurrency).toBe(1); // reduced to 1
  },
);
