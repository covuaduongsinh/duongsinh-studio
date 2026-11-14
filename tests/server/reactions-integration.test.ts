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
import { retrySkippedReactions } from '../../server/reactions/retry.js';

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

async function setup(testApp: any, app: any) {
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
      await admin.fetch('/projects', json({ name: 'S1 Project' }))
    ).json()) as {
      data: { id: string };
    }
  ).data.id;
  const issueId = (
    (await (
      await admin.fetch(
        '/projects/issues',
        json({ title: 'In review', projectId }),
      )
    ).json()) as { data: { id: string } }
  ).data.id;
  return { conn, projectId, issueId };
}

test(
  'S1a/S1c: a conflict on an issue in review wakes the author and moves it back; a skipped reaction leaves a line and is retried once',
  { timeout: 180_000 },
  async ({ testApp, app }) => {
    const { conn, projectId, issueId } = await setup(testApp, app);
    await conn.query
      .updateTable('pmIssues')
      .set({
        executorType: AGENT_KIND,
        executorId: 'ds-project-manager',
        statusKey: 'in_review',
        needsYou: 'Chờ nghiệm thu',
      })
      .where('id', '=', issueId)
      .execute();
    const reactions = app.container.resolve(reactionServiceToken);
    const ctx = {
      issueId,
      projectId,
      pullRequestId: 'pr-s1',
      headSha: 'sha1',
      text: 'Conflict',
    };
    expect((await reactions.react('conflicts', ctx)).outcome).toBe('woke');
    const issue = await conn.query
      .selectFrom('pmIssues')
      .select(['statusKey', 'needsYou'])
      .where('id', '=', issueId)
      .executeTakeFirstOrThrow();
    expect(issue.statusKey).toBe('in_progress');
    expect(issue.needsYou).toBeNull();

    // An issue without an agent: skipped, with a line on the issue.
    await conn.query
      .updateTable('pmIssues')
      .set({ executorType: null, executorId: null })
      .where('id', '=', issueId)
      .execute();
    expect((await reactions.react('ciFailed', ctx)).outcome).toBe('skipped');
    const skipped = await conn.query
      .selectFrom('dsAutopilotEvents')
      .selectAll()
      .where('issueId', '=', issueId)
      .where('kind', '=', 'reactionSkipped')
      .execute();
    expect(skipped).toHaveLength(1);
    expect(skipped[0]!.reason).toBe('noAgent');

    // A transient skip is tried again while the pull request is still red on the same head, and only once.
    await conn.query
      .insertInto('dsPullRequests')
      .values({
        id: 'pr-s1',
        repositoryId: 'repo-x',
        number: 5,
        issueId,
        headBranch: 'agent/x',
        headSha: 'sha1',
        baseBranch: 'main',
        state: 'open',
        draft: 0 as never,
        title: 'PR',
        url: 'https://github.test/x/y/pull/5',
        mergeability: 'clean',
        ciState: 'failed',
        checks: JSON.stringify([]),
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .execute();
    await conn.query
      .insertInto('dsAutopilotEvents')
      .values({
        id: randomUUID(),
        projectId,
        issueId,
        pullRequestId: 'pr-s1',
        kind: 'reactionSkipped',
        reason: 'limited',
        data: JSON.stringify({
          reaction: 'ciFailed',
          reason: 'limited',
          headSha: 'sha1',
          retry: 'pending',
          text: 'CI is red',
        }),
        createdAt: new Date(),
      })
      .execute();
    const calls: unknown[] = [];
    const react = async (event: unknown, context: unknown) => {
      calls.push([event, context]);
    };
    expect(await retrySkippedReactions({ conn, react: react as never })).toBe(
      1,
    );
    expect(await retrySkippedReactions({ conn, react: react as never })).toBe(
      0,
    );
    expect(calls).toHaveLength(1);
  },
);
