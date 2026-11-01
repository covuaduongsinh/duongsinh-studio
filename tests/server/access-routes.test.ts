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

const remove = () => ({
  method: 'DELETE',
  headers: {
    origin: 'http://localhost',
    'Idempotency-Key': `${Date.now()}.${randomUUID()}`,
  },
});

const PASSWORD = 'Studio-test-123!';

interface Role {
  key: string;
  builtIn: boolean;
  editable: boolean;
  pages: string[];
  abilities: Record<string, string>;
  holderIds: string[];
}

test('the access API manages Studio roles, members and the default role', async ({
  testApp,
  request,
}) => {
  expect((await request('/access/me')).status).toBe(401);

  const owner = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const createUser = async (name: string, roles: string[]) => {
    const response = await owner.fetch(
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
  const contributorUser = await createUser('accessctv', ['ds-contributor']);
  await createUser('accessadmin', ['ds-admin']);
  const memberUser = await createUser('accessmember', ['member']);
  const contributor = await signIn(testApp, {
    username: 'accessctv',
    password: PASSWORD,
  });
  const admin = await signIn(testApp, {
    username: 'accessadmin',
    password: PASSWORD,
  });

  // The built-in roles, the owner unrestricted and not editable.
  const roles = (await (await owner.fetch('/access/roles')).json())
    .data as Role[];
  const byKey = new Map(roles.map((role) => [role.key, role]));
  expect(byKey.get('owner')).toMatchObject({ builtIn: true, editable: false });
  expect(byKey.get('owner')?.abilities['pm.issues/delete']).toBe('all');
  expect(byKey.get('contributor')?.holderIds).toContain(contributorUser.id);
  expect(byKey.get('contributor')?.abilities['pm.issues/view']).toBe('related');
  expect((await owner.fetch('/access/catalog')).status).toBe(200);

  // A contributor may read the roles but neither define nor assign them.
  expect((await contributor.fetch('/access/roles')).status).toBe(200);
  expect(
    (
      await contributor.fetch(
        '/access/roles',
        json({ key: 'sneaky', title: 'Sneaky' }),
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await contributor.fetch(
        `/access/members/${contributorUser.id}`,
        json({ roles: ['admin'] }, 'PATCH'),
      )
    ).status,
  ).toBe(403);

  // Roles are checked against the catalog.
  expect(
    (
      await owner.fetch(
        '/access/roles',
        json({ key: 'reviewer', title: 'Reviewer', pages: ['nowhere'] }),
      )
    ).status,
  ).toBe(400);
  const created = await owner.fetch(
    '/access/roles',
    json({
      key: 'reviewer',
      title: 'Reviewer',
      pages: ['pm-issues'],
      abilities: { 'pm.issues/view': 'all', 'pm.issues/comment': 'all' },
    }),
  );
  expect(created.status).toBe(201);
  const reviewer = (await created.json()).data as Role;
  expect(reviewer).toMatchObject({ builtIn: false, editable: true });
  expect(reviewer.abilities['pm.issues/edit']).toBe('none');
  const updated = await owner.fetch(
    '/access/roles/reviewer',
    json({ abilities: { 'pm.issues/view': 'related' } }, 'PATCH'),
  );
  expect(updated.status).toBe(200);
  expect(
    ((await updated.json()).data as Role).abilities['pm.issues/view'],
  ).toBe('related');

  // Assigning Studio roles keeps the platform member role a person already holds.
  const assigned = await owner.fetch(
    `/access/members/${memberUser.id}`,
    json({ roles: ['reviewer'] }, 'PATCH'),
  );
  expect(assigned.status).toBe(200);
  expect(((await assigned.json()).data as { roles: string[] }).roles).toEqual([
    'reviewer',
  ]);
  const account = (await (await owner.fetch(`/users/${memberUser.id}`)).json())
    .data as { roleScopes: { app: string[] } };
  expect(account.roleScopes.app).toEqual(
    expect.arrayContaining(['member', 'ds-reviewer']),
  );

  // Only an owner gives the owner role.
  expect(
    (
      await admin.fetch(
        `/access/members/${memberUser.id}`,
        json({ roles: ['owner'] }, 'PATCH'),
      )
    ).status,
  ).toBe(403);

  // A role in use cannot be deleted; once free, it can.
  expect((await owner.fetch('/access/roles/reviewer', remove())).status).toBe(
    400,
  );
  expect(
    (
      await owner.fetch(
        `/access/members/${memberUser.id}`,
        json({ roles: [] }, 'PATCH'),
      )
    ).status,
  ).toBe(200);
  expect((await owner.fetch('/access/roles/reviewer', remove())).status).toBe(
    204,
  );
  expect(
    (await owner.fetch('/access/roles/contributor', remove())).status,
  ).toBe(403);

  // The default role: Contributor on a fresh install (the owner's choice, seed 202611010004), clearable, never the
  // owner, and given once to a new member.
  const defaultRole = async () =>
    (
      (await (await owner.fetch('/access/settings')).json()).data as {
        defaultRole: string | null;
      }
    ).defaultRole;
  expect(await defaultRole()).toBe('contributor');
  expect(
    (await owner.fetch('/access/settings', json({ defaultRole: null }, 'PUT')))
      .status,
  ).toBe(200);
  expect(await defaultRole()).toBeNull();
  expect(
    (
      await owner.fetch(
        '/access/settings',
        json({ defaultRole: 'owner' }, 'PUT'),
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await owner.fetch(
        '/access/settings',
        json({ defaultRole: 'contributor' }, 'PUT'),
      )
    ).status,
  ).toBe(200);
  await createUser('accessnew', []);
  const newcomer = await signIn(testApp, {
    username: 'accessnew',
    password: PASSWORD,
  });
  // Becoming a member happens on the first projects request.
  expect((await newcomer.fetch('/projects/me')).status).toBe(200);
  const me = (await (await newcomer.fetch('/access/me')).json()).data as {
    roles: string[];
  };
  expect(me.roles).toEqual(['contributor']);
  // Booting a fresh application and signing in several people takes over 30 s on the development machine.
}, 240_000);
