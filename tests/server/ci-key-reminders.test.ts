import { randomUUID } from 'node:crypto';
// @vitest-environment node
import { afterEach, expect, vi } from 'vitest';
import { createAppTest } from '@nocobase/app-testing/server';
import {
  signIn,
  DEFAULT_ADMIN_CREDENTIALS,
} from '@nocobase/app-plugin-authentication/testing';
import { sendCiKeyReminders } from '../../server/providers/ci-key-reminders.js';
import { createStandaloneServer } from '../../server/standalone.js';

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

const API = 'https://github.test/api';
const TOKEN = 'ghp_test_token';
const json = (body: unknown, method = 'POST') => ({
  method,
  headers: {
    'content-type': 'application/json',
    origin: 'http://localhost',
    'Idempotency-Key': `${Date.now()}.${randomUUID()}`,
  },
  body: JSON.stringify(body),
});

function fakeGitHub(): void {
  const original = globalThis.fetch;
  vi.stubGlobal(
    'fetch',
    async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(
        typeof input === 'string' || input instanceof URL ? input : input.url,
      );
      if (!url.href.startsWith(API)) return original(input, init);
      const path = url.pathname.slice('/api'.length);
      const answer = (body: unknown) =>
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      if (path === '/user') return answer({ login: 'ds-bot' });
      if (path === '/repos/acme/sandbox')
        return answer({
          id: 42,
          full_name: 'acme/sandbox',
          default_branch: 'main',
          clone_url: 'https://github.test/acme/sandbox.git',
          html_url: 'https://github.test/acme/sandbox',
          permissions: { push: true },
        });
      return answer([]);
    },
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

test(
  'a CI key with 14 days or less left reminds the owners once; a fresh one does not',
  { timeout: 240_000 },
  async ({ testApp, app }) => {
    const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
    fakeGitHub();
    const connection = (
      (await (
        await admin.fetch(
          '/git/connections',
          json({ name: 'GitHub', token: TOKEN, apiBaseUrl: API }),
        )
      ).json()) as { data: { id: string } }
    ).data;
    const repository = (
      (await (
        await admin.fetch(
          '/git/repositories',
          json({ connectionId: connection.id, repo: 'acme/sandbox' }),
        )
      ).json()) as { data: { id: string } }
    ).data;
    const project = (
      await (
        await admin.fetch(
          '/projects',
          json({ name: 'Có khoá CI', visibility: 'members' }),
        )
      ).json()
    ).data as { id: string };
    expect(
      (
        await admin.fetch(
          `/projects/${project.id}/codeLocations`,
          json({ repositoryId: repository.id, primary: true }),
        )
      ).status,
    ).toBe(201);
    expect(await sendCiKeyReminders(app)).toBe(0);
    const ci = `/repositoryDeployments/${repository.id}/ci`;
    await admin.fetch(
      `/repositoryDeployments/${repository.id}`,
      json({ apps: [{ appId: 'sandbox-app', role: 'staging' }] }, 'PUT'),
    );
    expect(
      (await admin.fetch(`${ci}/setup`, json({ reveal: true }))).status,
    ).toBe(200);
    const day = 86_400_000;
    // 90 days left: nothing yet.
    expect(await sendCiKeyReminders(app)).toBe(0);
    // 10 days left: the owners are told; 95 days on, the key is past its date and nothing is sent.
    expect(await sendCiKeyReminders(app, new Date(Date.now() + 80 * day))).toBe(
      1,
    );
    expect(await sendCiKeyReminders(app, new Date(Date.now() + 95 * day))).toBe(
      0,
    );
  },
);
