// `/releases` and `/environments` with `server/routes/deploys.ts` answered by the fixture below: versions with their
// marks, the actions each role is offered, marking production with a note, and the pending release list.
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
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import packageMetadata from '../../package.json' with { type: 'json' };
import enUS from '../../client/locales/en-US.js';
import EnvironmentsPage from '../../client/pages/environments/index.js';
import ReleasesPage from '../../client/pages/releases/index.js';

const words = enUS.releases;
const AT = '2026-11-02T10:00:00.000Z';
const getSession = vi.fn(async () => ({ data: null }));
let me: { owner: boolean; admin: boolean; deployer: boolean };

const line = {
  repositoryId: 'r1',
  branch: 'main',
  pattern: 'v*',
  stripPrefix: 'v',
  syncedAt: AT,
  syncError: null,
};
const version = (
  id: string,
  tag: string,
  current: { staging: boolean; production: boolean },
) => ({
  id,
  repositoryId: 'r1',
  repo: 'acme/sandbox',
  lineKey: 'stable',
  tag,
  version: tag.slice(1),
  sha: `${id}-sha`,
  committedAt: AT,
  previousVersionId: null,
  taskCount: 1,
  issueIds: [],
  discoveredAt: AT,
  deleted: false,
  current,
  reached: current,
});
const pending = [
  {
    issueId: 'i2',
    where: 'staging',
    repositoryId: 'r1',
    version: { id: 'v2', tag: 'v1.1' },
    staging: { tag: 'v1.1', at: AT },
    production: null,
    mergedAt: AT,
    pullRequest: { number: 2, url: 'https://github.com/acme/sandbox/pull/2' },
    issue: {
      id: 'i2',
      identifier: 'DS-2',
      title: 'Hàm ratingChange',
      projectId: 'p1',
      statusKey: 'done',
    },
  },
];

const api = vi.fn((call: ApiCall): unknown => {
  const { method, path } = call;
  if (method === 'GET' && path === 'authorization/permissions')
    return { data: { unrestricted: true, permissions: [] } };
  if (method === 'GET' && path === 'deploys/me')
    return { data: { userId: 'u1', ...me } };
  if (method === 'GET' && path === 'deploys/releases')
    return {
      data: [
        {
          project: { id: 'p1', name: 'Sandbox' },
          repositories: [
            {
              id: 'r1',
              repo: 'acme/sandbox',
              line,
              latest: { id: 'v2', tag: 'v1.1' },
              staging: { id: 'v2', tag: 'v1.1' },
              production: { id: 'v1', tag: 'v1.0' },
              pendingCount: 1,
              versionCount: 2,
            },
          ],
        },
      ],
    };
  if (method === 'GET' && path === 'deploys/versions')
    return {
      data: [
        version('v2', 'v1.1', { staging: true, production: false }),
        version('v1', 'v1.0', { staging: false, production: true }),
      ],
    };
  if (method === 'GET' && path === 'deploys/pending') return { data: pending };
  if (method === 'GET' && path === 'deploys/environments')
    return {
      data: [
        {
          key: 'production',
          name: 'Production',
          purpose: 'production',
          runsOn: 'external',
          recordOnly: true,
          protected: true,
          approvers: ['owner'],
          maxApps: 1,
          idleStopMinutes: null,
          removeOnClose: false,
          publicUrlPattern: 'https://nocobase.dsc.edu.vn',
          description: 'Hệ thống thật.',
          position: 3,
        },
      ],
    };
  if (method === 'POST' && path === 'deploys/versions/v2/marks')
    return { data: { reopenSuggestions: [] } };
  return new Response(null, { status: 404 });
});

async function render(page: ReactElement) {
  return renderWithApp(
    <AuthenticationProvider>{page}</AuthenticationProvider>,
    {
      namespace: packageMetadata.name,
      namespaces: { [packageMetadata.name]: enUS },
      plugins: [projects({ routes: false, realtime: false })],
      fetch: answerApi(api),
      services: (app) => {
        app.container.instance(authenticationClientToken, { getSession });
        app.container.singleton(
          authorizationClientToken,
          (resolver) =>
            new AuthorizationClient(resolver.resolve(apiClientToken)),
        );
      },
    },
  );
}

describe('releases page', () => {
  beforeEach(() => {
    api.mockClear();
    me = { owner: true, admin: true, deployer: true };
  });

  it('lists the versions with where they run and lets the owner mark production with a note', async () => {
    const user = userEvent.setup();
    await render(<ReleasesPage />);
    const table = await screen.findByRole('table');
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(3);
    expect(within(rows[1]).getByText('v1.1')).toBeInTheDocument();
    expect(within(rows[1]).getByText(words.where.staging)).toBeInTheDocument();
    expect(
      within(rows[2]).getByText(words.where.production),
    ).toBeInTheDocument();
    // The newer version is not on production: the owner may put it there; the current one offers nothing for production.
    await user.click(
      within(rows[1]).getByRole('button', { name: words.actions.production }),
    );
    const dialog = await screen.findByRole('dialog');
    const confirm = within(dialog).getByRole('button', {
      name: words.mark.confirm,
    });
    expect(confirm).toBeDisabled();
    await user.type(
      within(dialog).getByLabelText(words.mark.note),
      'Dokploy redeploy lúc 20:00',
    );
    await user.click(confirm);
    await waitFor(() =>
      expect(
        api.mock.calls
          .map(([call]) => call)
          .find((call) => call.path === 'deploys/versions/v2/marks')?.json,
      ).toEqual({
        environmentKey: 'production',
        kind: 'deployed',
        note: 'Dokploy redeploy lúc 20:00',
      }),
    );
  });

  it('offers a contributor who may deploy only a request, and lists what waits for production', async () => {
    me = { owner: false, admin: false, deployer: true };
    const user = userEvent.setup();
    await render(<ReleasesPage />);
    const table = await screen.findByRole('table');
    expect(
      within(table).queryByRole('button', { name: words.actions.production }),
    ).not.toBeInTheDocument();
    expect(
      within(table).queryByRole('button', { name: words.actions.staging }),
    ).not.toBeInTheDocument();
    expect(
      within(table).getAllByRole('button', { name: words.actions.request })
        .length,
    ).toBeGreaterThan(0);

    await user.click(
      await screen.findByRole('tab', { name: `${words.tabs.pending} 1` }),
    );
    expect(await screen.findByText('Hàm ratingChange')).toBeInTheDocument();
    expect(screen.getByText('DS-2')).toBeInTheDocument();
  });

  it('lists the hosted environments', async () => {
    await render(<EnvironmentsPage />);
    expect((await screen.findAllByText('Production')).length).toBeGreaterThan(
      0,
    );
    expect(screen.getByText(enUS.environments.protected)).toBeInTheDocument();
    expect(screen.getByText(enUS.environments.recordOnly)).toBeInTheDocument();
    expect(screen.getByText('https://nocobase.dsc.edu.vn')).toBeInTheDocument();
  });
});
