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
import { AGENT_KIND } from '../../server/agents/ids.js';
import { createStandaloneServer } from '../../server/standalone.js';

const test = createAppTest({
  createServer: createStandaloneServer,
  config: {
    app: { publicOrigin: 'http://localhost' },
    auth: { secret: 'test-auth-secret-at-least-32-characters' },
  },
});

const MODEL = 'claude-sonnet-4-5';
const PROTOCOL_VERSION = 14;
// The runner refuses its whole claim on any other input type, so one bad run holds up everything on that runner.
const RUNNER_INPUT_TYPES = [
  'comment',
  'statusChange',
  'retry',
  'planDecided',
  'signal',
  'custom',
];

const json = (body: unknown, method = 'POST') => ({
  method,
  headers: {
    'content-type': 'application/json',
    origin: 'http://localhost',
    'Idempotency-Key': `${Date.now()}.${randomUUID()}`,
  },
  body: JSON.stringify(body),
});

test(
  'starting an agent by hand queues an input the runner accepts',
  { timeout: 240_000 },
  async ({ app, testApp }) => {
    const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
    const ownerId = (
      (await (await admin.fetch('/auth/get-session')).json()) as {
        user: { id: string };
      }
    ).user.id;
    const { container } = app;
    const agents = container.resolve(agentsToken);
    const conn = () => container.resolve(databaseManagerToken).connection();
    const coder = await agents.agents.ensureSystem({
      id: 'ds-test-coder',
      name: 'Test coder',
      description: 'Implements.',
      instructions: null,
      actions: ['pm.issues/view', 'pm.issues/comment'],
      modelEntries: [{ tool: 'claude', model: MODEL }],
    });
    const project = (
      await (
        await admin.fetch(
          '/projects',
          json({ name: 'Sandbox', visibility: 'members' }),
        )
      ).json()
    ).data as { id: string };
    const issue = (
      await (
        await admin.fetch(
          '/projects/issues',
          json({
            title: 'Bắt đầu bằng tay',
            statusKey: 'in_progress',
            projectId: project.id,
            executor: { type: AGENT_KIND, id: coder.id },
          }),
        )
      ).json()
    ).data as { id: string };

    // The issue's own wake-up is out of the way, so only the start below queues work.
    const woken = await conn()
      .query.selectFrom('agRuns')
      .select(['id'])
      .where('subjectId', '=', issue.id)
      .execute();
    for (const { id } of woken)
      expect(
        (await admin.fetch(`/agents/runs/${String(id)}/cancel`, json({})))
          .status,
      ).toBe(200);

    const started = await admin.fetch(
      `/agentBoard/issues/${issue.id}/start`,
      json({}),
    );
    expect(started.status).toBe(200);
    expect((await started.json()).data).toEqual({
      started: true,
      skipped: null,
    });

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
    const [payload] = await agents.claims.claim(runner, 1);
    const types = (
      payload as unknown as { inputs: readonly { type: string }[] }
    ).inputs.map(({ type }) => type);
    expect(types.length).toBeGreaterThan(0);
    for (const type of types) expect(RUNNER_INPUT_TYPES).toContain(type);
  },
);
