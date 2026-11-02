// `/project-memory` with `server/routes/project-memory.ts` answered by the fixture below: the repository's memories by
// type, the search, the drawer with the full text, and the empty and unavailable states.
import { apiClientToken } from '@nocobase/app-client';
import {
  AuthenticationProvider,
  authenticationClientToken,
} from '@nocobase/app-plugin-authentication/client';
import {
  AuthorizationClient,
  authorizationClientToken,
} from '@nocobase/app-plugin-authorization/client';
import projects from '@nocobase/app-plugin-projects/client';
import {
  answerApi,
  renderWithApp,
  type ApiCall,
} from '@nocobase/app-testing/client';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import packageMetadata from '../../package.json' with { type: 'json' };
import enUS from '../../client/locales/en-US.js';
import ProjectMemoryPage from '../../client/pages/project-memory/index.js';

const AT = new Date().toISOString();
const words = enUS.projectMemory;

const memory = (slug: string, name: string, type: string, modified: string) => ({
  path: `.nb-studio/memory/${slug}.md`,
  slug,
  sha: `blob-${slug}`,
  name,
  description: `About ${name}`,
  type,
  modified,
  size: 300,
  oversize: false,
  problems: [],
  webUrl: `https://github.com/acme/sandbox/blob/main/.nb-studio/memory/${slug}.md`,
});

let list: unknown[];
let repository: Record<string, unknown>;
const getSession = vi.fn(async () => ({ data: null }));

const api = vi.fn((call: ApiCall): unknown => {
  const { method, path } = call;
  if (method === 'GET' && path === 'authorization/permissions')
    return { data: { unrestricted: true, permissions: [] } };
  if (method === 'GET' && path === 'projectMemory') return { data: list };
  if (method === 'GET' && path === 'projectMemory/p1/repos/r1') return { data: repository };
  if (method === 'GET' && path === 'projectMemory/p1/repos/r1/file')
    return {
      data: {
        ...memory('labels', 'Vietnamese labels', 'feedback', '2026-11-02'),
        body: 'Every new label ships in Vietnamese.\n\n**Vì sao:** the teachers read Vietnamese.',
        ref: 'main@1234567',
        commitSha: '1234567890',
      },
    };
  return new Response(null, { status: 404 });
});

async function render() {
  return renderWithApp(
    <AuthenticationProvider>
      <ProjectMemoryPage />
    </AuthenticationProvider>,
    {
      namespace: packageMetadata.name,
      namespaces: { [packageMetadata.name]: enUS },
      plugins: [projects({ routes: false, realtime: false })],
      fetch: answerApi(api),
      services: (app) => {
        app.container.instance(authenticationClientToken, { getSession });
        app.container.singleton(
          authorizationClientToken,
          (resolver) => new AuthorizationClient(resolver.resolve(apiClientToken)),
        );
      },
    },
  );
}

describe('project memory page', () => {
  beforeEach(() => {
    api.mockClear();
    list = [
      {
        project: { id: 'p1', name: 'Sandbox' },
        repos: [
          {
            id: 'r1',
            name: 'acme/sandbox',
            provider: 'github',
            defaultBranch: 'main',
            memories: 2,
            ref: 'main@1234567',
            checkedAt: AT,
            unavailable: null,
          },
        ],
      },
    ];
    repository = {
      project: { id: 'p1', name: 'Sandbox' },
      repositoryId: 'r1',
      repo: 'acme/sandbox',
      provider: 'github',
      branch: 'main',
      commitSha: '1234567890',
      ref: 'main@1234567',
      checkedAt: AT,
      limit: 50,
      total: 2,
      webUrl: 'https://github.com/acme/sandbox/tree/main/.nb-studio/memory',
      memories: [
        memory('labels', 'Vietnamese labels', 'feedback', '2026-11-02'),
        memory('ci', 'CI runs on NocoBase 2.2.36', 'project', '2026-11-01'),
      ],
      unavailable: null,
    };
  });

  it('lists the memories by type, filters them, and opens one', async () => {
    const user = userEvent.setup();
    await render();

    const cards = await screen.findByRole('list', { name: words.title });
    expect(within(cards).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('From main@1234567')).toBeInTheDocument();
    expect(screen.getByText(/2 \/ 50/u)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: words.viewRepository })).toHaveAttribute(
      'href',
      'https://github.com/acme/sandbox/tree/main/.nb-studio/memory',
    );

    await user.click(screen.getByRole('tab', { name: `${words.tabs.feedback} 1` }));
    expect(within(screen.getByRole('list', { name: words.title })).getAllByRole('listitem')).toHaveLength(1);
    await user.click(screen.getByRole('tab', { name: `${words.tabs.all} 2` }));

    await user.type(screen.getByRole('searchbox', { name: words.search }), 'nocobase');
    await waitFor(() =>
      expect(within(screen.getByRole('list', { name: words.title })).getAllByRole('listitem')).toHaveLength(1),
    );
    await user.clear(screen.getByRole('searchbox', { name: words.search }));

    await user.click(screen.getByRole('button', { name: /Vietnamese labels/u }));
    expect(await screen.findByText('Every new label ships in Vietnamese.')).toBeInTheDocument();
    const fileCall = api.mock.calls.map(([call]) => call).find((call) => call.path === 'projectMemory/p1/repos/r1/file');
    expect(fileCall?.query).toEqual({ path: '.nb-studio/memory/labels.md' });
  });

  it('says when no project has a repository, and when GitHub refuses', async () => {
    list = [];
    const { unmount } = await render();
    expect(await screen.findByText(words.noRepositories)).toBeInTheDocument();
    unmount();

    list = [
      {
        project: { id: 'p1', name: 'Sandbox' },
        repos: [
          {
            id: 'r1',
            name: 'acme/sandbox',
            provider: 'github',
            defaultBranch: 'main',
            memories: 0,
            ref: null,
            checkedAt: null,
            unavailable: 'unreachable',
          },
        ],
      },
    ];
    repository = { ...repository, commitSha: null, ref: null, checkedAt: null, total: 0, memories: [], unavailable: 'unreachable' };
    await render();
    expect(await screen.findByText(words.unavailable.unreachable)).toBeInTheDocument();
    expect(screen.getByText(words.empty)).toBeInTheDocument();
  });
});
