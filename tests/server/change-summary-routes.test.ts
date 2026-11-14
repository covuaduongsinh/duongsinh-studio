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

// T7 (plan T): who sees a pull request's changes and who asks for more, and that the request is a real comment.
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
const json = (body: unknown) => ({
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    origin: 'http://localhost',
    'Idempotency-Key': `${Date.now()}.${randomUUID()}`,
  },
  body: JSON.stringify(body),
});

test(
  'T7: 401, 404 outside the issue, a request for changes is a comment, a pull request with no issue is not shown',
  { timeout: 180_000 },
  async ({ testApp, app, request }) => {
    const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
    const conn = app.container.resolve(databaseManagerToken).connection();
    const projectId = (
      (await (
        await admin.fetch(
          '/projects',
          json({ name: 'Changes Project', visibility: 'members' }),
        )
      ).json()) as { data: { id: string } }
    ).data.id;
    const issueId = (
      (await (
        await admin.fetch(
          '/projects/issues',
          json({ title: 'Has a pull request', projectId }),
        )
      ).json()) as { data: { id: string } }
    ).data.id;
    await conn.query
      .insertInto('dsGitConnections')
      .values({
        id: 'conn-x',
        provider: 'github',
        kind: 'token',
        name: 'Test',
        apiBaseUrl: 'https://github.test/api',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .execute();
    await conn.query
      .insertInto('dsRepositories')
      .values({
        id: 'repo-x',
        connectionId: 'conn-x',
        fullName: 'acme/sandbox',
        cloneUrl: 'https://github.test/acme/sandbox.git',
        webUrl: 'https://github.test/acme/sandbox',
        defaultBranch: 'main',
        branchPrefix: 'agent/',
        checksSource: 'host',
        requiredChecks: JSON.stringify([]),
        referenceChecks: JSON.stringify([]),
        pollSeconds: 300,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never)
      .execute();
    const insertPull = (id: string, linked: boolean) =>
      conn.query
        .insertInto('dsPullRequests')
        .values({
          id,
          repositoryId: 'repo-x',
          number: linked ? 7 : 8,
          issueId: linked ? issueId : null,
          headBranch: 'agent/X-1',
          headSha: 'abcdef1234567',
          baseBranch: 'main',
          state: 'open',
          draft: 0 as never,
          title: 'PR',
          url: 'https://github.test/x/y/pull/7',
          mergeability: 'clean',
          ciState: 'passed',
          checks: JSON.stringify([]),
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .execute();
    await insertPull('pr-ch-1', true);
    await insertPull('pr-ch-2', false);
    const path = (id: string, tail: string) => `/pullRequests/${id}/${tail}`;

    expect((await request(path('pr-ch-1', 'changeSummary'))).status).toBe(401);
    expect(
      (await request(path('pr-ch-1', 'requestChanges'), { method: 'POST' }))
        .status,
    ).toBe(401);

    // A pull request tied to no issue is on no page: not found, not forbidden.
    expect((await admin.fetch(path('pr-ch-2', 'changeSummary'))).status).toBe(
      404,
    );
    expect((await admin.fetch(path('missing', 'changeSummary'))).status).toBe(
      404,
    );

    // 400: an empty note.
    expect(
      (
        await admin.fetch(
          path('pr-ch-1', 'requestChanges'),
          json({ note: '   ' }),
        )
      ).status,
    ).toBe(400);

    // 403/404: someone outside the project sees nothing and says nothing.
    expect(
      (
        await admin.fetch(
          '/users',
          json({
            name: 'outsider6',
            username: 'outsider6',
            email: 'outsider6@example.test',
            password: PASSWORD,
            roleScopes: { app: [] },
          }),
        )
      ).status,
    ).toBe(201);
    const outsider = await signIn(testApp, {
      username: 'outsider6',
      password: PASSWORD,
    });
    expect([403, 404]).toContain(
      (await outsider.fetch(path('pr-ch-1', 'changeSummary'))).status,
    );
    expect([403, 404]).toContain(
      (
        await outsider.fetch(
          path('pr-ch-1', 'requestChanges'),
          json({ note: 'please' }),
        )
      ).status,
    );

    // 201: the request is a comment on the issue, written as the caller.
    const asked = await admin.fetch(
      path('pr-ch-1', 'requestChanges'),
      json({ note: 'Rename the helper.' }),
    );
    expect(asked.status).toBe(201);
    const comments = await conn.query
      .selectFrom('pmComments')
      .select(['content', 'authorType'])
      .where('issueId', '=', issueId)
      .execute();
    expect(comments).toHaveLength(1);
    expect(String(comments[0]!.content)).toContain('Rename the helper.');
    expect(String(comments[0]!.content)).toContain('#7');
    expect(String(comments[0]!.authorType)).toBe('user');
  },
);
