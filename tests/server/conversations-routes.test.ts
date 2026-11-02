// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import { createAppTest } from '@nocobase/app-testing/server';
import {
  signIn,
  DEFAULT_ADMIN_CREDENTIALS,
} from '@nocobase/app-plugin-authentication/testing';
import { agentsToken } from '@nocobase/app-plugin-agents/server/tokens';
import { agentSessionsToken } from '@nocobase/app-plugin-agent-sessions/server/tokens';
import { createStandaloneServer } from '../../server/standalone.js';
import { CONTRIBUTOR_SET_KEY } from '../../server/access/roles.js';
import {
  DEFAULT_AGENT_ACTIONS,
  PLANS_USE_ACTION,
} from '../../server/agents/actions.js';
import { PLAN_DECIDED_NEWS } from '../../server/conversations/studio-conversations.js';

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

const PASSWORD = 'Studio-test-123!';
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

test('Ask agent: a conversation pinned to an issue reads Studio’s rules and proposes plans the person decides', async ({
  testApp,
  app,
  request,
}) => {
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const ownerId = (
    (await (await admin.fetch('/access/me')).json()).data as { userId: string }
  ).userId;
  const project = (
    await (
      await admin.fetch(
        '/projects',
        json({ name: 'Dự án kín', visibility: 'members' }),
      )
    ).json()
  ).data as { id: string };
  const issue = (
    await (
      await admin.fetch(
        '/projects/issues',
        json({ title: 'Bản dịch vi-VN', projectId: project.id }),
      )
    ).json()
  ).data as { id: string; identifier: string };

  const agents = app.container.resolve(agentsToken);
  const conversations = agents.conversations;
  expect(conversations.sources.has('askAgent')).toBe(true);
  expect(DEFAULT_AGENT_ACTIONS).toContain(PLANS_USE_ACTION);

  // What the issue and project pages pin resolves for the owner, and to nothing for a contributor outside the project.
  const pinned = {
    route: `/issues/${issue.identifier}`,
    items: [
      { kind: 'issue', id: issue.id },
      { kind: 'project', id: project.id },
    ],
  };
  const forOwner = await conversations.contextKinds.resolve(
    agents.tx.read(),
    ownerId,
    pinned,
  );
  expect(forOwner.items).toEqual([
    expect.objectContaining({
      kind: 'issue',
      id: issue.id,
      key: issue.identifier,
      url: `/issues/${issue.identifier}`,
    }),
    expect.objectContaining({ kind: 'project', id: project.id, title: 'Dự án kín' }),
  ]);
  expect(
    (
      await admin.fetch(
        '/users',
        json({
          name: 'contributor1',
          username: 'contributor1',
          email: 'contributor1@example.test',
          password: PASSWORD,
          roleScopes: { app: [CONTRIBUTOR_SET_KEY] },
        }),
      )
    ).status,
  ).toBe(201);
  const contributor = await signIn(testApp, {
    username: 'contributor1',
    password: PASSWORD,
  });
  const contributorId = (
    (await (await contributor.fetch('/access/me')).json()).data as {
      userId: string;
    }
  ).userId;
  const forContributor = await conversations.contextKinds.resolve(
    agents.tx.read(),
    contributorId,
    pinned,
  );
  expect(forContributor.items).toEqual([]);
  expect(forContributor.dropped).toBe(2);

  // Sessions on people's computers know the issue kind and the projects each person sees.
  const sessions = app.container.resolve(agentSessionsToken);
  expect(sessions).toBeDefined();
  const sessionProjects = await contributor.fetch('/agentSessions/projects');
  expect(sessionProjects.status).toBe(200);
  expect(
    ((await sessionProjects.json()).data as { id: string }[]).map(
      (entry) => entry.id,
    ),
  ).not.toContain(project.id);
  const ownerProjects = (
    await (await admin.fetch('/agentSessions/projects')).json()
  ).data as { id: string }[];
  expect(ownerProjects.map((entry) => entry.id)).toContain(project.id);

  // The owner asks an agent about the issue; a runner of theirs takes the conversation's run. A plan's rows are checked
  // as the run, so an agent proposes only what it may do itself: creating issues is not a default action and is given
  // here (without it the rehearsal refuses the row, "You may not create issues").
  const helper = await agents.agents.ensureSystem({
    id: 'ds-test-chat',
    name: 'Chat helper',
    description: 'Answers questions about issues.',
    instructions: null,
    actions: [...DEFAULT_AGENT_ACTIONS, 'pm.issues/create'],
    modelEntries: [{ tool: 'claude', model: MODEL }],
  });
  const registration = await agents.runners.createRegistrationToken(ownerId, {
    trust: 'ownerOnly',
  });
  const registered = await agents.runners.register({
    registrationToken: registration.token,
    name: 'chat-runner',
    hostname: 'test-host',
    os: 'linux',
    arch: 'x64',
    version: '0.0.0-test',
    protocolVersion: PROTOCOL_VERSION,
    features: ['input', 'workspaceKey', 'checkout', 'mounts'],
    tools: [
      {
        kind: 'claude',
        authenticated: true,
        status: 'ready',
        models: [{ id: MODEL }],
      },
    ],
  });
  const started = await conversations.start(ownerId, {
    source: 'askAgent',
    agentId: helper.id,
    text: `${issue.identifier} đang ở trạng thái nào?`,
    context: pinned,
  });
  const conversationId = started.conversation.id;
  expect(conversationId).toBeTruthy();
  const runner = await agents.runners.authenticate(registered.runnerKey);
  const [payload] = await agents.claims.claim(runner, 1);
  expect(payload).toBeDefined();
  const brief = JSON.stringify(payload);
  expect(brief).toContain('https://nocobase.dsc.edu.vn');
  expect(brief).toContain('propose one operation plan');
  expect(brief).toContain(issue.identifier);

  // The agent proposes a plan with its run token: the plan is the conversation's, for the owner to decide.
  const runToken = String(payload.cli.credential.content.token);
  const asRun = (path: string, init: RequestInit = {}) =>
    request(path, {
      ...init,
      headers: {
        ...(init.headers as Record<string, string> | undefined),
        'x-nocobase-run-token': runToken,
      },
    });
  const proposed = await asRun(
    '/projects/plans',
    json({
      title: 'Tạo issue con cho bản dịch',
      rows: [
        {
          op: 'issue.create',
          params: {
            title: 'Dịch trang Issues',
            projectId: project.id,
            parentIssueId: issue.id,
          },
        },
      ],
    }),
  );
  expect(proposed.status).toBe(201);
  const plan = (await proposed.json()).data as {
    id: string;
    revision: number;
    source: { kind: string; key: string };
    deciderUserId: string;
  };
  expect(plan.source).toMatchObject({
    kind: 'conversation',
    key: `conversation:${conversationId}`,
  });
  expect(plan.deciderUserId).toBe(ownerId);
  // The conversation's plans list for the owner, as the chat's plan cards read them.
  const listed = await admin.fetch(
    `/projects/plans?sourceKind=conversation&sourceKey=${encodeURIComponent(`conversation:${conversationId}`)}`,
  );
  expect(listed.status).toBe(200);
  expect(
    ((await listed.json()).data as { id: string }[]).map((entry) => entry.id),
  ).toEqual([plan.id]);

  // The owner executes it; the conversation hears how it went.
  const executed = await admin.fetch(
    `/projects/plans/${plan.id}/execute`,
    json({ revision: plan.revision }),
  );
  expect(executed.status).toBe(200);
  expect(((await executed.json()).data as { status: string }).status).toBe(
    'executed',
  );
  const messages = await conversations.messages(ownerId, conversationId, {
    limit: 50,
  });
  expect(JSON.stringify(messages)).toContain(PLAN_DECIDED_NEWS);
});
