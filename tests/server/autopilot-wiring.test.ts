import { expect } from 'vitest';
import { createAppTest } from '@nocobase/app-testing/server';
import {
  signIn,
  DEFAULT_ADMIN_CREDENTIALS,
} from '@nocobase/app-plugin-authentication/testing';
import { databaseManagerToken } from '@nocobase/db';
import { agentsToken } from '@nocobase/app-plugin-agents/server/tokens';
import { notificationServiceToken } from '@nocobase/app-plugin-notification/server';
import {
  autopilotDigestToken,
  autopilotSchedulerToken,
  autopilotServiceToken,
  autopilotStallDetectorToken,
} from '../../server/providers/autopilot.js';
import { PROJECT_MANAGER_AGENT_ID } from '../../server/autopilot/scheduler.js';
import { createStandaloneServer } from '../../server/standalone.js';

// The unit tests of the scheduler and the stall detector hand them mocks. These go through the provider's real wiring,
// so a dependency it forgets, or a real service that wants another shape, fails here.
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

const stale = (minutes: number): Date =>
  new Date(Date.now() - minutes * 60 * 1000);

test(
  'the provider wires autopilot to real agent runs and the inbox',
  { timeout: 180_000 },
  async ({ testApp, app }) => {
    const adminClient = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
    const { container } = app;
    const db = container.resolve(databaseManagerToken);
    const conn = db.connection();
    const session = (await (
      await adminClient.fetch('/auth/get-session')
    ).json()) as {
      user: { id: string };
    };
    const ownerUserId = session.user.id;

    // In production the project manager has a tool and a model; a fresh database's does not, and takes no work.
    await container.resolve(agentsToken).agents.ensureSystem({
      id: PROJECT_MANAGER_AGENT_ID,
      name: 'Project manager',
      description: 'Coordinates.',
      instructions: null,
      actions: [],
      modelEntries: [{ tool: 'claude', model: 'claude-sonnet-4-5' }],
    });

    const evaluator = container.resolve(autopilotServiceToken);
    const projectId = 'proj-wiring';
    await evaluator.saveSettings(projectId, {
      enabled: true,
      stallMinutes: 30,
    });

    const insertIssue = (id: string, number: number, statusKey: string) =>
      conn.query
        .insertInto('pmIssues')
        .values({
          id,
          number,
          identifier: `WIRE-${number}`,
          title: `Wiring ${number}`,
          description: 'Wiring',
          statusKey,
          priorityRank: 1,
          ownerUserId,
          projectId,
          createdAt: stale(60),
          updatedAt: stale(60),
          lastActivityAt: stale(60),
        })
        .execute();
    const runsOf = (issueId: string) =>
      conn.query
        .selectFrom('agRuns')
        .select(['id', 'agentId', 'status'])
        .where('subjectKind', '=', 'issue')
        .where('subjectId', '=', issueId)
        .execute();

    // A stalled issue wakes the project manager with a real queued run, not only an event.
    await insertIssue('issue-stalled', 1, 'in_progress');
    const detector = container.resolve(autopilotStallDetectorToken);
    const scan = await detector.detectAndHandleStalls(projectId);
    expect(scan.stalledIssueIds).toEqual(['issue-stalled']);
    const woken = await runsOf('issue-stalled');
    expect(woken).toHaveLength(1);
    expect(woken[0]).toMatchObject({
      agentId: PROJECT_MANAGER_AGENT_ID,
      status: 'queued',
    });

    // Opening the next issue starts its work too.
    await insertIssue('issue-next', 2, 'backlog');
    const scheduler = container.resolve(autopilotSchedulerToken);
    await scheduler.setIssueFlag('issue-next', { allowAutoStart: true });
    await conn.query
      .updateTable('pmIssues')
      .set({ statusKey: 'blocked' })
      .where('id', '=', 'issue-stalled')
      .execute();
    const opened = await scheduler.openNext(projectId);
    expect(opened.openedIssueIds).toEqual(['issue-next']);
    expect(await runsOf('issue-next')).toHaveLength(1);

    // A digest reaches the inbox channel this application configures.
    const notifications = container.resolve(notificationServiceToken) as {
      send: (input: { messages: Record<string, unknown> }) => Promise<unknown>;
    };
    const original = notifications.send.bind(notifications);
    const channels: string[] = [];
    const outcomes: Promise<unknown>[] = [];
    notifications.send = (input) => {
      channels.push(...Object.keys(input.messages));
      const sent = original(input);
      outcomes.push(sent);
      return sent;
    };
    try {
      await container.resolve(autopilotDigestToken).sendDailyDigest();
      expect(channels).toEqual(['inbox']);
      await expect(Promise.all(outcomes)).resolves.toBeDefined();
    } finally {
      notifications.send = original;
    }
  },
);

