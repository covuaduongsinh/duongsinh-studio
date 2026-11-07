import { expect, vi } from 'vitest';
import { createAppTest } from '@nocobase/app-testing/server';
import {
  signIn,
  DEFAULT_ADMIN_CREDENTIALS,
} from '@nocobase/app-plugin-authentication/testing';
import { databaseManagerToken } from '@nocobase/db';
import { createAutopilotEvaluator } from '../../server/autopilot/evaluator.js';
import {
  createAutopilotScheduler,
  PROJECT_MANAGER_AGENT_ID,
} from '../../server/autopilot/scheduler.js';
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

test(
  'Autopilot Scheduler: auto-start flags, dependency blocking, capacity and next issue scheduling',
  { timeout: 120_000 },
  async ({ testApp, app }) => {
    await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
    const ownerUserId = 'user-admin';
    const db = app.container.resolve(databaseManagerToken);
    const conn = db.connection();

    // Setup evaluator & scheduler
    const evaluator = createAutopilotEvaluator({
      database: db,
      git: () => ({ listPullRequests: vi.fn().mockResolvedValue([]) }) as any,
      reviews: () => ({ latestFor: vi.fn().mockResolvedValue(null) }) as any,
    });

    const enqueueMock = vi.fn().mockResolvedValue({ id: 'run-1' });
    const scheduler = createAutopilotScheduler({
      database: db,
      evaluator,
      agents: {
        runs: {
          enqueue: enqueueMock,
        },
      },
    });

    const projectId = 'proj-scheduler-test';
    const now = new Date();

    // 1. Setup project settings
    await evaluator.saveSettings(projectId, {
      enabled: true,
      maxActiveIssues: 2,
    });

    // 2. Test setIssueFlag and getIssueFlag
    await scheduler.setIssueFlag('issue-flag-test-1', {
      allowAutoStart: true,
      inheritFromParent: false,
    });
    const flag1 = await scheduler.getIssueFlag('issue-flag-test-1');
    expect(flag1).not.toBeNull();
    expect(flag1?.allowAutoStart).toBe(true);
    expect(flag1?.inheritFromParent).toBe(false);

    // 3. Test flag inheritance: child inherits from parent epic
    const epicId = 'epic-parent-1';
    const childId = 'child-issue-1';
    const childNoFlagId = 'child-issue-orphan';

    await conn.query
      .insertInto('pmIssues')
      .values([
        {
          id: epicId,
          number: 100,
          identifier: 'TEST-100',
          title: 'Epic feature',
          description: 'Epic description',
          statusKey: 'in_progress',
          priorityRank: 1,
          ownerUserId,
          projectId,
          createdAt: now,
          updatedAt: now,
          lastActivityAt: now,
        },
        {
          id: childId,
          number: 101,
          identifier: 'TEST-101',
          title: 'Child subtask',
          description: 'Child description',
          statusKey: 'backlog',
          priorityRank: 2,
          ownerUserId,
          parentIssueId: epicId,
          projectId,
          createdAt: now,
          updatedAt: now,
          lastActivityAt: now,
        },
        {
          id: childNoFlagId,
          number: 102,
          identifier: 'TEST-102',
          title: 'Manual issue without flag',
          description: 'Manual',
          statusKey: 'backlog',
          priorityRank: 2,
          ownerUserId,
          projectId,
          createdAt: now,
          updatedAt: now,
          lastActivityAt: now,
        },
      ])
      .execute();

    // Before setting epic flag: both childId and childNoFlagId are not eligible
    expect(await scheduler.isIssueEligibleForAutoStart(childId)).toBe(false);
    expect(await scheduler.isIssueEligibleForAutoStart(childNoFlagId)).toBe(
      false,
    );

    // Give epic the auto-start flag
    await scheduler.setIssueFlag(epicId, {
      allowAutoStart: true,
      inheritFromParent: false,
    });

    // Now childId inherits allowAutoStart from epic
    expect(await scheduler.isIssueEligibleForAutoStart(childId)).toBe(true);
    // Orphan issue still false
    expect(await scheduler.isIssueEligibleForAutoStart(childNoFlagId)).toBe(
      false,
    );

    // 4. Test priority ranking and dependencies
    // Setup Issue A (blocker) and Issue B (blocked by A)
    const blockerId = 'issue-blocker-a';
    const blockedId = 'issue-blocked-b';
    const urgentId = 'issue-urgent-c';

    await conn.query
      .insertInto('pmIssues')
      .values([
        {
          id: blockerId,
          number: 103,
          identifier: 'TEST-103',
          title: 'Blocker task',
          description: 'Must finish first',
          statusKey: 'in_progress',
          priorityRank: 2,
          ownerUserId,
          projectId,
          createdAt: new Date(now.getTime() - 10000),
          updatedAt: now,
          lastActivityAt: now,
        },
        {
          id: blockedId,
          number: 104,
          identifier: 'TEST-104',
          title: 'Blocked task',
          description: 'Waits for blocker',
          statusKey: 'backlog',
          priorityRank: 1, // higher priority than blocker
          ownerUserId,
          projectId,
          createdAt: new Date(now.getTime() - 5000),
          updatedAt: now,
          lastActivityAt: now,
        },
        {
          id: urgentId,
          number: 105,
          identifier: 'TEST-105',
          title: 'Urgent independent task',
          description: 'Urgent',
          statusKey: 'backlog',
          priorityRank: 0, // urgent
          ownerUserId,
          projectId,
          createdAt: now,
          updatedAt: now,
          lastActivityAt: now,
        },
      ])
      .execute();

    // Link: blockedId blockedBy blockerId
    await conn.query
      .insertInto('pmIssueDependencies')
      .values({
        id: 'dep-1',
        issueId: blockedId,
        dependsOnIssueId: blockerId,
        type: 'blockedBy',
        createdByType: 'user',
        createdById: ownerUserId,
        createdAt: now,
      })
      .execute();

    // Enable auto-start for all 3
    await scheduler.setIssueFlag(blockerId, { allowAutoStart: true });
    await scheduler.setIssueFlag(blockedId, { allowAutoStart: true });
    await scheduler.setIssueFlag(urgentId, { allowAutoStart: true });

    // When blockerId is 'in_progress':
    // blockedId is NOT ready. Candidates should be: urgentId (priority 0) and childId (priority 2)
    let candidates = await scheduler.listCandidates(projectId);
    const candidateIds = candidates.map((c) => c.id);
    expect(candidateIds).toContain(urgentId);
    expect(candidateIds).toContain(childId);
    expect(candidateIds).not.toContain(blockedId); // blocked
    expect(candidateIds).not.toContain(childNoFlagId); // no flag

    // Urgent should be first
    expect(candidates[0].id).toBe(urgentId);

    // 5. Test openNext respecting capacity
    // Currently in_progress: epicId (1), blockerId (1) => currentInProgress = 2
    // maxActiveIssues = 2 => availableSlots = 0 => openNext opens 0
    let openResult = await scheduler.openNext(projectId);
    expect(openResult.openedCount).toBe(0);

    // Now complete epicId: statusKey -> 'done'
    await conn.query
      .updateTable('pmIssues')
      .set({ statusKey: 'done' })
      .where('id', '=', epicId)
      .execute();

    // in_progress = 1 (blockerId), capacity = 2 => availableSlots = 1
    // openNext should open exactly 1 issue: urgentId
    openResult = await scheduler.openNext(projectId);
    expect(openResult.openedCount).toBe(1);
    expect(openResult.openedIssueIds).toEqual([urgentId]);

    // Verify urgentId updated to in_progress with project manager agent
    const urgentRow = await conn.query
      .selectFrom('pmIssues')
      .selectAll()
      .where('id', '=', urgentId)
      .executeTakeFirst();
    expect(urgentRow?.statusKey).toBe('in_progress');
    expect(urgentRow?.executorType).toBe('agent');
    expect(urgentRow?.executorId).toBe(PROJECT_MANAGER_AGENT_ID);

    // Verify comment created
    const comments = await conn.query
      .selectFrom('pmComments')
      .selectAll()
      .where('issueId', '=', urgentId)
      .execute();
    expect(comments.length).toBeGreaterThan(0);
    expect(comments[0].content).toContain('Tự lái đã tự động mở công việc này');

    // Verify agent run enqueued
    expect(enqueueMock.mock.calls[0]?.[0]).toMatchObject({
      input: { type: 'custom' },
    });
    expect(enqueueMock).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: PROJECT_MANAGER_AGENT_ID,
        subject: { kind: 'issue', id: urgentId },
      }),
    );

    // Verify audit event recorded
    const events = await evaluator.listEvents({ projectId, limit: 10 });
    const openEvent = events.find(
      (e) => e.kind === 'opened' && e.issueId === urgentId,
    );
    expect(openEvent).toBeDefined();

    // 6. Complete blockerId => blockedId is now unblocked
    await conn.query
      .updateTable('pmIssues')
      .set({ statusKey: 'done' })
      .where('id', '=', blockerId)
      .execute();

    // Now blockedId should appear in candidates
    candidates = await scheduler.listCandidates(projectId);
    expect(candidates.map((c) => c.id)).toContain(blockedId);

    // in_progress = 1 (urgentId), capacity = 2 => availableSlots = 1
    // Between blockedId (priority 1) and childId (priority 2), blockedId opens first
    openResult = await scheduler.openNext(projectId);
    expect(openResult.openedCount).toBe(1);
    expect(openResult.openedIssueIds).toEqual([blockedId]);

    // 7. Test pause stops openNext
    await evaluator.pause(projectId, 'Bảo trì hệ thống');
    openResult = await scheduler.openNext(projectId);
    expect(openResult.openedCount).toBe(0);
  },
);
