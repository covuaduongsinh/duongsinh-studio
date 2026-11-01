// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import { createAppTest } from '@nocobase/app-testing/server';
import {
  signIn,
  DEFAULT_ADMIN_CREDENTIALS,
} from '@nocobase/app-plugin-authentication/testing';
import { agentsToken } from '@nocobase/app-plugin-agents/server/tokens';
import type { Run } from '@nocobase/app-plugin-agents/shared/runs';
import { createStandaloneServer } from '../../server/standalone.js';
import {
  AGENT_KIND,
  ISSUE_SUBJECT,
  PROJECT_MANAGER_ID,
  RUN_FINISHED_MESSAGE,
} from '../../server/agents/ids.js';
import { runFinishedComment } from '../../server/providers/issue-subject.js';

const test = createAppTest({
  createServer: createStandaloneServer,
  config: {
    app: { publicOrigin: 'http://localhost' },
    auth: { secret: 'test-auth-secret-at-least-32-characters' },
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

interface IssueRef {
  id: string;
  identifier: string;
  revision: number;
  statusKey: string;
  executor: { type: string; id: string } | null;
}

test('the agent kind, the issue subject and the project manager are registered and queue work', async ({
  testApp,
  app,
}) => {
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const agents = app.container.resolve(agentsToken);

  // The agents plugin lists the `issue` subject, titled in the application's namespace.
  const vocabulary = (await (await admin.fetch('/agents/vocabulary')).json())
    .data as { subjects: { kind: string; title: { key: string } | null }[] };
  expect(vocabulary.subjects).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        kind: ISSUE_SUBJECT,
        title: expect.objectContaining({ key: 'studioAgents.subjects.issue' }),
      }),
    ]),
  );

  // The projects plugin knows the `agent` kind, and offers the project manager as every new issue's executor.
  const me = (await (await admin.fetch('/projects/me')).json()).data as {
    kinds: { key: string; executor: boolean; mentionable: boolean }[];
  };
  expect(me.kinds).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        key: AGENT_KIND,
        executor: true,
        mentionable: true,
      }),
    ]),
  );
  const executorsResponse = await admin.fetch('/projects/executors');
  expect(executorsResponse.status).toBe(200);
  expect((await executorsResponse.json()).data).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        type: AGENT_KIND,
        id: PROJECT_MANAGER_ID,
        isDefault: true,
      }),
    ]),
  );

  // The project manager has no tool and model yet: issues still default to it, and starting one queues nothing.
  const manager = await agents.agents.get(PROJECT_MANAGER_ID);
  expect(manager.status).toBe('enabled');
  expect(manager.instructions).toContain('Ai làm gì');
  const defaulted = await admin.fetch(
    '/projects/issues',
    json({ title: 'Coordinated issue', statusKey: 'in_progress' }),
  );
  expect(defaulted.status).toBe(201);
  const coordinated = (await defaulted.json()).data as IssueRef;
  expect(coordinated.executor).toEqual({
    type: AGENT_KIND,
    id: PROJECT_MANAGER_ID,
  });

  const runsOn = async (issueId: string) =>
    (
      await (
        await admin.fetch(
          `/agents/runs?subjectKind=${ISSUE_SUBJECT}&subjectId=${issueId}`,
        )
      ).json()
    ).data as Run[];
  expect(await runsOn(coordinated.id)).toEqual([]);

  // A workable agent of the test's own, standing in for one a runner reports.
  const coder = await agents.agents.ensureSystem({
    id: 'ds-test-coder',
    name: 'Test coder',
    description: 'Implements small changes.',
    instructions: null,
    actions: [],
    modelEntries: [{ tool: 'claude', model: 'claude-sonnet-4-5' }],
  });

  // In backlog nothing starts.
  const created = await admin.fetch(
    '/projects/issues',
    json({
      title: 'Agent issue',
      executor: { type: AGENT_KIND, id: coder.id },
    }),
  );
  expect(created.status).toBe(201);
  const issue = (await created.json()).data as IssueRef;
  expect(issue.statusKey).toBe('backlog');
  expect(await runsOn(issue.id)).toEqual([]);

  // Entering in_progress queues exactly one run for the executor (no runner in tests, so it stays queued).
  const started = await admin.fetch(
    `/projects/issues/${issue.id}`,
    json({ statusKey: 'in_progress', revision: issue.revision }, 'PATCH'),
  );
  expect(started.status).toBe(200);
  const inProgress = ((await started.json()).data as { issue: IssueRef }).issue;
  const queued = await runsOn(issue.id);
  expect(queued).toHaveLength(1);
  expect(queued[0]).toMatchObject({
    agentId: coder.id,
    status: 'queued',
    subject: { kind: ISSUE_SUBJECT, id: issue.id },
  });

  // Moving it to blocked withdraws the queued work.
  const blocked = await admin.fetch(
    `/projects/issues/${issue.id}`,
    json(
      {
        statusKey: 'blocked',
        needsYou: 'Choose the layout.',
        revision: inProgress.revision,
      },
      'PATCH',
    ),
  );
  expect(blocked.status).toBe(200);
  const afterBlocked = await runsOn(issue.id);
  expect(afterBlocked).toHaveLength(1);
  expect(afterBlocked[0]).toMatchObject({
    id: queued[0].id,
    status: 'cancelled',
  });

  // A run that ends leaves a `ds.run.finished` comment on its issue, written by the subject's sink.
  const sink = agents.subjects.get(ISSUE_SUBJECT)?.sink?.onRunFinished;
  expect(sink).toBeDefined();
  const finished: Run = {
    ...afterBlocked[0],
    status: 'completed',
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    summary: 'Added the field and its test.',
  };
  await agents.tx.run((tx) => sink?.(tx, finished) ?? Promise.resolve());
  const comments = JSON.stringify(
    await (await admin.fetch(`/projects/issues/${issue.id}/comments`)).json(),
  );
  expect(comments).toContain(RUN_FINISHED_MESSAGE);
  expect(comments).toContain(`Run ${finished.id} finished.`);
  expect(comments).toContain('Added the field and its test.');
  // That comment woke nobody.
  expect(await runsOn(issue.id)).toHaveLength(1);

  // The owner answering on the blocked issue wakes its executor again.
  expect(
    (
      await admin.fetch(
        `/projects/issues/${issue.id}/comments`,
        json({ content: 'Use the compact layout.' }),
      )
    ).status,
  ).toBe(201);
  const answered = await runsOn(issue.id);
  expect(answered).toHaveLength(2);
  expect(answered.filter((run) => run.status === 'queued')).toEqual([
    expect.objectContaining({ agentId: coder.id }),
  ]);

  // Work withdrawn before it started leaves no comment.
  expect(runFinishedComment(afterBlocked[0], (key) => key)).toBeNull();
  // Booting a fresh application on SQLite takes most of a minute on the development machine.
}, 240_000);
