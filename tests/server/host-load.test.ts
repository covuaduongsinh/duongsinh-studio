// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import { createAppTest } from '@nocobase/app-testing/server';
import {
  signIn,
  DEFAULT_ADMIN_CREDENTIALS,
} from '@nocobase/app-plugin-authentication/testing';
import {
  ADMIN_SET_KEY,
  CONTRIBUTOR_SET_KEY,
} from '../../server/access/roles.js';
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

const PASSWORD = 'Studio-test-123!';
const json = (body: unknown) => ({
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    origin: 'http://localhost',
    'Idempotency-Key': `${Date.now()}.${randomUUID()}`,
  },
  body: JSON.stringify(body),
});

test(
  'host load: 401 signed out, 403 without access to Apps, 200 with the memory and the running Apps',
  { timeout: 240_000 },
  async ({ testApp, request }) => {
    expect((await request('/hostLoad')).status).toBe(401);
    const owner = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
    for (const [name, set] of [
      ['administrator1', ADMIN_SET_KEY],
      ['contributor1', CONTRIBUTOR_SET_KEY],
    ] as const)
      expect(
        (
          await owner.fetch(
            '/users',
            json({
              name,
              username: name,
              email: `${name}@example.test`,
              password: PASSWORD,
              roleScopes: { app: [set] },
            }),
          )
        ).status,
      ).toBe(201);
    const admin = await signIn(testApp, {
      username: 'administrator1',
      password: PASSWORD,
    });
    const contributor = await signIn(testApp, {
      username: 'contributor1',
      password: PASSWORD,
    });

    expect((await contributor.fetch('/hostLoad')).status).toBe(403);
    for (const who of [owner, admin]) {
      const response = await who.fetch('/hostLoad');
      expect(response.status).toBe(200);
      const { data } = (await response.json()) as {
        data: {
          availableMb: number | null;
          minAvailableMb: number;
          appMemoryLimitMb: number;
          runningApps: unknown[];
        };
      };
      expect(data.minAvailableMb).toBe(1200);
      expect(data.appMemoryLimitMb).toBe(1024);
      expect(data.runningApps).toEqual([]);
      expect(data.availableMb === null || data.availableMb > 0).toBe(true);
    }
  },
);
