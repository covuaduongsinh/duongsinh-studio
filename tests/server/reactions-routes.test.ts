// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import { createAppTest } from '@nocobase/app-testing/server';
import {
  signIn,
  DEFAULT_ADMIN_CREDENTIALS,
} from '@nocobase/app-plugin-authentication/testing';
import { databaseManagerToken } from '@nocobase/db';
import { createStandaloneServer } from '../../server/standalone.js';

// T1.5 (plan T): the reaction rules have an administration surface, and an issue shows what Studio did by itself.
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
const json = (body: unknown, method = 'POST') => ({
  method,
  headers: {
    'content-type': 'application/json',
    origin: 'http://localhost',
    'Idempotency-Key': `${Date.now()}.${randomUUID()}`,
  },
  body: JSON.stringify(body),
});

test(
  'T1.5: rules are readable and changeable by people who may, and an issue lists its reactions',
  { timeout: 180_000 },
  async ({ testApp, app, request }) => {
    const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
    const conn = app.container.resolve(databaseManagerToken).connection();
    const projectId = (
      (await (
        await admin.fetch(
          '/projects',
          json({ name: 'Rules Project', visibility: 'members' }),
        )
      ).json()) as { data: { id: string } }
    ).data.id;
    const issueId = (
      (await (
        await admin.fetch(
          '/projects/issues',
          json({ title: 'Has reactions', projectId }),
        )
      ).json()) as { data: { id: string } }
    ).data.id;

    // 401
    expect((await request(`/projects/${projectId}/reactions`)).status).toBe(
      401,
    );
    expect((await request(`/issues/${issueId}/reactions`)).status).toBe(401);

    // 200: the built-in defaults, none overridden.
    const read = await admin.fetch(`/projects/${projectId}/reactions`);
    expect(read.status).toBe(200);
    const rules = ((await read.json()) as { data: any[] }).data;
    expect(rules.map((r) => r.event)).toEqual([
      'ciFailed',
      'conflicts',
      'reviewChanges',
      'runFailed',
      'prLineComment',
      'greenAndApproved',
    ]);
    expect(rules.find((r) => r.event === 'ciFailed')).toMatchObject({
      enabled: true,
      maxAttempts: 2,
      maxPerIssue: 5,
      overridden: false,
    });

    // Change one rule: it becomes an override and the others stay.
    const changed = await admin.fetch(
      `/projects/${projectId}/reactions/ciFailed`,
      json({ enabled: false, maxAttempts: 3 }, 'PUT'),
    );
    expect(changed.status).toBe(200);
    const after = (
      (await (
        await admin.fetch(`/projects/${projectId}/reactions`)
      ).json()) as {
        data: any[];
      }
    ).data;
    expect(after.find((r) => r.event === 'ciFailed')).toMatchObject({
      enabled: false,
      maxAttempts: 3,
      overridden: true,
    });
    expect(after.find((r) => r.event === 'conflicts').overridden).toBe(false);
    // A second change keeps one row.
    await admin.fetch(
      `/projects/${projectId}/reactions/ciFailed`,
      json({ maxAttempts: 1 }, 'PUT'),
    );
    expect(
      await conn.query
        .selectFrom('dsReactionRules')
        .select('id')
        .where('projectId', '=', projectId)
        .execute(),
    ).toHaveLength(1);

    // 400: an unknown event, a limit out of range.
    expect(
      (
        await admin.fetch(
          `/projects/${projectId}/reactions/nothing`,
          json({ enabled: true }, 'PUT'),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await admin.fetch(
          `/projects/${projectId}/reactions/ciFailed`,
          json({ maxAttempts: 99 }, 'PUT'),
        )
      ).status,
    ).toBe(400);

    // 403/404: a member of nothing neither reads nor changes them.
    expect(
      (
        await admin.fetch(
          '/users',
          json({
            name: 'outsider2',
            username: 'outsider2',
            email: 'outsider2@example.test',
            password: PASSWORD,
            roleScopes: { app: [] },
          }),
        )
      ).status,
    ).toBe(201);
    const outsider = await signIn(testApp, {
      username: 'outsider2',
      password: PASSWORD,
    });
    expect([403, 404]).toContain(
      (await outsider.fetch(`/projects/${projectId}/reactions`)).status,
    );
    expect([403, 404]).toContain(
      (
        await outsider.fetch(
          `/projects/${projectId}/reactions/ciFailed`,
          json({ enabled: false }, 'PUT'),
        )
      ).status,
    );
    expect([403, 404]).toContain(
      (await outsider.fetch(`/issues/${issueId}/reactions`)).status,
    );

    // The issue lists what Studio did by itself, newest first.
    await conn.query
      .insertInto('dsAutopilotEvents')
      .values({
        id: randomUUID(),
        projectId,
        issueId,
        pullRequestId: 'pr-1',
        kind: 'reacted',
        reason: null,
        data: JSON.stringify({ reaction: 'ciFailed', attempt: 1 }),
        createdAt: new Date(),
      })
      .execute();
    const list = await admin.fetch(`/issues/${issueId}/reactions`);
    expect(list.status).toBe(200);
    const items = ((await list.json()) as { data: any[] }).data;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kind: 'reacted',
      event: 'ciFailed',
      attempt: 1,
    });
  },
);
