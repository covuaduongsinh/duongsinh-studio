import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import { createAppTest } from '@nocobase/app-testing/server';
import {
  signIn,
  DEFAULT_ADMIN_CREDENTIALS,
} from '@nocobase/app-plugin-authentication/testing';
import { CONTRIBUTOR_SET_KEY } from '../../server/access/roles.js';
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

// A project's variables are secrets: the people who run it manage them, a person outside it gets nothing, a value is
// never listed, and revealing one leaves a trace (M3.2).
test(
  'a project’s variables are for its managers only, values are never listed and a reveal is recorded',
  { timeout: 240_000 },
  async ({ testApp, request }) => {
    const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
    const project = (
      await (
        await admin.fetch(
          '/projects',
          json({ name: 'Secrets', visibility: 'members' }),
        )
      ).json()
    ).data as { id: string };
    const base = `/agents/variables/project/${project.id}`;

    const set = await admin.fetch(
      `${base}/DEPLOY_TOKEN`,
      json({ value: 's3cret-value' }, 'PUT'),
    );
    expect(set.status).toBeLessThan(300);

    // Listed by name, never by value.
    const listed = await admin.fetch(base);
    expect(listed.status).toBe(200);
    const text = await listed.text();
    expect(text).toContain('DEPLOY_TOKEN');
    expect(text).not.toContain('s3cret-value');

    // Nobody signed in: 401.
    expect((await request(base)).status).toBe(401);

    // A contributor outside the members-only project can neither read nor write its variables.
    expect(
      (
        await admin.fetch(
          '/users',
          json({
            name: 'outsider',
            username: 'outsider',
            email: 'outsider@example.test',
            password: 'Studio-test-123!',
            roleScopes: { app: [CONTRIBUTOR_SET_KEY] },
          }),
        )
      ).status,
    ).toBe(201);
    const outsider = await signIn(testApp, {
      username: 'outsider',
      password: 'Studio-test-123!',
    });
    for (const [path, init] of [
      [base, undefined],
      [`${base}/audits`, undefined],
      [`${base}/reveal`, json({})],
      [`${base}/OTHER`, json({ value: 'x' }, 'PUT')],
    ] as const) {
      const response = await outsider.fetch(path, init);
      expect([403, 404]).toContain(response.status);
    }

    // The manager reveals the value, and the access log says who did.
    const revealed = await admin.fetch(`${base}/reveal`, json({}));
    expect(revealed.status).toBe(200);
    expect(await revealed.text()).toContain('s3cret-value');
    const audits = (await (await admin.fetch(`${base}/audits`)).json()) as {
      data: { action: string; names: string[]; userName: string | null }[];
    };
    expect(
      audits.data.some(
        (entry) =>
          entry.action === 'reveal' && entry.names.includes('DEPLOY_TOKEN'),
      ),
    ).toBe(true);
  },
);
