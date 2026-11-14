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
import {
  IN_PROGRESS_STATUS,
  DONE_STATUS,
} from '@nocobase/app-plugin-projects/shared/statuses';
import { AGENT_KIND } from '../../server/agents/ids.js';
import { createStandaloneServer } from '../../server/standalone.js';
import { agentWakerToken } from '../../server/providers/agent-executor.js';

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
  'T1.0: the waker enqueues a run for an in-progress issue and leaves a finished one alone',
  { timeout: 180_000 },
  async ({ testApp, app }) => {
    const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
    const conn = app.container.resolve(databaseManagerToken).connection();
    const projectId = (
      (await (
        await admin.fetch('/projects', json({ name: 'Waker Project' }))
      ).json()) as { data: { id: string } }
    ).data.id;
    const make = async (title: string, statusKey: string) => {
      const id = (
        (await (
          await admin.fetch('/projects/issues', json({ title, projectId }))
        ).json()) as { data: { id: string } }
      ).data.id;
      await conn.query
        .updateTable('pmIssues')
        .set({
          executorType: AGENT_KIND,
          executorId: 'ds-project-manager',
          statusKey,
        })
        .where('id', '=', id)
        .execute();
      return id;
    };
    const active = await make('Active', IN_PROGRESS_STATUS);
    const finished = await make('Finished', DONE_STATUS);
    const waker = app.container.resolve(agentWakerToken);
    // A fresh database has no runner, so the project manager has no tool and model to work with yet.
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

    const started = await waker.wakeIssue({
      issueId: active,
      text: 'CI is red on your pull request: fix it.',
    });
    expect(started).toMatchObject({ started: true, triggerType: 'reaction' });
    const runs = await conn.query
      .selectFrom('agRuns')
      .select('id')
      .where('id', '=', started!.runId ?? '')
      .execute();
    expect(runs).toHaveLength(1);

    expect(
      await waker.wakeIssue({ issueId: finished, text: 'x' }),
    ).toMatchObject({ started: false, skipped: 'dormant' });
    // An issue nobody works on, or one that does not exist, is not woken.
    expect(await waker.wakeIssue({ issueId: 'missing', text: 'x' })).toBeNull();
  },
);
