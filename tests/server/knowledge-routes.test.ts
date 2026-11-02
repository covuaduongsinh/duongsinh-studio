// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import { createAppTest } from '@nocobase/app-testing/server';
import {
  signIn,
  DEFAULT_ADMIN_CREDENTIALS,
} from '@nocobase/app-plugin-authentication/testing';
import { agentsToken } from '@nocobase/app-plugin-agents/server/tokens';
import { knowledgeToken } from '@nocobase/app-plugin-knowledge/server/tokens';
import { createStandaloneServer } from '../../server/standalone.js';
import { CONTRIBUTOR_SET_KEY } from '../../server/access/roles.js';
import { DEFAULT_AGENT_ACTIONS } from '../../server/agents/actions.js';
import { AGENT_KIND } from '../../server/agents/ids.js';
import { KNOWLEDGE_MOUNT } from '../../server/knowledge/runs.js';

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

interface Hit {
  docId: string;
  title: string;
  scope: string;
}

test('knowledge spaces follow Studio roles for people, the directory and runs', async ({
  testApp,
  app,
  request,
}) => {
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);

  // The owner writes the shared space and a members-only project's space.
  const shared = await admin.fetch(
    '/knowledge/docs',
    json({
      scope: 'system',
      title: 'Quy trình merge',
      slug: 'quy-trinh-merge',
      content:
        '# Quy trình merge\n\nChủ dự án merge PR sau khi CI xanh và review chéo đạt.',
    }),
  );
  expect(shared.status).toBe(201);
  const sharedDoc = (await shared.json()).data as { id: string };
  const project = (
    await (
      await admin.fetch(
        '/projects',
        json({ name: 'Dự án kín', visibility: 'members' }),
      )
    ).json()
  ).data as { id: string };
  const secret = await admin.fetch(
    '/knowledge/docs',
    json({
      scope: 'project',
      scopeId: project.id,
      title: 'Ghi chú dự án kín',
      content: 'Quy trình merge riêng của dự án kín: luôn chạy verify trước.',
    }),
  );
  expect(secret.status).toBe(201);
  const secretDoc = (await secret.json()).data as { id: string };
  // No such space: a project that does not exist.
  expect(
    (
      await admin.fetch(
        '/knowledge/docs',
        json({
          scope: 'project',
          scopeId: 'missing',
          title: 'X',
          content: 'x',
        }),
      )
    ).status,
  ).toBeGreaterThanOrEqual(400);

  // The owner finds both, through Studio's search and the directory.
  const ownerHits = (await (await admin.fetch('/kb/search?q=merge')).json())
    .data as Hit[];
  expect(ownerHits.map((hit) => hit.docId)).toEqual(
    expect.arrayContaining([sharedDoc.id, secretDoc.id]),
  );
  const ownerDirectory = (
    await (await admin.fetch('/knowledgeDirectory')).json()
  ).data as {
    space: { scope: string; scopeId: string };
    documents: number;
  }[];
  expect(ownerDirectory).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        space: expect.objectContaining({ scope: 'system' }),
        documents: 1,
      }),
      expect.objectContaining({
        space: expect.objectContaining({
          scope: 'project',
          scopeId: project.id,
        }),
        documents: 1,
      }),
    ]),
  );
  const read = await admin.fetch('/kb/docs/quy-trinh-merge');
  expect(read.status).toBe(200);
  expect((await read.json()).data).toMatchObject({
    id: sharedDoc.id,
    version: 1,
  });
  expect((await admin.fetch(`/kb/docs/${secretDoc.id}`)).status).toBe(200);
  expect((await admin.fetch('/kb/search?q=merge&owner=x')).status).toBe(400);

  // On the command line `kb search` and `kb read` are Studio's, for people and runs alike.
  const manifest = (await (await admin.fetch('/cli/manifest')).json()).data as {
    commands: { id: string; path: string; identities?: string[] }[];
  };
  const command = (id: string) =>
    manifest.commands.find((entry) => entry.id === id);
  expect(command('kb:search')?.path).toMatch(/\/kb\/search$/u);
  expect(command('kb:read')?.path).toMatch(/\/kb\/docs\/\{doc\}$/u);
  expect(command('kb:tree')).toBeDefined();

  // A contributor outside the project reads and proposes in the shared space only.
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
  const contributorHits = (
    await (await contributor.fetch('/kb/search?q=merge')).json()
  ).data as Hit[];
  expect(contributorHits.map((hit) => hit.docId)).toEqual([sharedDoc.id]);
  expect((await contributor.fetch(`/kb/docs/${secretDoc.id}`)).status).toBe(
    404,
  );
  const contributorDirectory = (
    await (await contributor.fetch('/knowledgeDirectory')).json()
  ).data as {
    space: { scope: string };
  }[];
  expect(contributorDirectory.map((entry) => entry.space.scope)).toEqual([
    'system',
  ]);
  // Changing the shared space takes an administrator.
  expect(
    (
      await contributor.fetch(
        '/knowledge/docs',
        json({ scope: 'system', title: 'Của tôi', content: 'x' }),
      )
    ).status,
  ).toBe(403);

  // A run reads what its agent and its person both may: here the owner's issue in the project.
  const agents = app.container.resolve(agentsToken);
  expect(DEFAULT_AGENT_ACTIONS).toContain('kb.knowledge/read');
  const coder = await agents.agents.ensureSystem({
    id: 'ds-test-kb-coder',
    name: 'KB coder',
    description: 'Reads the knowledge.',
    instructions: null,
    actions: [...DEFAULT_AGENT_ACTIONS],
    modelEntries: [{ tool: 'claude', model: MODEL }],
  });
  const issue = (
    await (
      await admin.fetch(
        '/projects/issues',
        json({
          title: 'Đọc tri thức',
          projectId: project.id,
          statusKey: 'in_progress',
          executor: { type: AGENT_KIND, id: coder.id },
        }),
      )
    ).json()
  ).data as { id: string };
  expect(issue.id).toBeTruthy();
  const ownerId = (
    (await (await admin.fetch('/access/me')).json()).data as { userId: string }
  ).userId;
  const registration = await agents.runners.createRegistrationToken(ownerId, {
    trust: 'ownerOnly',
  });
  const registered = await agents.runners.register({
    registrationToken: registration.token,
    name: 'kb-runner',
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
  const runner = await agents.runners.authenticate(registered.runnerKey);
  const [payload] = await agents.claims.claim(runner, 1);
  expect(payload).toBeDefined();

  // The run gets the knowledge mount beside its repositories, and its brief says what it may read.
  const mounts =
    (payload as unknown as { mounts?: { name: string; target: string }[] })
      .mounts ?? [];
  expect(mounts).toEqual([
    expect.objectContaining({ name: KNOWLEDGE_MOUNT, target: 'knowledge' }),
  ]);
  const brief = JSON.stringify(payload);
  expect(brief).toContain('## Tri thức (knowledge)');
  expect(brief).toContain(sharedDoc.id);
  expect(brief).toContain(secretDoc.id);
  const runId = (payload as unknown as { run: { id: string } }).run.id;
  const files = await app.container
    .resolve(knowledgeToken)
    .snapshots.files(
      app.container.resolve(knowledgeToken).connection(),
      runId,
      {
        dir: (space) => space.scope,
        heading: () => '',
        preamble: [],
        unwritten: () => '',
        url: () => '',
      },
    );
  expect(files?.files.map((file) => file.path)).toEqual(
    expect.arrayContaining(['INDEX.md']),
  );

  const runToken = String(payload.cli.credential.content.token);
  const asRun = (path: string) =>
    request(path, { headers: { 'x-nocobase-run-token': runToken } });
  const runHits = await asRun('/kb/search?q=merge');
  expect(runHits.status).toBe(200);
  expect(
    ((await runHits.json()).data as Hit[]).map((hit) => hit.docId),
  ).toEqual(expect.arrayContaining([sharedDoc.id, secretDoc.id]));
  expect((await asRun(`/kb/docs/${secretDoc.id}`)).status).toBe(200);
  // A run never reaches the directory, which is for people.
  expect((await asRun('/knowledgeDirectory')).status).toBe(403);
});
