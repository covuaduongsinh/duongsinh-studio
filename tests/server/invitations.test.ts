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

interface InvitationResult {
  email: string;
  outcome: string;
  emailSent?: boolean;
  inviteUrl?: string;
}

// Without SMTP (stage S6), an owner invites by link: the invitee registers from it and joins the project. A project
// invitation carries no role, so what the invitee may do comes from the default role (`PUT /api/access/settings`).
test('an invitation link brings a person into a members-only project', async ({
  testApp,
  request,
}) => {
  const owner = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const project = (
    await (
      await owner.fetch(
        '/projects',
        json({ name: 'Invite project', visibility: 'members' }),
      )
    ).json()
  ).data as { id: string };
  const issue = (
    await (
      await owner.fetch(
        '/projects/issues',
        json({ title: 'Invite issue', projectId: project.id }),
      )
    ).json()
  ).data as { id: string };

  const invite = async (email: string) => {
    const response = await owner.fetch(
      '/projects/invitations',
      json({ emails: [email], projectIds: [project.id] }),
    );
    expect(response.status).toBe(201);
    const [result] = (
      (await response.json()).data as {
        results: InvitationResult[];
      }
    ).results;
    expect(result).toMatchObject({ email, outcome: 'invited' });
    // No email channel: the link comes back to the inviter to forward privately.
    expect(result?.inviteUrl).toBeTruthy();
    const token = new URL(String(result?.inviteUrl)).pathname.split('/').pop();
    return String(token);
  };

  const accept = async (token: string, name: string) => {
    expect(
      (
        await request(
          '/users/invitations/accept',
          json({ token, name, password: PASSWORD }),
        )
      ).status,
    ).toBe(200);
    return signIn(testApp, {
      email: `${name}@example.test`,
      password: PASSWORD,
    });
  };

  // No default role: the invitee joins the project but holds no ability to read its issues.
  expect(
    (await owner.fetch('/access/settings', json({ defaultRole: null }, 'PUT')))
      .status,
  ).toBe(200);
  const first = await accept(await invite('invitee1@example.test'), 'invitee1');
  expect((await first.fetch('/projects/me')).status).toBe(200);
  expect((await first.fetch(`/projects/issues/${issue.id}`)).status).not.toBe(
    200,
  );

  // With Contributor as the default role, the next invitee works in the project from the first request.
  expect(
    (
      await owner.fetch(
        '/access/settings',
        json({ defaultRole: 'contributor' }, 'PUT'),
      )
    ).status,
  ).toBe(200);
  const second = await accept(
    await invite('invitee2@example.test'),
    'invitee2',
  );
  expect((await second.fetch('/projects/me')).status).toBe(200);
  expect((await second.fetch(`/projects/issues/${issue.id}`)).status).toBe(200);
}, 240_000);
