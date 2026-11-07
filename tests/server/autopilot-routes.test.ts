// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import { createAppTest } from '@nocobase/app-testing/server';
import {
  signIn,
  DEFAULT_ADMIN_CREDENTIALS,
} from '@nocobase/app-plugin-authentication/testing';
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

const json = (body: unknown, method = 'POST') => ({
  method,
  headers: {
    'content-type': 'application/json',
    origin: 'http://localhost',
    'Idempotency-Key': `${Date.now()}.${randomUUID()}`,
  },
  body: JSON.stringify(body),
});

test('autopilot REST routes: settings, pause, resume, events, stop-all and person-only gate', async ({
  testApp,
  request,
}) => {
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);

  // 1. Create a project
  const project = (
    await (await admin.fetch('/projects', json({ name: 'Sandbox' }))).json()
  ).data as { id: string };

  // 2. GET default autopilot settings
  const getInitialRes = await admin.fetch(`/projects/${project.id}/autopilot`);
  expect(getInitialRes.status).toBe(200);
  const initialSettings = (await getInitialRes.json()).data as {
    projectId: string;
    enabled: boolean;
    stallMinutes: number;
    pausedReason: string | null;
  };
  expect(initialSettings.projectId).toBe(project.id);
  expect(initialSettings.enabled).toBe(false);
  expect(initialSettings.stallMinutes).toBe(30);
  expect(initialSettings.pausedReason).toBeNull();

  // 3. PUT updated settings
  const updateRes = await admin.fetch(
    `/projects/${project.id}/autopilot`,
    json(
      {
        enabled: true,
        stallMinutes: 20,
        sensitivePolicy: 'extraReview',
        sensitivePaths: ['database/**', '.github/**'],
      },
      'PUT',
    ),
  );
  expect(updateRes.status).toBe(200);
  const updatedSettings = (await updateRes.json()).data as {
    enabled: boolean;
    stallMinutes: number;
    sensitivePolicy: string;
    sensitivePaths: string[];
  };
  expect(updatedSettings.enabled).toBe(true);
  expect(updatedSettings.stallMinutes).toBe(20);
  expect(updatedSettings.sensitivePolicy).toBe('extraReview');
  expect(updatedSettings.sensitivePaths).toEqual(['database/**', '.github/**']);

  // A URL is not a path and would replace the defaults; an empty list falls back to them.
  const urlRes = await admin.fetch(
    `/projects/${project.id}/autopilot`,
    json({ sensitivePaths: ['https://github.com/acme/app'] }, 'PUT'),
  );
  expect(urlRes.status).toBe(400);
  const emptyRes = await admin.fetch(
    `/projects/${project.id}/autopilot`,
    json({ sensitivePaths: [] }, 'PUT'),
  );
  expect(emptyRes.status).toBe(200);
  expect(
    ((await emptyRes.json()).data as { sensitivePaths: string[] | null })
      .sensitivePaths,
  ).toBeNull();

  // 4. POST pause autopilot
  const pauseRes = await admin.fetch(
    `/projects/${project.id}/autopilot/pause`,
    json({ reason: 'Maintenance in progress' }),
  );
  expect(pauseRes.status).toBe(200);
  const pausedSettings = (await pauseRes.json()).data as {
    pausedReason: string | null;
  };
  expect(pausedSettings.pausedReason).toBe('Maintenance in progress');

  // 5. GET events - should have a 'paused' event
  const eventsRes = await admin.fetch(
    `/autopilot/events?projectId=${project.id}`,
  );
  expect(eventsRes.status).toBe(200);
  const events = (await eventsRes.json()).data as {
    projectId: string;
    kind: string;
    reason: string | null;
  }[];
  expect(events.length).toBeGreaterThanOrEqual(1);
  const pausedEvent = events.find((e) => e.kind === 'paused');
  expect(pausedEvent).toBeDefined();
  expect(pausedEvent?.reason).toBe('Maintenance in progress');

  // 6. POST resume autopilot
  const resumeRes = await admin.fetch(
    `/projects/${project.id}/autopilot/resume`,
    json({}),
  );
  expect(resumeRes.status).toBe(200);
  const resumedSettings = (await resumeRes.json()).data as {
    pausedReason: string | null;
  };
  expect(resumedSettings.pausedReason).toBeNull();

  // 7. POST stop-all autopilot
  const stopAllRes = await admin.fetch(
    '/autopilot/stop-all',
    json({ reason: 'Emergency system shutdown' }),
  );
  expect(stopAllRes.status).toBe(200);
  expect((await stopAllRes.json()).data).toEqual({ stopped: true });

  // Settings should now be paused with emergency reason
  const verifyStopRes = await admin.fetch(`/projects/${project.id}/autopilot`);
  expect(verifyStopRes.status).toBe(200);
  const stoppedSettings = (await verifyStopRes.json()).data as {
    pausedReason: string | null;
  };
  expect(stoppedSettings.pausedReason).toBe('Emergency system shutdown');

  // 8. Test issue auto-start flag routes
  const issue = (
    await (
      await admin.fetch(
        '/projects/issues',
        json({
          projectId: project.id,
          title: 'Test flag issue',
          statusKey: 'backlog',
        }),
      )
    ).json()
  ).data as { id: string };

  const getFlagInitial = await admin.fetch(
    `/issues/${issue.id}/autopilot-flag`,
  );
  expect(getFlagInitial.status).toBe(200);
  expect((await getFlagInitial.json()).data).toBeNull();

  const setFlagRes = await admin.fetch(
    `/issues/${issue.id}/autopilot-flag`,
    json({ allowAutoStart: true, inheritFromParent: false }, 'PUT'),
  );
  expect(setFlagRes.status).toBe(200);
  const flagData = (await setFlagRes.json()).data as {
    issueId: string;
    allowAutoStart: boolean;
    inheritFromParent: boolean;
  };
  expect(flagData.issueId).toBe(issue.id);
  expect(flagData.allowAutoStart).toBe(true);
  expect(flagData.inheritFromParent).toBe(false);

  const getFlagAfter = await admin.fetch(`/issues/${issue.id}/autopilot-flag`);
  expect(getFlagAfter.status).toBe(200);
  expect((await getFlagAfter.json()).data?.allowAutoStart).toBe(true);

  // 9. Gate: anonymous call returns 401
  const anonRes = await request(`/projects/${project.id}/autopilot`);
  expect(anonRes.status).toBe(401);
  const anonFlagRes = await request(`/issues/${issue.id}/autopilot-flag`);
  expect(anonFlagRes.status).toBe(401);

  // 10. POST /api/autopilot/digest triggers daily digest notification
  const digestRes = await admin.fetch('/autopilot/digest', json({}));
  expect(digestRes.status).toBe(200);
  const digestData = (await digestRes.json()).data as {
    date: string;
    mergedCount: number;
    openedCount: number;
    sent: boolean;
  };
  expect(typeof digestData.date).toBe('string');
  expect(typeof digestData.mergedCount).toBe('number');

  const anonDigestRes = await request('/autopilot/digest', json({}));
  expect(anonDigestRes.status).toBe(401);
}, 120_000);
