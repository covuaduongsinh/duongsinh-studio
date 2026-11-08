import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import { createAppTest } from '@nocobase/app-testing/server';
import {
  signIn,
  DEFAULT_ADMIN_CREDENTIALS,
} from '@nocobase/app-plugin-authentication/testing';
import { agentsToken } from '@nocobase/app-plugin-agents/server/tokens';
import { databaseManagerToken } from '@nocobase/db';
import { PROJECT_MANAGER_ID } from '../../server/agents/ids.js';
import { DEFAULT_PROJECT_MANAGER_SETTINGS } from '../../server/agents/project-manager-settings.js';
import { createStandaloneServer } from '../../server/standalone.js';

const test = createAppTest({
  createServer: createStandaloneServer,
  config: {
    app: { publicOrigin: 'http://localhost' },
    auth: { secret: 'test-auth-secret-at-least-32-characters' },
  },
});

const patch = (body: unknown) => ({
  method: 'PATCH',
  headers: {
    'content-type': 'application/json',
    origin: 'http://localhost',
    'Idempotency-Key': `${Date.now()}.${randomUUID()}`,
  },
  body: JSON.stringify(body),
});

// The agents plugin waits `fallbackAfterSeconds` for the first-choice model before it uses the fallback, but only for an
// agent with a registered selection policy; without one it waits 0 s and the setting did nothing (M1.4).
test(
  'the project manager waits for its first choice as long as its settings say',
  { timeout: 120_000 },
  async ({ testApp, app }) => {
    const agents = app.container.resolve(agentsToken);
    const conn = app.container.resolve(databaseManagerToken).connection();
    const forRun = (agentId: string) =>
      agents.selectionPolicies.forRun(conn, { agentId } as never);

    expect(await forRun(PROJECT_MANAGER_ID)).toEqual({
      fallbackAfterSeconds:
        DEFAULT_PROJECT_MANAGER_SETTINGS.fallbackAfterSeconds,
    });
    // Another agent has no policy: it keeps the plugin's own behaviour.
    expect(await forRun('some-other-agent')).toBeNull();

    const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
    const saved = await admin.fetch(
      '/projectManager',
      patch({ fallbackAfterSeconds: 300 }),
    );
    expect(saved.status).toBe(200);
    expect(await forRun(PROJECT_MANAGER_ID)).toEqual({
      fallbackAfterSeconds: 300,
    });
  },
);

// The settings page picks the first choice and the fallback from the agents that can take the work, and restores
// the defaults the server names.
test(
  'the settings page can list the agents to choose from and the defaults to restore',
  { timeout: 120_000 },
  async ({ testApp, app, request }) => {
    const agents = app.container.resolve(agentsToken);
    await agents.agents.ensureSystem({
      id: 'ds-test-coder',
      name: 'Test coder',
      description: 'Implements.',
      instructions: null,
      actions: ['pm.issues/view'],
      modelEntries: [{ tool: 'claude', model: 'claude-sonnet-4-5' }],
    });
    // An agent without a tool and model cannot take work, so it is not offered.
    await agents.agents.ensureSystem({
      id: 'ds-test-empty',
      name: 'No model',
      description: null,
      instructions: null,
      actions: [],
      modelEntries: [],
    });

    expect((await request('/projectManager/agentOptions')).status).toBe(401);

    const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
    const options = await admin.fetch('/projectManager/agentOptions');
    expect(options.status).toBe(200);
    const listed = ((await options.json()).data as { id: string }[]).map(
      (agent) => agent.id,
    );
    expect(listed).toContain('ds-test-coder');
    expect(listed).not.toContain('ds-test-empty');
    expect(listed).not.toContain(PROJECT_MANAGER_ID);

    const settings = (await (await admin.fetch('/projectManager')).json())
      .data as { defaults: unknown };
    expect(settings.defaults).toEqual({
      fallbackAfterSeconds: 120,
      delegationQueueTimeoutSeconds: 600,
      commentRunLimit: 20,
      principles: null,
    });
  },
);
