import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import { createAppTest } from '@nocobase/app-testing/server';
import {
  signIn,
  DEFAULT_ADMIN_CREDENTIALS,
} from '@nocobase/app-plugin-authentication/testing';
import { projectsToken } from '@nocobase/app-plugin-projects/server/tokens';
import { databaseManagerToken } from '@nocobase/db';
import { MAX_QUOTA_BACKOFF_MS } from '../../server/autopilot/stall.js';
import { createIssueSubject } from '../../server/providers/issue-subject.js';
import { createStandaloneServer } from '../../server/standalone.js';

const test = createAppTest({
  createServer: createStandaloneServer,
  config: {
    app: { publicOrigin: 'http://localhost' },
    auth: { secret: 'test-auth-secret-at-least-32-characters' },
  },
});

const json = (body: unknown) => ({
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    origin: 'http://localhost',
    'Idempotency-Key': `${Date.now()}.${randomUUID()}`,
  },
  body: JSON.stringify(body),
});

// Runners remove the working directory of an issue whose work is over (`nocobase-runner gc --ended` and the automatic
// cleanup), so `settled` must name exactly the finished issues: a directory of live work is never removed.
test(
  'only done and cancelled issues are settled, so their working directories can be removed',
  { timeout: 120_000 },
  async ({ testApp, app }) => {
    const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
    const project = (
      await (
        await admin.fetch('/projects', json({ name: 'Workspaces' }))
      ).json()
    ).data as { id: string };
    const conn = app.container.resolve(databaseManagerToken).connection();
    // A new issue starts in backlog or in progress; the rest of the lifecycle is set directly.
    const make = async (statusKey: string) => {
      const response = await admin.fetch(
        '/projects/issues',
        json({ title: statusKey, statusKey: 'backlog', projectId: project.id }),
      );
      expect(response.status).toBe(201);
      const id = ((await response.json()).data as { id: string }).id;
      await conn.query
        .updateTable('pmIssues')
        .set({ statusKey })
        .where('id', '=', id)
        .execute();
      return id;
    };
    const ids = {
      done: await make('done'),
      cancelled: await make('cancelled'),
      inProgress: await make('in_progress'),
      inReview: await make('in_review'),
      blocked: await make('blocked'),
      backlog: await make('backlog'),
    };

    const subject = createIssueSubject({
      projects: app.container.resolve(projectsToken),
      viewerOf: () => Promise.resolve(null),
      translate: () => Promise.resolve((key) => key),
      recentSummaries: () => Promise.resolve([]),
    });
    const settled = await subject.workspaces!.settled(conn, [
      ...Object.values(ids),
      'no-such-issue',
    ]);

    expect([...settled].sort()).toEqual([ids.done, ids.cancelled].sort());
    // Nothing asked, nothing settled.
    expect((await subject.workspaces!.settled(conn, [])).size).toBe(0);
  },
);

// A queued run waits for a runner; without a limit it waits forever. The limit must outlast autopilot's longest quota
// backoff, or a run it deliberately parks would be failed as `queuedExpired` before the quota comes back.
test('queued runs on an issue expire after 24 hours, longer than any autopilot backoff', async ({
  app,
}) => {
  const subject = createIssueSubject({
    projects: app.container.resolve(projectsToken),
    viewerOf: () => Promise.resolve(null),
    translate: () => Promise.resolve((key) => key),
    recentSummaries: () => Promise.resolve([]),
  });
  expect(subject.queuedExpiryMs).toBe(24 * 60 * 60 * 1000);
  expect(subject.queuedExpiryMs).toBeGreaterThan(MAX_QUOTA_BACKOFF_MS);
});
