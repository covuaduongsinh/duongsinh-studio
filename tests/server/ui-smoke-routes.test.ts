// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import { createAppTest } from '@nocobase/app-testing/server';
import {
  signIn,
  DEFAULT_ADMIN_CREDENTIALS,
} from '@nocobase/app-plugin-authentication/testing';
import { createStandaloneServer } from '../../server/standalone.js';

// T5 (plan T): who may propose the interface smoke test, and what a project with no repository answers.
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
  'T5: 401 without a session, 403/404 outside the project, a clear refusal without a repository',
  { timeout: 180_000 },
  async ({ testApp, request }) => {
    const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
    const projectId = (
      (await (
        await admin.fetch(
          '/projects',
          json({ name: 'Smoke Project', visibility: 'members' }),
        )
      ).json()) as { data: { id: string } }
    ).data.id;
    const path = `/projects/${projectId}/uiSmoke`;
    expect((await request(path, { method: 'POST' })).status).toBe(401);
    expect(
      (
        await admin.fetch(
          '/users',
          json({
            name: 'outsider5',
            username: 'outsider5',
            email: 'outsider5@example.test',
            password: PASSWORD,
            roleScopes: { app: [] },
          }),
        )
      ).status,
    ).toBe(201);
    const outsider = await signIn(testApp, {
      username: 'outsider5',
      password: PASSWORD,
    });
    expect([403, 404]).toContain((await outsider.fetch(path, json({}))).status);
    const refused = await admin.fetch(path, json({}));
    expect(refused.status).toBe(400);
    expect(((await refused.json()) as any).error.reason).toBe(
      'GIT_REPOSITORY_NOT_LINKED',
    );
  },
);
