// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import { createAppTest } from '@nocobase/app-testing/server';
import {
  signIn,
  DEFAULT_ADMIN_CREDENTIALS,
} from '@nocobase/app-plugin-authentication/testing';
import { projectsAccessToken } from '@nocobase/app-plugin-projects/server/tokens';
import { createStandaloneServer } from '../../server/standalone.js';
import {
  ADMIN_SET_KEY,
  CONTRIBUTOR_SET_KEY,
} from '../../server/access/roles.js';

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

interface Me {
  permissions: {
    scopes: Record<string, unknown>;
    settings: Record<string, boolean>;
  };
}

test('projects permissions follow the Admin and Contributor permission sets', async ({
  testApp,
  app,
  connection,
  request,
}) => {
  // Unauthenticated callers get nothing.
  expect((await request('/projects/me')).status).toBe(401);

  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const createUser = async (name: string, roles: string[]) => {
    const response = await admin.fetch(
      '/users',
      json({
        name,
        username: name,
        email: `${name}@example.test`,
        password: PASSWORD,
        roleScopes: { app: roles },
      }),
    );
    expect(response.status).toBe(201);
    return (await response.json()).data as { id: string };
  };
  const contributorUser = await createUser('contributor1', [
    CONTRIBUTOR_SET_KEY,
  ]);
  const otherContributorUser = await createUser('contributor2', [
    CONTRIBUTOR_SET_KEY,
  ]);
  const adminUser = await createUser('admin2', [ADMIN_SET_KEY]);
  await createUser('plainmember', ['member']);

  const contributor = await signIn(testApp, {
    username: 'contributor1',
    password: PASSWORD,
  });
  const otherContributor = await signIn(testApp, {
    username: 'contributor2',
    password: PASSWORD,
  });
  const secondAdmin = await signIn(testApp, {
    username: 'admin2',
    password: PASSWORD,
  });
  const plainMember = await signIn(testApp, {
    username: 'plainmember',
    password: PASSWORD,
  });

  // A contributor reaches only related records, cannot delete, and only reads settings.
  const me = (await (await contributor.fetch('/projects/me')).json())
    .data as Me;
  expect(me.permissions.scopes['pm.issues/view']).toEqual({
    users: [contributorUser.id],
  });
  expect(me.permissions.scopes['pm.issues/delete']).toBe('none');
  expect(me.permissions.scopes['pm.projects/delete']).toBe('none');
  expect(me.permissions.settings['pm.general/read']).toBe(true);
  expect(me.permissions.settings['pm.general/update']).toBe(false);
  expect(me.permissions.settings['pm.members/assign']).toBe(false);

  // The Admin set reaches every record and every settings item.
  const adminMe = (await (await secondAdmin.fetch('/projects/me')).json())
    .data as Me;
  expect(adminMe.permissions.scopes['pm.issues/view']).toBe('all');
  expect(adminMe.permissions.scopes['pm.issues/delete']).toBe('all');
  expect(adminMe.permissions.settings['pm.general/update']).toBe(true);

  // A contributor creates and sees their own issue.
  const created = await contributor.fetch(
    '/projects/issues',
    json({ title: 'Contributor issue' }),
  );
  expect(created.status).toBe(201);
  const own = (await created.json()).data as {
    id: string;
    identifier: string;
  };
  // The Dương Sinh seed numbers issues DS-n on a fresh install and creates the workflow labels.
  expect(own.identifier).toMatch(/^DS-\d+$/);
  const labels = (await (await admin.fetch('/projects/labels')).json())
    .data as { name: string }[];
  expect(labels.map((label) => label.name)).toEqual(
    expect.arrayContaining(['v2', 'plugin', 'docs', 'bug', 'no-preview']),
  );
  expect((await contributor.fetch(`/projects/issues/${own.id}`)).status).toBe(
    200,
  );

  // The plugin relates every issue without a project to every contributor: that is shared workspace work.
  expect(
    (await otherContributor.fetch(`/projects/issues/${own.id}`)).status,
  ).toBe(200);

  // Privacy comes from a members-only project: outsiders with the Contributor role cannot see its issues.
  const project = await secondAdmin.fetch(
    '/projects',
    json({ name: 'Private project', visibility: 'members' }),
  );
  expect(project.status).toBe(201);
  const privateProject = (await project.json()).data as { id: string };
  const privateIssue = await secondAdmin.fetch(
    '/projects/issues',
    json({ title: 'Private issue', projectId: privateProject.id }),
  );
  expect(privateIssue.status).toBe(201);
  const hidden = (await privateIssue.json()).data as { id: string };
  expect(
    (await contributor.fetch(`/projects/issues/${hidden.id}`)).status,
  ).not.toBe(200);
  expect(
    (await contributor.fetch(`/projects/${privateProject.id}`)).status,
  ).not.toBe(200);
  // An admin reaches every record whatever the project's visibility.
  expect((await admin.fetch(`/projects/issues/${hidden.id}`)).status).toBe(200);

  // Joining the project makes its issues visible to the contributor.
  expect(
    (
      await secondAdmin.fetch(
        `/projects/${privateProject.id}/members`,
        json({ userId: contributorUser.id }),
      )
    ).status,
  ).toBe(201);
  expect(
    (await contributor.fetch(`/projects/issues/${hidden.id}`)).status,
  ).toBe(200);

  // Assigning an issue to someone reaches their in-app inbox (the `inbox` channel the projects plugin uses).
  const unread = async () =>
    (
      (
        await (
          await contributor.fetch('/notificationInApp/messages/unreadCount')
        ).json()
      ).data as { count: number }
    ).count;
  const before = await unread();
  expect(
    (
      await secondAdmin.fetch(
        '/projects/issues',
        json({
          title: 'Assigned to contributor',
          ownerUserId: contributorUser.id,
        }),
      )
    ).status,
  ).toBe(201);
  let after = before;
  for (let attempt = 0; attempt < 40 && after === before; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    after = await unread();
  }
  expect(after).toBeGreaterThan(before);

  // A person with no Studio role cannot create issues.
  expect(
    (await plainMember.fetch('/projects/issues', json({ title: 'Denied' })))
      .status,
  ).toBe(403);

  // Administrators are the root and Admin set holders, never contributors.
  const administrators = await app.container
    .resolve(projectsAccessToken)
    .administrators(connection);
  expect(administrators).toContain(adminUser.id);
  expect(administrators).not.toContain(contributorUser.id);
  expect(administrators).not.toContain(otherContributorUser.id);
  // Booting a fresh application and signing in five people takes over 30 s on the development machine.
}, 180_000);
