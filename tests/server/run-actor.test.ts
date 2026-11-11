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
import { createStandaloneServer } from '../../server/standalone.js';
import { DEFAULT_AGENT_ACTIONS } from '../../server/agents/actions.js';
import { AGENT_KIND } from '../../server/agents/ids.js';

const test = createAppTest({
  createServer: createStandaloneServer,
  config: {
    app: { publicOrigin: 'http://localhost' },
    auth: { secret: 'test-auth-secret-at-least-32-characters' },
  },
});

const MODEL = 'claude-sonnet-4-5';
/** The runner protocol this agents plugin speaks (`PROTOCOL_VERSION` of `@nocobase/agent-protocol`). */
const PROTOCOL_VERSION = 14;

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
  revision: number;
  statusKey: string;
}

test('a run token acts as its agent: comments are the agent’s and status moves keep to the agent kind', async ({
  testApp,
  app,
  request,
}) => {
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const agents = app.container.resolve(agentsToken);
  const ownerId = (
    (await (await admin.fetch('/access/me')).json()).data as { userId: string }
  ).userId;

  const coder = await agents.agents.ensureSystem({
    id: 'ds-test-coder',
    name: 'Test coder',
    description: 'Implements small changes.',
    instructions: null,
    actions: [...DEFAULT_AGENT_ACTIONS],
    modelEntries: [{ tool: 'claude', model: MODEL }],
  });

  // The owner's issue, executed by the agent and in progress: one run waits in the queue.
  const created = await admin.fetch(
    '/projects/issues',
    json({
      title: 'Run actor issue',
      statusKey: 'in_progress',
      executor: { type: AGENT_KIND, id: coder.id },
    }),
  );
  expect(created.status).toBe(201);
  const issue = (await created.json()).data as IssueRef;

  // A personal runner of the owner registers, reports Claude signed in with the model, and claims the run: its
  // payload carries the run token the agent's CLI calls the application with.
  const registration = await agents.runners.createRegistrationToken(ownerId, {
    trust: 'ownerOnly',
  });
  const registered = await agents.runners.register({
    registrationToken: registration.token,
    name: 'test-runner',
    hostname: 'test-host',
    os: 'linux',
    arch: 'x64',
    version: '0.0.0-test',
    protocolVersion: PROTOCOL_VERSION,
    features: ['input', 'workspaceKey', 'checkout', 'skills'],
    tools: [
      {
        kind: 'claude',
        authenticated: true,
        status: 'ready',
        models: [{ id: MODEL }],
      },
    ],
  });
  const runner = await agents.runners.authenticate(registered.runnerKey);
  const payloads = await agents.claims.claim(runner, 1);
  expect(payloads).toHaveLength(1);
  const token = String(payloads[0].cli.credential.content.token);
  expect(token).toMatch(/^fgr_/);

  const asRun = (path: string, init: RequestInit = {}) =>
    request(path, {
      ...init,
      headers: {
        ...(init.headers as Record<string, string> | undefined),
        'x-nocobase-run-token': token,
      },
    });

  // The agent's comment is written by the agent kind, not by the person the run acts for.
  const commented = await asRun(
    `/projects/issues/${issue.id}/comments`,
    json({ content: 'Đã đọc issue.' }),
  );
  expect(commented.status).toBe(201);
  const threads = (
    await (await admin.fetch(`/projects/issues/${issue.id}/comments`)).json()
  ).data as {
    root: { content: string; authorType: string; authorId: string };
  }[];
  expect(
    threads
      .map((thread) => thread.root)
      .find((root) => root.content === 'Đã đọc issue.'),
  ).toMatchObject({ authorType: AGENT_KIND, authorId: coder.id });

  const current = async () =>
    (await (await asRun(`/projects/issues/${issue.id}`)).json()).data as {
      issue?: IssueRef;
    } & IssueRef;
  const read = await current();
  const revision = (read.issue ?? read).revision;

  // A move outside the agent kind's moves is refused; one along them is made as the agent.
  const done = await asRun(
    `/projects/issues/${issue.id}`,
    json({ statusKey: 'done', revision }, 'PATCH'),
  );
  // The run holds `pm.issues/close` by default, so the refusal comes from the agent kind's moves, not the permission.
  expect(done.status).toBe(400);
  expect(JSON.stringify(await done.json())).toContain('TRANSITION_NOT_ALLOWED');
  // Back to backlog needs no other permission, so the agent kind's moves refuse it.
  const backlog = await asRun(
    `/projects/issues/${issue.id}`,
    json({ statusKey: 'backlog', revision }, 'PATCH'),
  );
  expect(backlog.status).toBe(400);
  expect(JSON.stringify(await backlog.json())).toContain(
    'TRANSITION_NOT_ALLOWED',
  );

  // H1b: moving to in_review requires criteria and passing verification
  const conn = app.container.resolve(databaseManagerToken).connection();
  await conn.query
    .insertInto('dsIssueCriteria')
    .values({
      id: 'crit-run-actor-1',
      issueId: issue.id,
      text: 'Tiêu chí kiểm thử run actor',
      checkKind: 'command',
      checkValue: 'pnpm test',
      position: 0,
      source: 'human',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .execute();
  await conn.query
    .insertInto('dsVerifications')
    .values({
      id: 'verif-run-actor-1',
      issueId: issue.id,
      headSha: 'abc1234def5678',
      attempt: 1,
      result: 'passed',
      createdAt: new Date(),
    })
    .execute();

  const review = await asRun(
    `/projects/issues/${issue.id}`,
    json(
      {
        statusKey: 'in_review',
        needsYou: 'Kiểm tra kết quả.',
        revision,
      },
      'PATCH',
    ),
  );
  expect(review.status).toBe(200);
  const moved = ((await review.json()).data as { issue: IssueRef }).issue;
  expect(moved.statusKey).toBe('in_review');

  // What the plugins newly let run credentials reach stays bounded by the gate: `runKeyScope` shrinks the permissions
  // of the person the run acts for, whatever a route admits. This agent has no business actions at all.
  expect((await asRun('/projects', json({ name: 'By a run' }))).status).toBe(
    403,
  );
  // Studio's own person-only routes refuse a run outright.
  expect((await asRun('/autopilot/events')).status).toBe(403);
  expect((await asRun('/access/catalog')).status).toBe(403);

  // The person's session is unaffected: the owner still moves the issue anywhere, as themselves.
  expect(
    (
      await admin.fetch(
        `/projects/issues/${issue.id}`,
        json({ statusKey: 'done', revision: moved.revision }, 'PATCH'),
      )
    ).status,
  ).toBe(200);
  // Booting a fresh application on SQLite takes most of a minute on the development machine.
}, 240_000);
