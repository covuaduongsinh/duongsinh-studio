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

const PASSWORD = 'Studio-test-123!';
const json = (body: unknown, method = 'POST') => ({
  method,
  headers: {
    'content-type': 'application/json',
    origin: 'http://localhost',
    'Idempotency-Key': `${Date.now()}.${randomUUID()}`,
  },
  body: JSON.stringify(body),
});

interface OrgKey {
  id: string;
  name: string;
  status: string;
  scope: { groups: Record<string, { level: string }> };
  createdBy: { id: string } | null;
}
interface Group {
  id: string;
  levels: string[];
  held: Record<string, boolean>;
}

test(
  'organization keys belong to the organization, reach only what their scope and giver allow, and keep a history',
  { timeout: 240_000 },
  async ({ testApp, request }) => {
    for (const path of [
      '/organizationKeys',
      '/organizationKeys/scopeOptions',
      '/organizationKeys/x',
      '/organizationKeys/x/events',
    ])
      expect((await request(path)).status).toBe(401);
    expect((await request('/organizationKeys', json({}))).status).toBe(401);

    const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
    const ownerId = (
      (await (await admin.fetch('/auth/get-session')).json()) as {
        user: { id: string };
      }
    ).user.id;

    // A contributor has nothing to do with them.
    expect(
      (
        await admin.fetch(
          '/users',
          json({
            name: 'contributor1',
            username: 'contributor1',
            email: 'contributor1@example.test',
            password: PASSWORD,
            roleScopes: { app: [CONTRIBUTOR_SET_KEY] },
          }),
        )
      ).status,
    ).toBe(201);
    const contributor = await signIn(testApp, {
      username: 'contributor1',
      password: PASSWORD,
    });
    expect((await contributor.fetch('/organizationKeys')).status).toBe(403);

    const options = (
      await (await admin.fetch('/organizationKeys/scopeOptions')).json()
    ).data as { groups: Group[] };
    const group = options.groups.find(({ id }) => id === 'releases.apps');
    if (!group)
      throw new Error(
        `The releases plugin offers its apps group: ${JSON.stringify(options).slice(0, 600)}`,
      );
    const scope = { groups: { [group.id]: { level: group.levels[0] } } };

    const made = await admin.fetch(
      '/organizationKeys',
      json({ name: 'CI', expiresInDays: 30, scope }),
    );
    expect(made.status).toBe(201);
    const created = (await made.json()).data as { key: OrgKey; secret: string };
    expect(created.secret.length).toBeGreaterThan(10);
    expect(created.key).toMatchObject({
      name: 'CI',
      status: 'active',
      createdBy: { id: ownerId },
    });

    // The list shows it to who may read, and never the secret.
    const listedText = await (await admin.fetch('/organizationKeys')).text();
    expect(listedText).toContain(created.key.id);
    expect(listedText).not.toContain(created.secret);

    // It acts as the organization's account, not its creator, and no key manages keys.
    const withKey = (secret: string, path: string) =>
      request(path, { headers: { 'x-api-key': secret } });
    const session = await withKey(created.secret, '/auth/get-session');
    expect(session.status).toBe(200);
    expect(
      ((await session.json()) as { user: { id: string; kind: string } }).user,
    ).toMatchObject({ id: 'studio-organization-keys', kind: 'service' });
    expect([401, 403]).toContain(
      (await withKey(created.secret, '/organizationKeys')).status,
    );
    // The scope narrows: this key reaches Apps, not issues, and a key for issues reaches them.
    expect(
      (
        await admin.fetch(
          '/projects/issues',
          json({ title: 'Việc để đọc', statusKey: 'backlog' }),
        )
      ).status,
    ).toBe(201);
    const issuesWith = async (secret: string) => {
      const answer = (await (
        await withKey(secret, '/projects/issues')
      ).json()) as { data: { items?: unknown[] } | unknown[] };
      return Array.isArray(answer.data)
        ? answer.data.length
        : (answer.data.items ?? []).length;
    };
    expect(await issuesWith(created.secret)).toBe(0);
    const issuesKey = (
      await (
        await admin.fetch(
          '/organizationKeys',
          json({
            name: 'Đọc công việc',
            expiresInDays: 1,
            scope: { groups: { 'projects.issues': { level: 'read' } } },
          }),
        )
      ).json()
    ).data as { secret: string };
    expect(await issuesWith(issuesKey.secret)).toBeGreaterThan(0);

    // Renamed, then disabled: it stops working until enabled again.
    expect(
      (
        await (
          await admin.fetch(
            `/organizationKeys/${created.key.id}`,
            json({ name: 'CI chính' }, 'PATCH'),
          )
        ).json()
      ).data.name,
    ).toBe('CI chính');
    const disabled = await admin.fetch(
      `/organizationKeys/${created.key.id}/disable`,
      json({}),
    );
    expect(((await disabled.json()).data as OrgKey).status).toBe('disabled');
    expect(
      (await withKey(created.secret, '/auth/get-session')).status,
    ).not.toBe(200);
    expect(
      (
        await admin.fetch(
          `/organizationKeys/${created.key.id}/enable`,
          json({}),
        )
      ).status,
    ).toBe(200);
    expect((await withKey(created.secret, '/auth/get-session')).status).toBe(
      200,
    );

    // A new secret keeps the key and ends the old one.
    const rotated = (
      await (
        await admin.fetch(
          `/organizationKeys/${created.key.id}/rotate`,
          json({}),
        )
      ).json()
    ).data as { key: OrgKey; secret: string };
    expect(rotated.key.id).toBe(created.key.id);
    expect(rotated.secret).not.toBe(created.secret);
    expect(
      (await withKey(created.secret, '/auth/get-session')).status,
    ).not.toBe(200);
    expect((await withKey(rotated.secret, '/auth/get-session')).status).toBe(
      200,
    );

    // Its scope changes; a role that only manages keys cannot give what it does not hold.
    const top = group.levels.at(-1) ?? 'read';
    const widened = await admin.fetch(
      `/organizationKeys/${created.key.id}/scope`,
      json({ scope: { groups: { [group.id]: { level: top } } } }, 'PUT'),
    );
    expect(widened.status).toBe(200);
    expect(
      ((await widened.json()).data as OrgKey).scope.groups[group.id]?.level,
    ).toBe(top);
    expect(
      (
        await admin.fetch(
          '/access/roles',
          json({
            key: 'keyman',
            title: 'Key manager',
            settings: {
              'studio.apiKeys/read': true,
              'studio.apiKeys/manage': true,
            },
          }),
        )
      ).status,
    ).toBe(201);
    expect(
      (
        await admin.fetch(
          '/users',
          json({
            name: 'keyman1',
            username: 'keyman1',
            email: 'keyman1@example.test',
            password: PASSWORD,
            roleScopes: { app: ['ds-keyman'] },
          }),
        )
      ).status,
    ).toBe(201);
    const keyman = await signIn(testApp, {
      username: 'keyman1',
      password: PASSWORD,
    });
    expect((await keyman.fetch('/organizationKeys')).status).toBe(200);
    const exceeds = await keyman.fetch(
      '/organizationKeys',
      json({
        name: 'Quá quyền',
        expiresInDays: 30,
        scope: { groups: { [group.id]: { level: top } } },
      }),
    );
    expect(exceeds.status).toBe(403);
    expect(
      ((await exceeds.json()) as { error: { reason: string } }).error.reason,
    ).toBe('KEY_SCOPE_EXCEEDS_YOURS');

    // Deleted: gone, its secret dead, its history kept.
    expect(
      (
        await admin.fetch(`/organizationKeys/${created.key.id}`, {
          ...json({}, 'DELETE'),
          body: undefined,
        })
      ).status,
    ).toBe(204);
    expect(
      (await admin.fetch(`/organizationKeys/${created.key.id}`)).status,
    ).toBe(404);
    expect(
      (await withKey(rotated.secret, '/auth/get-session')).status,
    ).not.toBe(200);
    const events = (
      await (
        await admin.fetch(`/organizationKeys/${created.key.id}/events`)
      ).json()
    ).data as { action: string; actor: { id: string } | null }[];
    expect(events.map((event) => event.action)).toEqual(
      expect.arrayContaining([
        'created',
        'updated',
        'disabled',
        'enabled',
        'rotated',
        'permissions-changed',
        'deleted',
      ]),
    );
    expect(events[0]?.actor?.id).toBe(ownerId);
  },
);
