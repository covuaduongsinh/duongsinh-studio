import { expect, vi } from 'vitest';
import { createAppTest } from '@nocobase/app-testing/server';
import {
  signIn,
  DEFAULT_ADMIN_CREDENTIALS,
} from '@nocobase/app-plugin-authentication/testing';
import { databaseManagerToken } from '@nocobase/db';
import { createAutopilotDigest } from '../../server/autopilot/digest.js';
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
  'Autopilot Digest: aggregates daily merged PRs, opened tasks, stalls and blocked issues into Inbox notification',
  { timeout: 120_000 },
  async ({ testApp, app }) => {
    await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
    const ownerUserId = 'user-admin';
    const db = app.container.resolve(databaseManagerToken);
    const conn = db.connection();

    const notifyMock = vi.fn().mockResolvedValue(undefined);
    const digest = createAutopilotDigest({
      database: db,
      notify: notifyMock,
      owners: async () => [ownerUserId],
    });

    const now = new Date();
    const projectId = 'proj-digest-test';

    // Seed events for today
    await conn.query
      .insertInto('dsAutopilotEvents')
      .values([
        {
          id: 'event-digest-1',
          projectId,
          issueId: 'issue-d-1',
          kind: 'merged',
          reason: 'All 7 conditions met',
          createdAt: now,
        },
        {
          id: 'event-digest-2',
          projectId,
          issueId: 'issue-d-2',
          kind: 'opened',
          reason: 'Next issue unblocked',
          createdAt: now,
        },
        {
          id: 'event-digest-3',
          projectId,
          issueId: 'issue-d-3',
          kind: 'stalled',
          reason: 'No activity in 30 minutes',
          createdAt: now,
        },
      ])
      .execute();

    // Seed an issue needing attention
    await conn.query
      .insertInto('pmIssues')
      .values({
        id: 'issue-needs-you-1',
        number: 301,
        identifier: 'DIGEST-301',
        title: 'Blocker needing review',
        description: 'Waiting for manual input',
        statusKey: 'blocked',
        needsYou: 'Cần quyết định cấu hình proxy',
        priorityRank: 0,
        ownerUserId,
        projectId,
        createdAt: now,
        updatedAt: now,
        lastActivityAt: now,
      })
      .execute();

    const summary = await digest.sendDailyDigest();
    expect(summary.sent).toBe(true);
    expect(summary.mergedCount).toBe(1);
    expect(summary.openedCount).toBe(1);
    expect(summary.stalledCount).toBe(1);
    expect(summary.blockedCount).toBe(0);

    expect(notifyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: [ownerUserId],
        title: expect.stringContaining('Báo cáo Tự lái ngày'),
        body: expect.stringContaining('Đã tự động merge'),
      }),
    );
    expect(notifyMock.mock.calls[0][0].body).toContain('DIGEST-301');
    expect(notifyMock.mock.calls[0][0].body).toContain(
      'Cần quyết định cấu hình proxy',
    );
  },
);
