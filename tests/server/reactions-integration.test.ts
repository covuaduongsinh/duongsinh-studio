// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import { createAppTest } from '@nocobase/app-testing/server';
import {
  signIn,
  DEFAULT_ADMIN_CREDENTIALS,
} from '@nocobase/app-plugin-authentication/testing';
import { databaseManagerToken } from '@nocobase/db';
import { agentsToken } from '@nocobase/app-plugin-agents/server/tokens';
import { IN_PROGRESS_STATUS } from '@nocobase/app-plugin-projects/shared/statuses';
import { AGENT_KIND } from '../../server/agents/ids.js';
import { createStandaloneServer } from '../../server/standalone.js';
import { reactionServiceToken } from '../../server/providers/reactions.js';

// T1.0 (plan T): code outside the projects hooks (a webhook, the reaction rules) wakes an issue's agent through the same
// `wake()` the hooks use, so every guard (dormant, blocked, budgets, limits) still applies.
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
  'T1.1: a red CI wakes the agent twice per push, then blocks the issue for a person and logs it',
  { timeout: 180_000 },
  async ({ testApp, app }) => {
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
        await admin.fetch('/projects', json({ name: 'Reaction Project' }))
      ).json()) as { data: { id: string } }
    ).data.id;
    const issueId = (
      (await (
        await admin.fetch(
          '/projects/issues',
          json({ title: 'Red CI', projectId }),
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
    const reactions = app.container.resolve(reactionServiceToken);
    const ctx = {
      issueId,
      projectId,
      pullRequestId: 'pr-x',
      headSha: 'sha1',
      text: 'CI is red',
    };
    expect((await reactions.react('ciFailed', ctx)).outcome).toBe('woke');
    expect((await reactions.react('ciFailed', ctx)).outcome).toBe('woke');
    expect((await reactions.react('ciFailed', ctx)).outcome).toBe('escalated');

    const attempts = await conn.query
      .selectFrom('dsReactionAttempts')
      .selectAll()
      .where('issueId', '=', issueId)
      .execute();
    expect(attempts.map((a) => Number(a.attempt)).sort()).toEqual([1, 2]);
    const issue = await conn.query
      .selectFrom('pmIssues')
      .select(['statusKey', 'needsYou'])
      .where('id', '=', issueId)
      .executeTakeFirstOrThrow();
    expect(issue.statusKey).toBe('blocked');
    expect(String(issue.needsYou)).toMatch(/ciFailed/u);
    const kinds = (
      await conn.query
        .selectFrom('dsAutopilotEvents')
        .select('kind')
        .where('issueId', '=', issueId)
        .execute()
    ).map((e) => e.kind);
    expect(kinds.filter((k) => k === 'reacted')).toHaveLength(2);
    expect(kinds.filter((k) => k === 'blocked')).toHaveLength(1);
  },
);
