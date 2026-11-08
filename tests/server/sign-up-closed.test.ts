// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, test as plainTest } from 'vitest';
import { createAppTest } from '@nocobase/app-testing/server';
import {
  signIn,
  DEFAULT_ADMIN_CREDENTIALS,
} from '@nocobase/app-plugin-authentication/testing';
import { createStandaloneServer } from '../../server/standalone.js';

// Production runs with sign-up closed (`deploy/dokploy/config.yml`): the only way into Studio is an owner's invitation link.
const test = createAppTest({
  createServer: createStandaloneServer,
  config: {
    app: { publicOrigin: 'http://localhost' },
    auth: {
      secret: 'test-auth-secret-at-least-32-characters',
      emailAndPassword: { enabled: true, disableSignUp: true },
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

const PASSWORD = 'Studio-test-123!';

test('public sign-up is rejected, an invitation link still creates the account', async ({
  testApp,
  request,
}) => {
  const rejected = await testApp.request(
    '/auth/sign-up/email',
    json({
      name: 'Stranger',
      email: 'stranger@example.test',
      password: PASSWORD,
    }),
  );
  expect(rejected.status).toBe(400);
  expect((await rejected.json()).user).toBeUndefined();

  const owner = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const project = (
    await (
      await owner.fetch(
        '/projects',
        json({ name: 'Closed sign-up', visibility: 'members' }),
      )
    ).json()
  ).data as { id: string };
  const invited = await owner.fetch(
    '/projects/invitations',
    json({ emails: ['guest@example.test'], projectIds: [project.id] }),
  );
  expect(invited.status).toBe(201);
  const [result] = (
    (await invited.json()).data as { results: { inviteUrl?: string }[] }
  ).results;
  const token = String(
    new URL(String(result?.inviteUrl)).pathname.split('/').pop(),
  );

  expect(
    (
      await request(
        '/users/invitations/accept',
        json({ token, name: 'guest', password: PASSWORD }),
      )
    ).status,
  ).toBe(200);
  const guest = await signIn(testApp, {
    email: 'guest@example.test',
    password: PASSWORD,
  });
  expect((await guest.fetch('/projects/me')).status).toBe(200);
}, 240_000);

plainTest('the production configuration closes public sign-up', () => {
  const config = readFileSync('deploy/dokploy/config.yml', 'utf8');
  expect(config).toMatch(
    /emailAndPassword:\n(?:\s+.*\n)*?\s+disableSignUp: true/u,
  );
});
