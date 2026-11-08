// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { afterEach, expect, vi } from 'vitest';
import { createAppTest } from '@nocobase/app-testing/server';
import {
  signIn,
  DEFAULT_ADMIN_CREDENTIALS,
} from '@nocobase/app-plugin-authentication/testing';
import { createStandaloneServer } from '../../server/standalone.js';
import { CONTRIBUTOR_SET_KEY } from '../../server/access/roles.js';

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
const TOKEN = 'ghp_memory_token_never_returned';
const PASSWORD = 'Studio-test-123!';
const HEAD = '1234567890abcdef1234567890abcdef12345678';
const MEMORY = `---
name: Giữ nhãn tiếng Việt
description: Chủ dự án muốn mọi nhãn mới có bản tiếng Việt.
type: feedback
modified: 2026-11-02
---

Mọi nhãn mới phải có bản vi-VN.

**Vì sao:** người dùng là giáo viên Việt Nam.

**Cách áp dụng:** thêm khoá vào locales vi-VN cùng PR.
`;

const json = (body: unknown, method = 'POST') => ({
  method,
  headers: {
    'content-type': 'application/json',
    origin: 'http://localhost',
    'Idempotency-Key': `${Date.now()}.${randomUUID()}`,
  },
  body: JSON.stringify(body),
});

function fakeGitHub(): { calls: string[] } {
  const state = { calls: [] as string[] };
  const original = globalThis.fetch;
  vi.stubGlobal(
    'fetch',
    async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(
        typeof input === 'string' || input instanceof URL ? input : input.url,
      );
      if (!url.href.startsWith(API)) return original(input, init);
      const method = init?.method ?? 'GET';
      const path = url.pathname.slice('/api'.length);
      state.calls.push(`${method} ${path}${url.search}`);
      const answer = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), {
          status,
          headers: { 'content-type': 'application/json' },
        });
      if (new Headers(init?.headers).get('authorization') !== `Bearer ${TOKEN}`)
        return answer({ message: 'Bad credentials' }, 401);
      const repo = '/repos/acme/sandbox';
      if (path === '/user') return answer({ login: 'ds-bot' });
      if (path === repo)
        return answer({
          id: 42,
          full_name: 'acme/sandbox',
          default_branch: 'main',
          clone_url: 'https://github.test/acme/sandbox.git',
          html_url: 'https://github.test/acme/sandbox',
          permissions: { push: true },
        });
      if (path === `${repo}/pulls`) return answer([]);
      if (path === `${repo}/branches/main`)
        return answer({ name: 'main', commit: { sha: HEAD } });
      if (
        path === `${repo}/contents/.nb-studio/memory` &&
        url.searchParams.get('ref') === HEAD
      )
        return answer([
          {
            name: 'nhan-tieng-viet.md',
            path: '.nb-studio/memory/nhan-tieng-viet.md',
            type: 'file',
            sha: 'blob-1',
            size: Buffer.byteLength(MEMORY),
          },
        ]);
      if (path === `${repo}/contents/.nb-studio/memory/nhan-tieng-viet.md`)
        return answer({
          type: 'file',
          path: '.nb-studio/memory/nhan-tieng-viet.md',
          sha: 'blob-1',
          size: Buffer.byteLength(MEMORY),
          encoding: 'base64',
          content: Buffer.from(MEMORY).toString('base64'),
        });
      return answer({ message: 'Not Found' }, 404);
    },
  );
  return state;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

test('project memory is read from the default branch for those who see the project', async ({
  testApp,
  request,
}) => {
  const github = fakeGitHub();
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  expect((await request('/projectMemory')).status).toBe(401);

  const connection = (
    await (
      await admin.fetch(
        '/git/connections',
        json({ name: 'GitHub', token: TOKEN, apiBaseUrl: API }),
      )
    ).json()
  ).data as { id: string };
  const repository = (
    await (
      await admin.fetch(
        '/git/repositories',
        json({ connectionId: connection.id, repo: 'acme/sandbox' }),
      )
    ).json()
  ).data as { id: string };
  const project = (
    await (
      await admin.fetch(
        '/projects',
        json({ name: 'Sandbox', visibility: 'members' }),
      )
    ).json()
  ).data as { id: string };
  expect(
    (
      await admin.fetch(
        `/projects/${project.id}/codeLocations`,
        json({ repositoryId: repository.id }),
      )
    ).status,
  ).toBe(201);

  // The administrator sees the project, its repository and the memory count.
  const listResponse = await admin.fetch('/projectMemory');
  expect(listResponse.status).toBe(200);
  const listText = await listResponse.text();
  expect(listText).not.toContain(TOKEN);
  expect(JSON.parse(listText).data).toEqual([
    {
      project: { id: project.id, name: 'Sandbox' },
      repos: [
        expect.objectContaining({
          id: repository.id,
          name: 'acme/sandbox',
          defaultBranch: 'main',
          memories: 1,
          ref: 'main@1234567',
          unavailable: null,
        }),
      ],
    },
  ]);

  const read = (
    await (
      await admin.fetch(`/projectMemory/${project.id}/repos/${repository.id}`)
    ).json()
  ).data;
  expect(read).toMatchObject({
    project: { id: project.id, name: 'Sandbox' },
    ref: 'main@1234567',
    limit: 50,
    total: 1,
    webUrl: 'https://github.test/acme/sandbox/tree/main/.nb-studio/memory',
    memories: [
      {
        path: '.nb-studio/memory/nhan-tieng-viet.md',
        name: 'Giữ nhãn tiếng Việt',
        type: 'feedback',
        modified: '2026-11-02',
        oversize: false,
      },
    ],
  });

  const file = await admin.fetch(
    `/projectMemory/${project.id}/repos/${repository.id}/file?path=${encodeURIComponent('.nb-studio/memory/nhan-tieng-viet.md')}`,
  );
  expect(file.status).toBe(200);
  expect((await file.json()).data.body).toContain('**Cách áp dụng:**');
  expect(
    (
      await admin.fetch(
        `/projectMemory/${project.id}/repos/${repository.id}/file?path=${encodeURIComponent('.nb-studio/memory/../config.yml')}`,
      )
    ).status,
  ).toBe(400);
  // A repository that does not serve the project is not found there.
  expect(
    (await admin.fetch(`/projectMemory/${project.id}/repos/unknown`)).status,
  ).toBe(404);
  // Within the minute GitHub is asked about the branch once.
  expect(
    github.calls.filter((call) => call.includes('/branches/main')),
  ).toHaveLength(1);

  // The command line offers the three reads.
  const manifest = (await (await admin.fetch('/cli/manifest')).json()).data as {
    commands: { id: string }[];
  };
  expect(manifest.commands.map((command) => command.id)).toEqual(
    expect.arrayContaining(['memory:list', 'memory:get', 'memory:read']),
  );

  // A contributor outside the members-only project sees none of it.
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
    (await (await contributor.fetch('/projectMemory')).json()).data,
  ).toEqual([]);
  expect(
    (
      await contributor.fetch(
        `/projectMemory/${project.id}/repos/${repository.id}`,
      )
    ).status,
  ).toBe(404);
  expect(
    (
      await contributor.fetch(
        `/projectMemory/${project.id}/repos/${repository.id}/file?path=${encodeURIComponent('.nb-studio/memory/nhan-tieng-viet.md')}`,
      )
    ).status,
  ).toBe(404);
});
