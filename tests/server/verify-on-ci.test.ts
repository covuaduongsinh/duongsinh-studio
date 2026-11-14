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
import { trustedVerificationOf } from '../../server/verifications/trust.js';

// S4 (plan S): a repository's CI key reads the plan and submits for the issues of its own repository only; what it submits is
// `source = ci`; and a project that turns "verify on CI" on trusts nothing else.
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
  'S4: the CI key of a repository verifies its own issues, as source ci, and only that counts once the project asks',
  { timeout: 240_000 },
  async ({ testApp, app, request }) => {
    const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
    const conn = app.container.resolve(databaseManagerToken).connection();
    const projectId = (
      (await (await admin.fetch('/projects', json({ name: 'S4' }))).json()) as {
        data: { id: string };
      }
    ).data.id;
    const issue = (
      (await (
        await admin.fetch(
          '/projects/issues',
          json({ title: 'Verify me', projectId, statusKey: 'in_progress' }),
        )
      ).json()) as { data: { id: string; identifier: string } }
    ).data;
    const now = new Date();
    const criterion = (id: string, kind: string, value: string | null) =>
      conn.query
        .insertInto('dsIssueCriteria')
        .values({
          id,
          issueId: issue.id,
          position: id === 'c1' ? 0 : 1,
          text: id,
          checkKind: kind,
          checkValue: value,
          source: 'person',
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    await criterion('c1', 'test', 'pnpm exec vitest run tests/a.test.ts');
    await criterion('c2', 'human', null);
    const pull = (id: string, repositoryId: string, number: number) =>
      conn.query
        .insertInto('dsPullRequests')
        .values({
          id,
          repositoryId,
          number,
          issueId: issue.id,
          headBranch: `agent/${issue.identifier}`,
          headSha: 'head-1',
          baseBranch: 'main',
          state: 'open',
          draft: 0 as never,
          title: 'PR',
          url: 'https://github.test/x/y/pull/1',
          mergeability: 'clean',
          ciState: 'passed',
          checks: JSON.stringify([]),
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    await pull('pr-s4', 'repo-a', 1);

    const keyFor = async (name: string) =>
      (
        (await (
          await admin.fetch(
            '/organizationKeys',
            json({
              name,
              expiresInDays: 1,
              scope: { groups: { 'studio.verify': { level: 'write' } } },
            }),
          )
        ).json()) as { data: { key: { id: string }; secret: string } }
      ).data;
    const keyA = await keyFor('CI a');
    const keyB = await keyFor('CI b');
    const asKey = (secret: string, path: string, body?: object) =>
      request(path, {
        ...(body ? json(body) : { method: 'GET' }),
        headers: {
          ...(body ? json(body).headers : {}),
          'x-api-key': secret,
        },
      });
    const planPath = (ref: string) => `/issues/${ref}/verificationPlan`;

    // 401 with nothing; a key that is no repository's CI key reads nothing.
    expect((await request(planPath(issue.id))).status).toBe(401);
    expect([403, 404]).toContain(
      (await asKey(keyA.secret, planPath(issue.id))).status,
    );

    // Bound to repository a and b: only a's key reaches the issue whose open pull request is in a.
    await conn.query
      .insertInto('dsRepositoryCiKeys')
      .values({ repositoryId: 'repo-a', keyId: keyA.key.id, createdAt: now })
      .execute();
    await conn.query
      .insertInto('dsRepositoryCiKeys')
      .values({ repositoryId: 'repo-b', keyId: keyB.key.id, createdAt: now })
      .execute();
    expect([403, 404]).toContain(
      (await asKey(keyB.secret, planPath(issue.id))).status,
    );
    const plan = await asKey(keyA.secret, planPath(issue.identifier));
    expect(plan.status).toBe(200);
    const planned = (
      (await plan.json()) as {
        data: {
          issueId: string;
          headSha: string;
          criteria: { id: string; command: string | null }[];
        };
      }
    ).data;
    expect(planned.issueId).toBe(issue.id);
    expect(planned.headSha).toBe('head-1');
    expect(planned.criteria.find((c) => c.id === 'c1')!.command).toContain(
      'vitest',
    );

    const body = (headSha: string, exitCode: number) => ({
      issueId: issue.id,
      headSha,
      items: [{ criterionId: 'c1', exitCode, output: 'ok' }],
    });
    // An old head, an identifier instead of the id, and another repository's key are all refused.
    const stale = await asKey(keyA.secret, '/verifications', body('old', 0));
    expect(stale.status).toBe(400);
    expect(
      ((await stale.json()) as { error: { reason: string } }).error.reason,
    ).toBe('STALE_HEAD');
    expect(
      (
        await asKey(keyA.secret, '/verifications', {
          ...body('head-1', 0),
          issueId: issue.identifier,
        })
      ).status,
    ).toBe(404);
    expect([403, 404]).toContain(
      (await asKey(keyB.secret, '/verifications', body('head-1', 0))).status,
    );

    // A person's submission is `person`; the CI key's is `ci`.
    const byPerson = await admin.fetch(
      '/verifications',
      json(body('head-1', 0)),
    );
    expect(byPerson.status).toBe(200);
    expect(
      (
        (await byPerson.json()) as {
          data: { verification: { source: string } };
        }
      ).data.verification.source,
    ).toBe('person');
    const byKey = await asKey(keyA.secret, '/verifications', body('head-1', 0));
    expect(byKey.status).toBe(200);
    expect(
      (
        (await byKey.json()) as {
          data: { verification: { source: string; result: string } };
        }
      ).data.verification,
    ).toMatchObject({ source: 'ci', result: 'passed' });

    // Off: the latest verification counts, whoever sent it. On: only the CI key's.
    await asKey(keyA.secret, '/verifications', body('head-1', 0));
    await admin.fetch('/verifications', json(body('head-1', 1)));
    expect((await trustedVerificationOf(conn, issue.id))?.result).toBe(
      'failed',
    );
    expect(
      (
        await admin.fetch(
          `/projects/${projectId}/autopilot`,
          json({ verifyOnCi: true }, 'PUT'),
        )
      ).status,
    ).toBe(200);
    const trusted = await trustedVerificationOf(conn, issue.id);
    expect(trusted).toMatchObject({ source: 'ci', result: 'passed' });
  },
);
