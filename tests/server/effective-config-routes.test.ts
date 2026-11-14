// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import { createAppTest } from '@nocobase/app-testing/server';
import {
  signIn,
  DEFAULT_ADMIN_CREDENTIALS,
} from '@nocobase/app-plugin-authentication/testing';
import { createStandaloneServer } from '../../server/standalone.js';

// T13 (plan T): the quota card is for administrators; the effective configuration is for people who see the project.
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

test(
  'T13: 401, 403/404 for outsiders, and the lines say where each value comes from',
  { timeout: 180_000 },
  async ({ testApp, request }) => {
    const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
    const projectId = (
      (await (
        await admin.fetch(
          '/projects',
          json({ name: 'Config Project', visibility: 'members' }),
        )
      ).json()) as { data: { id: string } }
    ).data.id;
    const config = `/projects/${projectId}/effectiveConfig`;

    expect((await request('/quota')).status).toBe(401);
    expect((await request(config)).status).toBe(401);

    expect(
      (
        await admin.fetch(
          '/users',
          json({
            name: 'outsider7',
            username: 'outsider7',
            email: 'outsider7@example.test',
            password: PASSWORD,
            roleScopes: { app: [] },
          }),
        )
      ).status,
    ).toBe(201);
    const outsider = await signIn(testApp, {
      username: 'outsider7',
      password: PASSWORD,
    });
    expect((await outsider.fetch('/quota')).status).toBe(403);
    expect([403, 404]).toContain((await outsider.fetch(config)).status);

    const quota = await admin.fetch('/quota');
    expect(quota.status).toBe(200);
    expect(((await quota.json()) as any).data).toMatchObject({
      state: 'ok',
      waiting: [],
      budgets: [],
    });

    const rows = (
      (await (await admin.fetch(config)).json()) as {
        data: { key: string; source: string; value: string }[];
      }
    ).data;
    expect(rows.find((r) => r.key === 'autopilot.enabled')).toMatchObject({
      value: 'false',
      source: 'default',
    });
    // Saving a rule makes it the project's own; the rest stay defaults.
    await admin.fetch(
      `/projects/${projectId}/reactions/ciFailed`,
      json({ maxAttempts: 4 }, 'PUT'),
    );
    await admin.fetch(
      `/projects/${projectId}/autopilot`,
      json({ enabled: true }, 'PUT'),
    );
    const after = (
      (await (await admin.fetch(config)).json()) as {
        data: { key: string; source: string; value: string }[];
      }
    ).data;
    expect(after.find((r) => r.key === 'reaction.ciFailed')).toMatchObject({
      source: 'project',
    });
    expect(after.find((r) => r.key === 'reaction.conflicts')).toMatchObject({
      source: 'default',
    });
    expect(after.find((r) => r.key === 'autopilot.enabled')).toMatchObject({
      value: 'true',
      source: 'project',
    });
  },
);
