// @vitest-environment node
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, vi } from 'vitest';
import { createAppTest } from '@nocobase/app-testing/server';
import {
  signIn,
  DEFAULT_ADMIN_CREDENTIALS,
} from '@nocobase/app-plugin-authentication/testing';
import { CONTRIBUTOR_SET_KEY } from '../../server/access/roles.js';
import { publicBaseUrlOf } from '../../server/providers/git.js';
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
const SHA = 'abc1234def5678';
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
  'CI reports and uploads a build, Studio keeps it without running it, and a link downloads the same bytes',
  { timeout: 240_000 },
  async ({ testApp, app, request }) => {
    for (const path of [
      '/repositoryDeployments?appId=a',
      '/repositoryDeployments/x',
      '/repositoryDeployments/x/builds',
      '/repositoryDeployments/x/ci',
      '/repositoryDeployments/ciWorkflows/environments',
      '/deploys/releases/x',
    ])
      expect((await request(path)).status).toBe(401);
    for (const path of ['/builds/report', '/builds/uploadTickets'])
      expect((await request(path, json({}))).status).toBe(401);
    expect((await request('/releaseDownloads/not-a-link')).status).toBe(404);

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
          json({ name: 'Có bản build', visibility: 'members' }),
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

    // A contributor outside the project sees none of it.
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
    expect(
      (await contributor.fetch(`/repositoryDeployments/${repository.id}`))
        .status,
    ).toBe(404);
    expect(
      (
        await contributor.fetch(
          `/repositoryDeployments/${repository.id}`,
          json({ apps: [] }, 'PUT'),
        )
      ).status,
    ).toBe(404);

    // Linking an App makes it in the store, where nothing runs.
    const linked = await admin.fetch(
      `/repositoryDeployments/${repository.id}`,
      json({ apps: [{ appId: 'sandbox-app', role: 'staging' }] }, 'PUT'),
    );
    expect(linked.status).toBe(200);
    expect((await linked.json()).data).toMatchObject({
      repo: 'acme/sandbox',
      apps: [{ appId: 'sandbox-app', role: 'staging' }],
      canEdit: true,
    });
    const listed = (
      await (
        await admin.fetch('/repositoryDeployments?appId=sandbox-app')
      ).json()
    ).data as { resourceId: string }[];
    expect(listed.map((item) => item.resourceId)).toEqual([repository.id]);
    expect(
      (
        await (
          await contributor.fetch('/repositoryDeployments?appId=sandbox-app')
        ).json()
      ).data,
    ).toEqual([]);

    // The CI file names the App and its secret, never a secret's value.
    const workflow = (
      await (
        await admin.fetch(`/repositoryDeployments/${repository.id}/ciWorkflow`)
      ).json()
    ).data as { files: { path: string; content: string }[]; secret: string };
    expect(workflow.secret).toBe('DS_STUDIO_API_KEY');
    expect(workflow.files[0]?.path).toContain('sandbox-app');
    expect(workflow.files[0]?.content).toContain(
      '${{ secrets.DS_STUDIO_API_KEY }}',
    );
    expect(workflow.files[0]?.content).toContain(
      '/releases/apps/$APP_ID/uploadTickets',
    );

    // The CI key: its secret only when asked for, once, and never read back.
    const ciUrl = `/repositoryDeployments/${repository.id}/ci`;
    expect((await (await admin.fetch(ciUrl)).json()).data.key).toBeNull();
    expect((await admin.fetch(`${ciUrl}/setup`, json({}))).status).toBe(400);
    const setup = (
      await (await admin.fetch(`${ciUrl}/setup`, json({ reveal: true }))).json()
    ).data as { secret: string; setup: { key: { id: string } } };
    expect(setup.secret.length).toBeGreaterThan(10);
    const readBack = await (await admin.fetch(ciUrl)).text();
    expect(readBack).toContain(setup.setup.key.id);
    expect(readBack).not.toContain(setup.secret);
    const rotated = (
      await (
        await admin.fetch(`${ciUrl}/rotate`, json({ reveal: true }))
      ).json()
    ).data as { secret: string; setup: { key: { id: string } } };
    expect(rotated.setup.key.id).toBe(setup.setup.key.id);
    expect(rotated.secret).not.toBe(setup.secret);

    // CI reports with its key; a wrong key does not.
    const asCi = (path: string, body: object, secret = rotated.secret) => {
      const init = json(body);
      return request(path, {
        ...init,
        headers: { ...init.headers, 'x-api-key': secret },
      });
    };
    expect(
      (
        await asCi(
          '/builds/report',
          {
            appId: 'sandbox-app',
            sha: SHA,
            state: 'building',
          },
          setup.secret,
        )
      ).status,
    ).toBe(401);
    const reported = await asCi('/builds/report', {
      appId: 'sandbox-app',
      sha: SHA,
      repository: 'acme/sandbox',
      state: 'building',
      logsUrl: 'https://ci.test/1',
    });
    expect(reported.status).toBe(200);
    expect((await reported.json()).data).toMatchObject({ state: 'building' });

    // Upload with a one-time ticket: no session, and spent once.
    const ticket = (
      await (
        await asCi('/builds/uploadTickets', {
          appId: 'sandbox-app',
          sha: SHA,
          repository: 'acme/sandbox',
        })
      ).json()
    ).data as { buildId: string; url: string; token: string };
    // Called from outside, so it carries the deployment's base path, which a request's own URL has lost.
    expect(ticket.url).toBe(
      `${publicBaseUrlOf(app)}/api/builds/${ticket.buildId}/uploadArtifact`,
    );
    const folder = mkdtempSync(path.join(tmpdir(), 'ds-build-'));
    mkdirSync(path.join(folder, 'dist/server'), { recursive: true });
    writeFileSync(path.join(folder, 'dist/server/embedded.js'), 'export {};');
    writeFileSync(
      path.join(folder, 'dist/package.json'),
      JSON.stringify({ name: 'sandbox-app', version: '1.2.3' }),
    );
    const archive = execFileSync('tar', ['-czf', '-', '-C', folder, 'dist']);
    const send = (token: string) =>
      request(`/builds/${ticket.buildId}/uploadArtifact`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/gzip',
        },
        body: archive,
      });
    expect((await send('not-a-ticket')).status).not.toBe(200);
    const sent = await send(ticket.token);
    const sentBody = (await sent.json()) as {
      data: { releaseId: string; build: { state: string; releaseId: string } };
    };
    expect(sent.status).toBe(200);
    expect(sentBody.data.build).toMatchObject({
      state: 'succeeded',
      releaseId: sentBody.data.releaseId,
    });
    expect((await send(ticket.token)).status).not.toBe(200);

    const builds = (await (
      await admin.fetch(`/repositoryDeployments/${repository.id}/builds`)
    ).json()) as {
      data: { sha: string; releaseId: string }[];
      meta: { total: number };
    };
    expect(builds.meta.total).toBe(1);
    expect(builds.data[0]).toMatchObject({
      sha: SHA,
      releaseId: sentBody.data.releaseId,
    });

    // The old deploy route is gone: the one template deploys through the releases plugin's own ticket.
    expect(
      (await admin.fetch('/builds/deploy', json({ appId: 'sandbox-app' })))
        .status,
    ).toBe(404);

    // The release and a link to it: the owner's, 24 hours, the same bytes, without a session.
    const releaseId = sentBody.data.releaseId;
    expect((await admin.fetch(`/deploys/releases/${releaseId}`)).status).toBe(
      200,
    );
    expect(
      (
        await contributor.fetch(
          `/deploys/releases/${releaseId}/downloadLink`,
          json({}),
        )
      ).status,
    ).toBe(403);
    const link = (
      await (
        await admin.fetch(
          `/deploys/releases/${releaseId}/downloadLink`,
          json({}),
        )
      ).json()
    ).data as { url: string; expiresAt: string };
    expect(Date.parse(link.expiresAt)).toBeGreaterThan(Date.now());
    expect(
      link.url.startsWith(`${publicBaseUrlOf(app)}/api/releaseDownloads/`),
    ).toBe(true);
    const downloadPath = link.url.slice(link.url.indexOf('/releaseDownloads/'));
    const downloaded = await request(downloadPath);
    expect(downloaded.status).toBe(200);
    expect(
      createHash('sha256')
        .update(Buffer.from(await downloaded.arrayBuffer()))
        .digest('hex'),
    ).toBe(createHash('sha256').update(archive).digest('hex'));

    // The CI key reaches this repository's Apps and no other, and lives 90 days (V4.4).
    const keyInfo = (await (await admin.fetch(ciUrl)).json()).data.key as {
      expiresAt: string;
    };
    const days = (Date.parse(keyInfo.expiresAt) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(89);
    expect(days).toBeLessThan(91);
    const link2 = async (apps: { appId: string; role: string }[]) =>
      admin.fetch(
        `/repositoryDeployments/${repository.id}`,
        json({ apps }, 'PUT'),
      );
    expect(
      (
        await link2([
          { appId: 'sandbox-app', role: 'staging' },
          { appId: 'other-app', role: 'production' },
        ])
      ).status,
    ).toBe(200);
    // Linked after the key was made: the key does not reach it.
    const refused = await asCi('/builds/uploadTickets', {
      appId: 'other-app',
      sha: SHA,
      repository: 'acme/sandbox',
    });
    expect([403, 404]).toContain(refused.status);
    // Rotating after the change replaces the key with one that names both Apps; the old secret stops.
    const replaced = (
      await (
        await admin.fetch(`${ciUrl}/rotate`, json({ reveal: true }))
      ).json()
    ).data as { secret: string; setup: { key: { id: string } } };
    expect(replaced.setup.key.id).not.toBe(rotated.setup.key.id);
    expect(
      (
        await asCi(
          '/builds/uploadTickets',
          { appId: 'other-app', sha: SHA, repository: 'acme/sandbox' },
          replaced.secret,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await asCi('/builds/report', {
          appId: 'sandbox-app',
          sha: SHA,
          repository: 'acme/sandbox',
          state: 'building',
        })
      ).status,
    ).toBe(401);
    expect(
      (await link2([{ appId: 'sandbox-app', role: 'staging' }])).status,
    ).toBe(200);

    // Reported Apps, and taking one off the list leaves the App.
    const connectionView = (
      await (await admin.fetch(`${ciUrl}/connection`)).json()
    ).data as { apps: { appId: string }[] };
    // `other-app` is there too: the replaced key uploaded a ticket for it above.
    expect(connectionView.apps.map((item) => item.appId).sort()).toEqual([
      'other-app',
      'sandbox-app',
    ]);
    expect(
      (
        await admin.fetch(`${ciUrl}/apps/sandbox-app`, {
          ...json({}, 'DELETE'),
          body: undefined,
        })
      ).status,
    ).toBe(204);
    expect(
      (
        await (
          await admin.fetch(`/repositoryDeployments/${repository.id}`)
        ).json()
      ).data.apps,
    ).toEqual([]);
    expect((await admin.fetch(`/deploys/releases/${releaseId}`)).status).toBe(
      200,
    );
  },
);
