import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createAppTest } from '@nocobase/app-testing/server';
import {
  signIn,
  DEFAULT_ADMIN_CREDENTIALS,
} from '@nocobase/app-plugin-authentication/testing';
import { agentsToken } from '@nocobase/app-plugin-agents/server/tokens';
import { databaseManagerToken } from '@nocobase/db';
import { AGENT_KIND } from '../../server/agents/ids.js';
import { runPriorityOf } from '../../server/agents/run-priority.js';
import { createStandaloneServer } from '../../server/standalone.js';

describe('runPriorityOf', () => {
  it('puts urgent work first (lower runs first) and unprioritised work last', () => {
    expect(
      ['urgent', 'high', 'medium', 'low', 'none'].map(runPriorityOf),
    ).toEqual([0, 1, 2, 3, 4]);
    expect(runPriorityOf(undefined)).toBe(4);
    expect(runPriorityOf('something-new')).toBe(4);
  });
});

const test = createAppTest({
  createServer: createStandaloneServer,
  config: {
    app: { publicOrigin: 'http://localhost' },
    auth: { secret: 'test-auth-secret-at-least-32-characters' },
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

// With one runner slot, an urgent issue must not wait behind older, less important ones.
test(
  'a run queued for an issue carries the issue priority, so urgent work is claimed first',
  { timeout: 240_000 },
  async ({ testApp, app }) => {
    const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
    const agents = app.container.resolve(agentsToken);
    const coder = await agents.agents.ensureSystem({
      id: 'ds-test-coder',
      name: 'Test coder',
      description: 'Implements.',
      instructions: null,
      actions: ['pm.issues/view', 'pm.issues/comment'],
      modelEntries: [{ tool: 'claude', model: 'claude-sonnet-4-5' }],
    });
    const project = (
      await (
        await admin.fetch('/projects', json({ name: 'Priorities' }))
      ).json()
    ).data as { id: string };
    const make = async (priority: string) => {
      const response = await admin.fetch(
        '/projects/issues',
        json({
          title: priority,
          priority,
          statusKey: 'in_progress',
          projectId: project.id,
          executor: { type: AGENT_KIND, id: coder.id },
        }),
      );
      expect(response.status).toBe(201);
      return ((await response.json()).data as { id: string }).id;
    };
    // Created from the least to the most important: age alone would run them in this order.
    const low = await make('low');
    const none = await make('none');
    const urgent = await make('urgent');

    const conn = app.container.resolve(databaseManagerToken).connection();
    const rows = await conn.query
      .selectFrom('agRuns')
      .select(['subjectId', 'priority', 'status'])
      .where('subjectKind', '=', 'issue')
      .execute();
    const priorityOf = (id: string) =>
      Number(rows.find((row) => row.subjectId === id)?.priority);
    expect(rows.every((row) => row.status === 'queued')).toBe(true);
    expect([priorityOf(urgent), priorityOf(low), priorityOf(none)]).toEqual([
      0, 3, 4,
    ]);
  },
);
