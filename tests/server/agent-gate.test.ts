// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import { createAppTest } from '@nocobase/app-testing/server';
import {
  signIn,
  DEFAULT_ADMIN_CREDENTIALS,
} from '@nocobase/app-plugin-authentication/testing';
import { authorizationToken } from '@nocobase/app-plugin-authorization';
import { agentsToken } from '@nocobase/app-plugin-agents/server/tokens';
import { createStandaloneServer } from '../../server/standalone.js';
import { CONTRIBUTOR_SET_KEY } from '../../server/access/roles.js';
import { DEFAULT_AGENT_ACTIONS } from '../../server/agents/actions.js';
import { PROJECT_MANAGER_ID } from '../../server/agents/ids.js';
import { runKeyScope } from '../../server/providers/agent-actions.js';
import {
  permissionsFrom,
  userIdentity,
} from '../../server/providers/projects-access.js';

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

const PASSWORD = 'Studio-test-123!';

test('the gate gives people their own actions and runs their agent’s within them; the project manager is configurable', async ({
  testApp,
  app,
}) => {
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const agents = app.container.resolve(agentsToken);
  const authz = app.container.resolve(authorizationToken);

  const created = await admin.fetch(
    '/users',
    json({
      name: 'contributor1',
      username: 'contributor1',
      email: 'contributor1@example.test',
      password: PASSWORD,
      roleScopes: { app: [CONTRIBUTOR_SET_KEY] },
    }),
  );
  expect(created.status).toBe(201);
  const contributorId = ((await created.json()).data as { id: string }).id;
  const contributor = await signIn(testApp, {
    username: 'contributor1',
    password: PASSWORD,
  });

  // The Capabilities tab offers Studio's actions; agents start with what working an issue needs.
  const offered = agents.actions.list();
  expect(offered.map((action) => action.key)).toEqual(
    expect.arrayContaining([
      'pm.issues/comment',
      'pm.issues/delete',
      'pm.attachments/upload',
    ]),
  );
  expect(
    offered.find((action) => action.key === 'pm.issues/moderate-comments'),
  ).toMatchObject({ grantable: false });
  expect([...DEFAULT_AGENT_ACTIONS].sort()).toEqual(
    [
      'pm.attachments/upload',
      'pm.issues/comment',
      'pm.issues/edit',
      'pm.issues/view',
      'pm.projects/view',
    ].sort(),
  );
  expect((await agents.agents.get(PROJECT_MANAGER_ID)).actions).toEqual(
    expect.arrayContaining([...DEFAULT_AGENT_ACTIONS]),
  );

  // A person holds what their role gives: a contributor comments but cannot delete issues.
  const person = await agents.gate.allowed({
    kind: 'user',
    userId: contributorId,
    displayName: 'contributor1',
  });
  expect(person.has('pm.issues/comment')).toBe(true);
  expect(person.has('pm.issues/delete')).toBe(false);
  // The command manifest shows the same answer.
  const manifest = (await (await contributor.fetch('/cli/manifest')).json())
    .data as {
    identity: { actions: string[] };
    commands: { id: string }[];
  };
  expect(manifest.identity.actions).toContain('pm.issues/comment');
  expect(manifest.identity.actions).not.toContain('pm.issues/delete');
  expect(manifest.commands.map((command) => command.id)).toContain(
    'issue:comment:add',
  );

  // A run holds its agent's actions within those of the person it acts for: even an unrestricted owner's run cannot
  // delete issues with the default actions.
  const coder = await agents.agents.ensureSystem({
    id: 'ds-test-coder',
    name: 'Test coder',
    description: 'Implements small changes.',
    instructions: null,
    actions: [...DEFAULT_AGENT_ACTIONS],
    modelEntries: [{ tool: 'claude', model: 'claude-sonnet-4-5' }],
  });
  const ownerId = (
    (await (await admin.fetch('/access/me')).json()).data as { userId: string }
  ).userId;
  const run = await agents.gate.allowed({
    kind: 'run',
    userId: ownerId,
    displayName: coder.name,
    agent: coder,
  });
  expect(run.has('pm.issues/comment')).toBe(true);
  expect(run.has('pm.issues/delete')).toBe(false);
  const contributorRun = await agents.gate.allowed({
    kind: 'run',
    userId: contributorId,
    displayName: coder.name,
    agent: { ...coder, actions: ['pm.issues/comment', 'pm.issues/delete'] },
  });
  expect(contributorRun.has('pm.issues/delete')).toBe(false);

  // What a request with that run's token is allowed: the run's scope narrows the owner's projects permissions.
  const scoped = await permissionsFrom(
    authz.for(userIdentity(ownerId, runKeyScope('run-1', run))),
    ownerId,
  );
  expect(scoped.scopes['pm.issues/comment']).toBe('all');
  expect(scoped.scopes['pm.issues/delete']).toBe('none');
  expect(scoped.settings['pm.general/update']).toBe(false);

  // The project manager's settings: readers read, only managers of agents change them.
  const read = await contributor.fetch('/projectManager');
  expect(read.status).toBe(200);
  expect((await read.json()).data).toMatchObject({
    firstChoiceAgentId: null,
    fallbackAfterSeconds: 120,
    delegationQueueTimeoutSeconds: 600,
    commentRunLimit: 20,
    principles: null,
    builtInPrinciples: expect.stringContaining('Ai làm gì'),
  });
  expect(
    (
      await contributor.fetch(
        '/projectManager',
        json({ commentRunLimit: 5 }, 'PATCH'),
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await admin.fetch(
        '/projectManager',
        json({ firstChoiceAgentId: 'no-such-agent' }, 'PATCH'),
      )
    ).status,
  ).toBe(400);

  // Choosing a first choice gives the project manager its tool and model.
  expect((await agents.agents.get(PROJECT_MANAGER_ID)).modelEntries).toEqual(
    [],
  );
  const patched = await admin.fetch(
    '/projectManager',
    json({ firstChoiceAgentId: coder.id, commentRunLimit: 5 }, 'PATCH'),
  );
  expect(patched.status).toBe(200);
  expect((await patched.json()).data).toMatchObject({
    firstChoiceAgentId: coder.id,
    commentRunLimit: 5,
  });
  const manager = await agents.agents.get(PROJECT_MANAGER_ID);
  expect(manager.modelEntries).toEqual([
    expect.objectContaining({ tool: 'claude', model: 'claude-sonnet-4-5' }),
  ]);
  expect(
    await agents.agents.findWorkable(agents.tx.read(), PROJECT_MANAGER_ID),
  ).not.toBeNull();
  // Booting a fresh application and signing in two people takes most of a minute on the development machine.
}, 240_000);
