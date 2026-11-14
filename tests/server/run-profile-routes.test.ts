// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import { createAppTest } from '@nocobase/app-testing/server';
import {
  signIn,
  DEFAULT_ADMIN_CREDENTIALS,
} from '@nocobase/app-plugin-authentication/testing';
import { agentsToken } from '@nocobase/app-plugin-agents/server/tokens';
import { databaseManagerToken } from '@nocobase/db';
import { IN_PROGRESS_STATUS } from '@nocobase/app-plugin-projects/shared/statuses';
import { AGENT_KIND } from '../../server/agents/ids.js';
import { agentWakerToken } from '../../server/providers/agent-executor.js';
import { createStandaloneServer } from '../../server/standalone.js';

// T11 (plan T): searching runs, continuing from a step and turning a step into a lesson, each behind a person's rights.
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
  'T11: 401, 403 for non-administrators on search, a step continues the issue and becomes a proposed lesson, secrets masked',
  { timeout: 180_000 },
  async ({ testApp, app, request }) => {
    const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
    const conn = app.container.resolve(databaseManagerToken).connection();
    const agents = app.container.resolve(agentsToken);
    const manager = await agents.agents.find(conn, 'ds-project-manager');
    await agents.agents.ensureSystem({
      id: 'ds-project-manager',
      name: manager?.name ?? 'Project manager',
      nameText: null as never,
      description: manager?.description ?? 'Manages projects',
      instructions: manager?.instructions ?? null,
      actions: [...(manager?.actions ?? [])],
      modelEntries: [{ tool: 'claude' as never, model: 'test-model' }],
    });
    const projectId = (
      (await (
        await admin.fetch(
          '/projects',
          json({ name: 'Profile Project', visibility: 'members' }),
        )
      ).json()) as { data: { id: string } }
    ).data.id;
    const issueId = (
      (await (
        await admin.fetch(
          '/projects/issues',
          json({ title: 'Has a run', projectId }),
        )
      ).json()) as { data: { id: string } }
    ).data.id;
    await conn.query
      .updateTable('pmIssues')
      .set({
        executorType: AGENT_KIND,
        executorId: 'ds-project-manager',
        statusKey: IN_PROGRESS_STATUS,
      })
      .where('id', '=', issueId)
      .execute();
    const first = await app.container
      .resolve(agentWakerToken)
      .wakeIssue({ issueId, text: 'start' });
    const runId = first!.runId!;
    for (const [seq, content, output] of [
      [1, 'Start the work.', null],
      [2, 'pnpm exec vitest run a', 'FAIL a.test.ts NEEDLE'],
      [3, 'token ghp_' + 'a'.repeat(36) + ' was printed', null],
    ] as const)
      await conn.query
        .insertInto('agRunEvents')
        .values({
          id: randomUUID(),
          runId,
          seq,
          at: new Date(),
          type: 'message',
          content,
          output,
          createdAt: new Date(),
        } as never)
        .execute();

    expect((await request('/runLogs/search?q=NEEDLE')).status).toBe(401);
    expect(
      (await request(`/runs/${runId}/continueFrom`, { method: 'POST' })).status,
    ).toBe(401);

    expect(
      (
        await admin.fetch(
          '/users',
          json({
            name: 'member9',
            username: 'member9',
            email: 'member9@example.test',
            password: PASSWORD,
            roleScopes: { app: [] },
          }),
        )
      ).status,
    ).toBe(201);
    const member = await signIn(testApp, {
      username: 'member9',
      password: PASSWORD,
    });
    expect((await member.fetch('/runLogs/search?q=NEEDLE')).status).toBe(403);
    expect([403, 404]).toContain(
      (await member.fetch(`/runs/${runId}/continueFrom`, json({ seq: 2 })))
        .status,
    );
    expect([403, 404]).toContain(
      (
        await member.fetch(
          `/runs/${runId}/lesson`,
          json({ seq: 2, rule: 'r', tag: 't', target: 'skill' }),
        )
      ).status,
    );

    // Search: a hit with a window, and a secret never comes back.
    const hits = (
      (await (await admin.fetch('/runLogs/search?q=NEEDLE')).json()) as {
        data: { runId: string; seq: number; snippet: string }[];
      }
    ).data;
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ runId, seq: 2 });
    expect(hits[0]!.snippet).toContain('NEEDLE');
    const secretHits = (
      (await (await admin.fetch('/runLogs/search?q=was%20printed')).json()) as {
        data: { snippet: string }[];
      }
    ).data;
    expect(JSON.stringify(secretHits)).not.toContain('ghp_');
    expect((await admin.fetch('/runLogs/search?q=x')).status).toBe(400);

    // A step becomes a proposed lesson, with no secret in it.
    const lesson = await admin.fetch(
      `/runs/${runId}/lesson`,
      json({
        seq: 3,
        rule: 'Never print tokens.',
        tag: 'secrets',
        target: 'skill',
      }),
    );
    expect(lesson.status).toBe(201);
    const saved = await conn.query
      .selectFrom('dsLessons')
      .selectAll()
      .where('issueId', '=', issueId)
      .execute();
    expect(saved).toHaveLength(1);
    expect(String(saved[0]!.status)).toBe('proposed');
    expect(String(saved[0]!.mistake)).not.toContain('ghp_');
    expect(String(saved[0]!.mistake)).toContain('FAIL a.test.ts');

    // Continue: one more run on the same issue, carrying the log.
    const continued = await admin.fetch(
      `/runs/${runId}/continueFrom`,
      json({ seq: 2, note: 'Try the other test file.' }),
    );
    expect(continued.status).toBe(200);
    expect(((await continued.json()) as any).data).toMatchObject({
      started: true,
    });
    expect(
      (await admin.fetch('/runs/missing/continueFrom', json({ seq: 1 })))
        .status,
    ).toBe(404);
  },
);
