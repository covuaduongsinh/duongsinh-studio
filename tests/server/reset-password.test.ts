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

// What the Users page's "Reset password" does: only an administrator may, the new password works and the old one stops.
test(
  'an administrator resets a password, the old one stops working, and a contributor may not reset anyone’s',
  { timeout: 240_000 },
  async ({ testApp, request }) => {
    const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
    const made = await admin.fetch(
      '/users',
      json({
        name: 'lan',
        username: 'lan',
        email: 'lan@example.test',
        password: OLD,
        roleScopes: { app: [CONTRIBUTOR_SET_KEY] },
      }),
    );
    expect(made.status).toBe(201);
    const lan = (await made.json()).data as { id: string };
    const adminId = (
      (await (await admin.fetch('/auth/get-session')).json()) as {
        user: { id: string };
      }
    ).user.id;

    // Nobody signed in: 401.
    expect(
      (await request(`/users/${lan.id}/resetPassword`, json({ password: NEW })))
        .status,
    ).toBe(401);

    // A contributor may not reset the administrator's password, nor their own through this route.
    const contributor = await signIn(testApp, {
      username: 'lan',
      password: OLD,
    });
    for (const id of [adminId]) {
      const refused = await contributor.fetch(
        `/users/${id}/resetPassword`,
        json({ password: NEW }),
      );
      expect([403, 404]).toContain(refused.status);
    }

    // Too short: refused, and nothing changes.
    expect(
      (
        await admin.fetch(
          `/users/${lan.id}/resetPassword`,
          json({ password: 'short' }),
        )
      ).status,
    ).toBe(400);

    // The administrator resets it: the new password signs in, the old one no longer does.
    expect(
      (
        await admin.fetch(
          `/users/${lan.id}/resetPassword`,
          json({ password: NEW }),
        )
      ).status,
    ).toBe(204);
    const again = await signIn(testApp, { username: 'lan', password: NEW });
    expect((await again.fetch('/projects/me')).status).toBe(200);
    await expect(
      signIn(testApp, { username: 'lan', password: OLD }),
    ).rejects.toThrow();

    // And their sessions can be ended afterwards, as the dialog's checkbox does.
    expect(
      (await admin.fetch(`/users/${lan.id}/revokeSessions`, json({}))).status,
    ).toBeLessThan(300);
    expect((await again.fetch('/projects/me')).status).toBe(401);
  },
);
