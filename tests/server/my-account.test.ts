// @vitest-environment node
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

const OLD = 'Studio-old-password-1!';
const NEW = 'Studio-new-password-2!';

// The calls "My account" makes through the Better Auth client: each acts only on the caller's own account.
test(
  'a person changes their own name and password and manages their own API keys',
  { timeout: 240_000 },
  async ({ testApp, request }) => {
    const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
    expect(
      (
        await admin.fetch(
          '/users',
          json({
            name: 'lan',
            username: 'lan',
            email: 'lan@example.test',
            password: OLD,
            roleScopes: { app: [CONTRIBUTOR_SET_KEY] },
          }),
        )
      ).status,
    ).toBe(201);
    const lan = await signIn(testApp, { username: 'lan', password: OLD });

    // Profile.
    expect(
      (await lan.fetch('/auth/update-user', json({ name: 'Lan Nguyễn' })))
        .status,
    ).toBe(200);
    const session = (await (await lan.fetch('/auth/get-session')).json()) as {
      user: { name: string };
    };
    expect(session.user.name).toBe('Lan Nguyễn');

    // Nobody signed in changes nothing.
    expect(
      (
        await request(
          '/auth/change-password',
          json({ currentPassword: OLD, newPassword: NEW }),
        )
      ).status,
    ).toBeGreaterThanOrEqual(400);

    // Password: a wrong current password is refused, the right one changes it, and the old one stops signing in.
    expect(
      (
        await lan.fetch(
          '/auth/change-password',
          json({ currentPassword: 'not-the-password-1', newPassword: NEW }),
        )
      ).status,
    ).toBeGreaterThanOrEqual(400);
    expect(
      (
        await lan.fetch(
          '/auth/change-password',
          json({
            currentPassword: OLD,
            newPassword: NEW,
            revokeOtherSessions: true,
          }),
        )
      ).status,
    ).toBe(200);
    await expect(
      signIn(testApp, { username: 'lan', password: OLD }),
    ).rejects.toThrow();
    const again = await signIn(testApp, { username: 'lan', password: NEW });

    // API keys: made, listed without the secret, usable as the owner, and gone when deleted.
    const made = await again.fetch(
      '/auth/api-key/create',
      json({ name: 'CLI on my laptop', expiresIn: 90 * 24 * 60 * 60 }),
    );
    expect(made.status).toBe(200);
    const created = (await made.json()) as { id: string; key: string };
    expect(created.key).toBeTruthy();

    const listed = await again.fetch('/auth/api-key/list');
    expect(listed.status).toBe(200);
    const listedText = await listed.text();
    expect(listedText).toContain('CLI on my laptop');
    expect(listedText).not.toContain(created.key);

    const withKey = (path: string) =>
      request(path, { headers: { 'x-api-key': created.key } });
    expect((await withKey('/projects/me')).status).toBe(200);

    // Another person cannot delete it; its owner can, and the key stops working.
    const other = admin;
    expect(
      (await other.fetch('/auth/api-key/delete', json({ keyId: created.id })))
        .status,
    ).toBeGreaterThanOrEqual(400);
    expect((await withKey('/projects/me')).status).toBe(200);
    expect(
      (await again.fetch('/auth/api-key/delete', json({ keyId: created.id })))
        .status,
    ).toBe(200);
    expect((await withKey('/projects/me')).status).toBe(401);
  },
);