test(
  'a queued run waiting on tool quota throttles autopilot until its known reset',
  { timeout: 180_000 },
  async ({ testApp, app }) => {
    await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
    const db = app.container.resolve(databaseManagerToken);
    const { createAutopilotEvaluator } =
      await import('../../server/autopilot/evaluator.js');
    const { createAutopilotStallDetector } =
      await import('../../server/autopilot/stall.js');
    const { createAutopilotScheduler } =
      await import('../../server/autopilot/scheduler.js');
    const evaluator = createAutopilotEvaluator({
      database: db,
      git: () => ({ listPullRequests: () => Promise.resolve([]) }) as never,
      reviews: () => ({ latestFor: () => Promise.resolve(null) }) as never,
    });
    const projectId = 'proj-quota';
    await evaluator.saveSettings(projectId, { enabled: true });
    await db
      .connection()
      .query.insertInto('pmIssues')
      .values({
        id: 'issue-quota',
        number: 3,
        identifier: 'QUOTA-3',
        title: 'Quota',
        description: 'Quota',
        statusKey: 'in_progress',
        priorityRank: 1,
        ownerUserId: 'user-admin',
        projectId,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastActivityAt: new Date(),
      })
      .execute();

    let now = new Date('2026-11-06T10:00:00.000Z');
    const until = '2026-11-06T13:30:00.000Z';
    const quotaRun = (wait: { until: string | null }) => ({
      runs: [
        {
          id: 'run-q',
          status: 'queued',
          subject: { kind: 'issue', id: 'issue-quota' },
          wait: { reason: 'toolQuota', ...wait },
        },
      ],
    });
    let workload = quotaRun({ until });
    const detector = createAutopilotStallDetector({
      database: db,
      evaluator,
      now: () => now,
      agents: { runs: { workload: () => Promise.resolve(workload) } },
    });
    const scheduler = createAutopilotScheduler({
      database: db,
      evaluator,
      quotaThrottle: (id) => detector.getQuotaThrottle(id),
    });

    // The known reset decides, not a guess: 3.5 hours is longer than the 2 hour cap of the guessed backoff.
    await detector.syncQuotaWaits();
    const throttle = detector.getQuotaThrottle(projectId);
    expect(throttle?.activeUntil.toISOString()).toBe(until);
    expect(throttle?.effectiveConcurrency).toBe(1);
    expect(await scheduler.calculateCapacity(projectId)).toBe(1);

    // The same wait seen on the next sweep records no second event.
    const eventCount = async () =>
      (
        await db
          .connection()
          .query.selectFrom('dsAutopilotEvents')
          .select('id')
          .where('projectId', '=', projectId)
          .execute()
      ).length;
    const events = await eventCount();
    await detector.syncQuotaWaits();
    expect(await eventCount()).toBe(events);

    // After the reset it lifts by itself.
    now = new Date('2026-11-06T13:31:00.000Z');
    expect(detector.getQuotaThrottle(projectId)).toBeNull();

    // An unknown reset falls back to the backoff, which doubles while the wait lasts and stops at 2 hours.
    workload = quotaRun({ until: null });
    const delays: (number | undefined)[] = [];
    for (let round = 0; round < 4; round += 1) {
      await detector.syncQuotaWaits();
      delays.push(detector.getQuotaThrottle(projectId)?.retryDelayMs);
      now = new Date(now.getTime() + (delays.at(-1) ?? 0) + 1000);
    }
    expect(delays.map((ms) => (ms ?? 0) / 60_000)).toEqual([30, 60, 120, 120]);

    // Once nothing waits on quota, the next wait starts from the first delay again.
    workload = { runs: [] } as never;
    await detector.syncQuotaWaits();
    workload = quotaRun({ until: null });
    await detector.syncQuotaWaits();
    expect(detector.getQuotaThrottle(projectId)?.retryDelayMs).toBe(
      30 * 60 * 1000,
    );
  },
);
