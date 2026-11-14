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
import { twoApproachesServiceToken } from '../../server/providers/approaches.js';
import { createStandaloneServer } from '../../server/standalone.js';

// T12 (plan T): two approaches only when asked, from two providers, then the holder of the issue compares them once.
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
  'T12: 401, 403/404, a refusal with one provider, two read-only runs with two, and one comparison',
  { timeout: 180_000 },
  async ({ testApp, app, request }) => {
    const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
    const conn = app.container.resolve(databaseManagerToken).connection();
    const agents = app.container.resolve(agentsToken);
    const system = (id: string, tool: string) =>
      agents.agents.ensureSystem({
        id,
        name: id,
        nameText: null as never,
        description: 'test',
        instructions: null,
        actions: [],
        modelEntries: [{ tool: tool as never, model: 'test-model' }],
      });
    await system('ds-project-manager', 'claude');
    const projectId = (
      (await (
        await admin.fetch(
          '/projects',
          json({ name: 'Approach Project', visibility: 'members' }),
        )
      ).json()) as { data: { id: string } }
    ).data.id;
    const issueId = (
      (await (
        await admin.fetch(
          '/projects/issues',
          json({ title: 'Needs a design', projectId }),
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
    const path = `/issues/${issueId}/twoApproaches`;

    expect((await request(path, { method: 'POST' })).status).toBe(401);
    expect(
      (
        await admin.fetch(
          '/users',
          json({
            name: 'outsider10',
            username: 'outsider10',
            email: 'outsider10@example.test',
            password: PASSWORD,
            roleScopes: { app: [] },
          }),
        )
      ).status,
    ).toBe(201);
    const outsider = await signIn(testApp, {
      username: 'outsider10',
      password: PASSWORD,
    });
    expect([403, 404]).toContain((await outsider.fetch(path, json({}))).status);

    // One provider is not two.
    await system('ds-claude-two', 'claude');
    const refused = await admin.fetch(path, json({}));
    expect(refused.status).toBe(400);
    expect(((await refused.json()) as any).error.reason).toBe(
      'NEED_TWO_PROVIDERS',
    );

    // Two providers: two read-only runs, none for the holder of the issue.
    await system('ds-codex-one', 'codex');
    const asked = await admin.fetch(path, json({}));
    expect(asked.status).toBe(201);
    const { runs } = ((await asked.json()) as any).data as {
      runs: { agentId: string; runId: string }[];
    };
    expect(runs.map((r) => r.agentId).sort()).toEqual([
      'ds-claude-two',
      'ds-codex-one',
    ]);
    expect(runs.map((r) => r.agentId)).not.toContain('ds-project-manager');
    const stored = await conn.query
      .selectFrom('dsTwoApproaches')
      .selectAll()
      .where('issueId', '=', issueId)
      .execute();
    expect(stored).toHaveLength(1);

    // The comparison waits for both, and happens once.
    const service = app.container.resolve(twoApproachesServiceToken);
    const finish = (runId: string) =>
      conn.query
        .updateTable('agRuns')
        .set({ status: 'completed' })
        .where('id', '=', runId)
        .execute();
    await finish(runs[0]!.runId);
    expect(await service.onRunEnded({ id: runs[0]!.runId })).toBe('waiting');
    await finish(runs[1]!.runId);
    expect(await service.onRunEnded({ id: runs[1]!.runId })).toBe('compared');
    expect(await service.onRunEnded({ id: runs[1]!.runId })).toBe('unrelated');
    const holderRuns = await conn.query
      .selectFrom('agRuns')
      .select('id')
      .where('agentId', '=', 'ds-project-manager')
      .where('subjectId', '=', issueId)
      .execute();
    expect(holderRuns.length).toBeGreaterThanOrEqual(1);
  },
);
