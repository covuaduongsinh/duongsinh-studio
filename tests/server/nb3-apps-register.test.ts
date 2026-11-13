// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { afterEach, expect, vi } from 'vitest';
import { createAppTest } from '@nocobase/app-testing/server';
import {
  signIn,
  DEFAULT_ADMIN_CREDENTIALS,
} from '@nocobase/app-plugin-authentication/testing';
import { CONTRIBUTOR_SET_KEY } from '../../server/access/roles.js';
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
const PASSWORD = 'Studio-test-123!';
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
  'registering an NB3 App: owner only, makes the environment, the App and the link, answers the one workflow, refuses clashes',
  { timeout: 240_000 },
  async ({ testApp, request }) => {
    const send = (who: { fetch: typeof fetch }, payload: unknown) =>
      who.fetch('/nb3Apps/register', json(payload));
    expect((await request('/nb3Apps/register', json({}))).status).toBe(401);

    const owner = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
    fakeGitHub();
    const connection = (
      (await (
        await owner.fetch(
          '/git/connections',
          json({ name: 'GitHub', token: TOKEN, apiBaseUrl: API }),
        )
      ).json()) as { data: { id: string } }
    ).data;
    const repository = (
      (await (
        await owner.fetch(
          '/git/repositories',
          json({ connectionId: connection.id, repo: 'acme/sandbox' }),
        )
      ).json()) as { data: { id: string } }
    ).data;
    const project = (await (
      await owner.fetch(
        '/projects',
        json({ name: 'Có app', visibility: 'members' }),
      )
    ).json()) as { data: { id: string } };
    expect(
      (
        await owner.fetch(
          `/projects/${project.data.id}/codeLocations`,
          json({ repositoryId: repository.id, primary: true }),
        )
      ).status,
    ).toBe(201);
    await owner.fetch(
      '/users',
      json({
        name: 'contributor1',
        username: 'contributor1',
        email: 'contributor1@example.test',
        password: PASSWORD,
        roleScopes: { app: [CONTRIBUTOR_SET_KEY] },
      }),
    );
    const contributor = await signIn(testApp, {
      username: 'contributor1',
      password: PASSWORD,
    });
    const good = {
      repositoryId: repository.id,
      appId: 'sandbox-preview',
      host: 'sandbox-preview.dsc.edu.vn',
      role: 'preview',
      database: 'sqlite',
    };
    expect((await send(contributor, good)).status).toBe(403);

    const made = await send(owner, good);
    expect(made.status).toBe(201);
    const data = (await made.json()).data as {
      environmentId: string;
      environmentCreated: boolean;
      workflow: { path: string; content: string };
      secretName: string;
    };
    expect(data).toMatchObject({
      environmentId: 'nb3-preview',
      environmentCreated: true,
      secretName: 'DS_STUDIO_API_KEY',
    });
    expect(data.workflow.path).toBe(
      '.github/workflows/ds-studio-sandbox-preview.yml',
    );
    // The one template: the releases plugin's own ticket, labelled with the pull request, the narrow CI key.
    expect(data.workflow.content).toContain(
      '/releases/apps/$APP_ID/uploadTickets',
    );
    expect(data.workflow.content).toContain('X-Release-Deploy: true');
    expect(data.workflow.content).toContain('github.event.pull_request.number');
    expect(data.workflow.content).toContain('secrets.DS_STUDIO_API_KEY');
    expect(data.workflow.content).not.toContain('builds/');

    // The environment holds the host; the App is linked to the repository as its preview.
    const environments = (await (
      await owner.fetch('/releases/environments')
    ).json()) as {
      data: {
        id: string;
        driver: string;
        config: { hosts: Record<string, string>; database: string };
      }[];
    };
    const created = environments.data.find((item) => item.id === 'nb3-preview');
    expect(created).toMatchObject({
      driver: 'dokploy',
      config: {
        hosts: { 'sandbox-preview': 'sandbox-preview.dsc.edu.vn' },
        database: 'sqlite',
      },
    });
    const linked = (await (
      await owner.fetch(`/repositoryDeployments/${repository.id}`)
    ).json()) as {
      data: { apps: { appId: string; role: string | null }[] };
    };
    expect(linked.data.apps.map((item) => item.appId)).toContain(
      'sandbox-preview',
    );

    // A second App in the same role joins the environment; clashes are refused and leave nothing behind.
    expect((await send(owner, good)).status).toBe(409);
    const taken = await send(owner, { ...good, appId: 'other-preview' });
    expect(taken.status).toBe(409);
    expect((await taken.json()).error.reason).toBe('HOST_TAKEN');
    const mismatch = await send(owner, {
      ...good,
      appId: 'other-preview',
      host: 'other-preview.dsc.edu.vn',
      database: 'postgres',
    });
    expect((await mismatch.json()).error.reason).toBe('DATABASE_MISMATCH');
    expect((await owner.fetch('/releases/apps/other-preview')).status).toBe(
      404,
    );
    expect(
      (await send(owner, { ...good, appId: 'x1', host: 'nocobase.dsc.edu.vn' }))
        .status,
    ).toBe(400);
    expect(
      (
        await send(owner, {
          ...good,
          appId: 'x2',
          host: 'x2.dsc.edu.vn',
          repositoryId: 'nope',
        })
      ).status,
    ).toBe(404);

    const second = await send(owner, {
      ...good,
      appId: 'sandbox-staging',
      host: 'sandbox.dsc.edu.vn',
      role: 'staging',
    });
    expect(second.status).toBe(201);
    const stagingFlow = (await second.json()).data.workflow.content as string;
    expect(stagingFlow).toContain('branches: [main]');
    expect(stagingFlow).toContain('X-Release-Deploy: true');
  },
);
