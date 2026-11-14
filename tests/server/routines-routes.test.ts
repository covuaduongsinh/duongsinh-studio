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

// T6 (plan T): routines are managed by whoever holds the settings permission, start off, and never double up.
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
  'T6: 401, 403, a new routine is off, an invalid schedule is refused, a run opens one issue and not a second',
  { timeout: 180_000 },
  async ({ testApp, app, request }) => {
    const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
    const conn = app.container.resolve(databaseManagerToken).connection();
    const projectId = (
      (await (
        await admin.fetch('/projects', json({ name: 'Routine Project' }))
      ).json()) as { data: { id: string } }
    ).data.id;

    expect((await request('/routines')).status).toBe(401);
    expect((await request('/routines', { method: 'POST' })).status).toBe(401);

    expect(
      (
        await admin.fetch(
          '/users',
          json({
            name: 'member8',
            username: 'member8',
            email: 'member8@example.test',
            password: PASSWORD,
            roleScopes: { app: [] },
          }),
        )
      ).status,
    ).toBe(201);
    const member = await signIn(testApp, {
      username: 'member8',
      password: PASSWORD,
    });
    expect((await member.fetch('/routines')).status).toBe(403);
    expect(
      (
        await member.fetch(
          '/routines',
          json({
            name: 'x',
            template: 'y',
            cron: '0 3 * * 1',
            projectIds: [projectId],
          }),
        )
      ).status,
    ).toBe(403);

    // The four ready-made routines are offered, and a bad schedule is refused.
    const templates = (await (
      await admin.fetch('/routineTemplates')
    ).json()) as {
      data: { key: string }[];
    };
    expect(templates.data).toHaveLength(4);
    expect(
      (
        await admin.fetch(
          '/routines',
          json({
            name: 'Bad',
            template: 'y',
            cron: 'every day',
            projectIds: [projectId],
          }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await admin.fetch(
          '/routines',
          json({
            name: 'No project',
            template: 'y',
            cron: '0 3 * * 1',
            projectIds: [],
          }),
        )
      ).status,
    ).toBe(400);

    // Created off.
    const created = await admin.fetch(
      '/routines',
      json({
        name: 'Weekly check',
        playbookSlug: 'nang-template',
        template: 'Look for a newer template.',
        cron: '0 3 * * 1',
        projectIds: [projectId],
      }),
    );
    expect(created.status).toBe(201);
    const routine = (
      (await created.json()) as { data: { id: string; enabled: boolean } }
    ).data;
    expect(routine.enabled).toBe(false);

    // A run opens one issue, with the playbook and a marker, and a second does not double up.
    const first = (
      (await (
        await admin.fetch(`/routines/${routine.id}/run`, json({}))
      ).json()) as {
        data: { created: unknown[]; skipped: { reason: string }[] };
      }
    ).data;
    expect(first.created).toHaveLength(1);
    const issues = await conn.query
      .selectFrom('pmIssues')
      .select(['description', 'title'])
      .where('projectId', '=', projectId)
      .execute();
    expect(issues).toHaveLength(1);
    expect(String(issues[0]!.description)).toContain('!nang-template');
    expect(String(issues[0]!.description)).toContain(
      `ds-routine:${routine.id}`,
    );
    const second = (
      (await (
        await admin.fetch(`/routines/${routine.id}/run`, json({}))
      ).json()) as {
        data: { created: unknown[]; skipped: { reason: string }[] };
      }
    ).data;
    expect(second.created).toHaveLength(0);
    expect(second.skipped.map((s) => s.reason)).toEqual(['alreadyOpen']);

    // Turn it on and off, make one from a template, delete.
    const on = await admin.fetch(
      `/routines/${routine.id}/enabled`,
      json({ enabled: true }),
    );
    expect(((await on.json()) as any).data.enabled).toBe(true);
    const fromTemplate = await admin.fetch(
      '/routines/fromTemplate',
      json({ key: 'licences', projectIds: [projectId] }),
    );
    expect(fromTemplate.status).toBe(201);
    expect(((await fromTemplate.json()) as any).data).toMatchObject({
      enabled: false,
      playbookSlug: null,
    });
    expect(
      (
        await admin.fetch(
          '/routines/fromTemplate',
          json({ key: 'nothing', projectIds: [projectId] }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await admin.fetch(`/routines/${routine.id}`, {
          ...json({}),
          method: 'DELETE',
        })
      ).status,
    ).toBe(200);
    expect(
      (await admin.fetch(`/routines/${routine.id}/run`, json({}))).status,
    ).toBe(404);
  },
);
