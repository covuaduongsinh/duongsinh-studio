// The git surfaces of the application, with `server/routes/git.ts` answered by the fixture below: an issue's pull request
// panel (checks, a refused merge, "Merge anyway" with its reason) and Settings → Git (the token form).
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
import { IssuePullRequests } from '../../client/pages/issues/detail/issue-pull-requests.js';
import GitSettingsPage from '../../client/pages/settings/git.js';

const AT = '2026-11-03T09:00:00.000Z';
const ISSUE_ID = '11';
const TOKEN = 'github_pat_test_value';

function pullRequest(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pr1',
    repositoryId: 'r1',
    repo: 'duongsinh/studio',
    provider: 'github',
    number: 12,
    url: 'https://github.com/duongsinh/studio/pull/12',
    title: 'Sign in with an email link',
    state: 'open',
    draft: false,
    headRef: 'agent/PM-1',
    baseRef: 'main',
    headSha: 'abc',
    mergeCommitSha: null,
    authorLogin: 'agent',
    mergeability: 'clean',
    hostMergeState: 'clean',
    ciState: 'failure',
    checks: [
      {
        kind: 'checkRun',
        name: 'build',
        status: 'completed',
        conclusion: 'success',
        outcome: 'success',
        url: 'https://github.com/duongsinh/studio/runs/1',
      },
      {
        kind: 'checkRun',
        name: 'lint',
        status: 'completed',
        conclusion: 'failure',
        outcome: 'failure',
        url: null,
      },
    ],
    issueId: ISSUE_ID,
    linkedBy: 'branch',
    mergedAt: null,
    mergedBy: null,
    mergeForcedReason: null,
    closedAt: null,
    snapshotAt: AT,
    mergeBlocker: null,
    mergeInStudio: true,
    checksSource: 'host',
    updatedAt: AT,
    ...overrides,
  };
}

function apiError(
  status: number,
  reason: string,
  metadata?: Record<string, unknown>,
): Response {
  return Response.json(
    {
      error: {
        code: status,
        status: status === 403 ? 'PERMISSION_DENIED' : 'INVALID_ARGUMENT',
        reason,
        domain: 'studio',
        message: reason,
        ...(metadata ? { metadata } : {}),
      },
    },
    { status },
  );
}

function appConnection(
  options: { installed?: boolean; missing?: string[] } = {},
) {
  return {
    id: 'app1',
    provider: 'github',
    kind: 'app',
    name: 'Duong Sinh Studio',
    account: 'covuaduongsinh',
    webUrl: 'https://github.com',
    apiBaseUrl: 'https://api.github.com',
    hasToken: options.installed === true,
    webhooks: options.installed === true,
    personalMethods: [],
    allowPersonalTokens: false,
    problems: options.installed ? [] : ['appNotInstalled'],
    usedBy: 0,
    app: {
      appId: '99',
      slug: 'duong-sinh-studio',
      htmlUrl: 'https://github.com/apps/duong-sinh-studio',
      ownerLogin: 'covuaduongsinh',
      installUrl: 'https://github.com/apps/duong-sinh-studio/installations/new',
      installationId: options.installed ? '7' : null,
      installationAccount: options.installed ? 'covuaduongsinh' : null,
      permissionsUrl: options.installed
        ? 'https://github.com/settings/installations/7'
        : null,
      missingPermissions: options.missing ?? [],
      webhookUrl:
        'https://studio.example.test/main/api/webhooks/github/connections/app1',
      lastDeliveryAt: options.installed ? AT : null,
      lastEvent: options.installed ? 'pull_request' : null,
      lastError: null,
    },
    createdAt: AT,
    updatedAt: AT,
  };
}

let pulls: unknown[];
let mergeAnswer: (call: ApiCall) => unknown;
let connections: unknown[];
const getSession = vi.fn(async () => ({ data: null }));

const api = vi.fn((call: ApiCall): unknown => {
  const { method, path } = call;
  if (method === 'GET' && path === 'authorization/permissions')
    return { data: { unrestricted: true, permissions: [] } };
  if (method === 'GET' && path === 'git/pullRequests') return { data: pulls };
  if (method === 'POST' && path === 'git/pullRequests/pr1/merge')
    return mergeAnswer(call);
  if (method === 'GET' && path === 'git/connections')
    return { data: connections };
  if (method === 'POST' && path === 'git/connections') {
    const created = {
      id: 'c1',
      provider: 'github',
      kind: 'token',
      name: 'Dương Sinh GitHub',
      account: 'duongsinh',
      webUrl: 'https://github.com',
      apiBaseUrl: 'https://api.github.com',
      hasToken: true,
      webhooks: false,
      personalMethods: [],
      allowPersonalTokens: false,
      problems: [],
      usedBy: 0,
      createdAt: AT,
      updatedAt: AT,
    };
    connections = [created];
    return Response.json({ data: created }, { status: 201 });
  }
  if (method === 'GET' && path === 'git/repositories') return { data: [] };
  if (method === 'POST' && path === 'git/connections/startAppManifest')
    return Response.json(
      {
        data: {
          connectionId: 'app1',
          postUrl: 'https://github.com/settings/apps/new?state=s1',
          manifest: { name: 'Duong Sinh Studio', public: false },
          expiresAt: AT,
        },
      },
      { status: 201 },
    );
  if (method === 'POST' && path === 'git/connections/appManifest/complete') {
    connections = [appConnection()];
    return Response.json({ data: appConnection() }, { status: 201 });
  }
  if (method === 'POST' && path === 'git/connections/app1/installation') {
    connections = [appConnection({ installed: true })];
    return { data: appConnection({ installed: true }) };
  }
  return new Response(null, { status: 404 });
});

async function render(ui: ReactElement, route?: string) {
  return renderWithApp(<AuthenticationProvider>{ui}</AuthenticationProvider>, {
    ...(route ? { route } : {}),
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
  });
}

function calls(method: string, path: string): ApiCall[] {
  return api.mock.calls
    .map(([call]) => call)
    .filter((call) => call.method === method && call.path === path);
}

const words = enUS.git;

describe('issue pull request panel', () => {
  beforeEach(() => {
    api.mockClear();
    pulls = [pullRequest()];
    mergeAnswer = () => ({ data: pullRequest({ state: 'merged' }) });
  });

  it('shows the pull request with its link, state and checks', async () => {
    await render(
      <IssuePullRequests issueId={ISSUE_ID} canMerge onMerged={() => {}} />,
    );

    const link = await screen.findByRole('link', {
      name: 'Open #12 on GitHub',
    });
    expect(link).toHaveAttribute(
      'href',
      'https://github.com/duongsinh/studio/pull/12',
    );
    expect(calls('GET', 'git/pullRequests')[0]?.query).toEqual({
      issueId: ISSUE_ID,
    });
    expect(screen.getByText('agent/PM-1 → main')).toBeInTheDocument();
    expect(screen.getByText(words.ci.failure)).toBeInTheDocument();
    const checks = screen.getByRole('list', {
      name: words.pullRequests.checks,
    });
    const rows = within(checks).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('build');
    expect(rows[0]).toHaveTextContent(words.outcomes.success);
    expect(
      within(rows[0]!).getByRole('link', { name: 'Open the check build' }),
    ).toHaveAttribute('href', 'https://github.com/duongsinh/studio/runs/1');
    expect(rows[1]).toHaveTextContent('lint');
    expect(rows[1]).toHaveTextContent(words.outcomes.failure);
  });

  it('shows why the server refused a merge, and offers Merge anyway for the checks', async () => {
    mergeAnswer = () =>
      apiError(400, 'MERGE_BLOCKED', { mergeBlocker: 'ciFailed' });
    await render(
      <IssuePullRequests issueId={ISSUE_ID} canMerge onMerged={() => {}} />,
    );

    await userEvent.click(
      await screen.findByRole('button', { name: words.pullRequests.merge }),
    );

    expect(await screen.findByRole('status')).toHaveTextContent(
      `Cannot merge yet: ${words.blockers.ciFailed}`,
    );
    expect(calls('POST', 'git/pullRequests/pr1/merge')[0]?.json).toEqual({
      force: false,
    });
    expect(
      screen.getByRole('button', { name: words.pullRequests.mergeAnyway }),
    ).toBeInTheDocument();
  });

  it('merges anyway only with a reason, sending force', async () => {
    pulls = [pullRequest({ mergeBlocker: 'ciPending', ciState: 'pending' })];
    const onMerged = vi.fn();
    await render(
      <IssuePullRequests issueId={ISSUE_ID} canMerge onMerged={onMerged} />,
    );

    await userEvent.click(
      await screen.findByRole('button', {
        name: words.pullRequests.mergeAnyway,
      }),
    );
    const dialog = await screen.findByRole('dialog', {
      name: words.force.title,
    });
    await userEvent.click(
      within(dialog).getByRole('button', { name: words.force.confirm }),
    );
    expect(
      within(dialog).getByText(words.force.reasonRequired),
    ).toBeInTheDocument();
    expect(calls('POST', 'git/pullRequests/pr1/merge')).toHaveLength(0);

    await userEvent.type(
      within(dialog).getByRole('textbox', { name: words.force.reason }),
      'Hotfix for the tournament',
    );
    await userEvent.click(
      within(dialog).getByRole('button', { name: words.force.confirm }),
    );

    await waitFor(() =>
      expect(calls('POST', 'git/pullRequests/pr1/merge')[0]?.json).toEqual({
        force: true,
        reason: 'Hotfix for the tournament',
      }),
    );
    await waitFor(() => expect(onMerged).toHaveBeenCalledTimes(1));
  });

  it('stops offering the merge when the server refuses the viewer', async () => {
    mergeAnswer = () => apiError(403, 'ACCESS_DENIED');
    await render(
      <IssuePullRequests issueId={ISSUE_ID} canMerge onMerged={() => {}} />,
    );

    await userEvent.click(
      await screen.findByRole('button', { name: words.pullRequests.merge }),
    );

    expect(
      await screen.findByText(words.pullRequests.mergeDenied),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: words.pullRequests.merge }),
    ).not.toBeInTheDocument();
  });

  it('offers no merge to a viewer who may not close the issue', async () => {
    await render(
      <IssuePullRequests
        issueId={ISSUE_ID}
        canMerge={false}
        onMerged={() => {}}
      />,
    );

    await screen.findByRole('link', { name: 'Open #12 on GitHub' });
    expect(
      screen.queryByRole('button', { name: words.pullRequests.merge }),
    ).not.toBeInTheDocument();
  });
});

describe('git settings page', () => {
  beforeEach(() => {
    api.mockClear();
    connections = [];
  });

  it('takes the token in a password field, sends it once and clears it after saving', async () => {
    await render(<GitSettingsPage />);
    await screen.findByText(words.settings.connections.empty);

    const token = screen.getByLabelText(words.settings.connections.token);
    expect(token).toHaveAttribute('type', 'password');
    await userEvent.type(
      screen.getByRole('textbox', { name: words.settings.connections.name }),
      'Dương Sinh GitHub',
    );
    await userEvent.type(token, TOKEN);
    await userEvent.click(
      screen.getByRole('button', { name: words.settings.connections.add }),
    );

    await waitFor(() =>
      expect(calls('POST', 'git/connections')[0]?.json).toEqual({
        name: 'Dương Sinh GitHub',
        token: TOKEN,
      }),
    );
    await waitFor(() => expect(token).toHaveValue(''));
    // The connection is listed with its token kept, and the token itself is nowhere on the page.
    expect(
      await screen.findByText(words.settings.connections.tokenKept),
    ).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(TOKEN);
  });

  it('asks for a name and a token before sending anything', async () => {
    await render(<GitSettingsPage />);
    await screen.findByText(words.settings.connections.empty);

    await userEvent.click(
      screen.getByRole('button', { name: words.settings.connections.add }),
    );

    expect(
      screen.getByText(words.settings.connections.nameRequired),
    ).toBeInTheDocument();
    expect(
      screen.getByText(words.settings.connections.tokenRequired),
    ).toBeInTheDocument();
    expect(calls('POST', 'git/connections')).toHaveLength(0);
  });

  it('creates a GitHub App by posting the manifest Studio answers to GitHub', async () => {
    const submit = vi
      .spyOn(HTMLFormElement.prototype, 'submit')
      .mockImplementation(() => {});
    await render(<GitSettingsPage />);
    await screen.findByText(words.settings.app.empty);

    await userEvent.click(
      screen.getByRole('button', { name: words.settings.app.create }),
    );

    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(calls('POST', 'git/connections/startAppManifest')[0]?.json).toEqual(
      {},
    );
    const form = submit.mock.contexts[0] as HTMLFormElement;
    expect(form.method).toBe('post');
    expect(form.action).toBe('https://github.com/settings/apps/new?state=s1');
    const field = form.querySelector('input[name="manifest"]');
    expect(JSON.parse((field as HTMLInputElement).value)).toEqual({
      name: 'Duong Sinh Studio',
      public: false,
    });
    submit.mockRestore();
    form.remove();
  });

  it('finishes the App GitHub sends back, once, and offers to install it', async () => {
    await render(<GitSettingsPage />, '/?code=c0de&state=s1');

    await waitFor(() =>
      expect(
        calls('POST', 'git/connections/appManifest/complete')[0]?.json,
      ).toEqual({ code: 'c0de', state: 's1' }),
    );
    expect(
      await screen.findByText(words.settings.app.notInstalled),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: words.settings.app.install }),
    ).toHaveAttribute(
      'href',
      'https://github.com/apps/duong-sinh-studio/installations/new',
    );
    expect(calls('POST', 'git/connections/appManifest/complete')).toHaveLength(
      1,
    );
  });

  it('records the installation GitHub returns with, and shows the webhook', async () => {
    connections = [appConnection()];
    await render(
      <GitSettingsPage />,
      '/?githubApp=app1&installation_id=7&setup_action=install',
    );

    await waitFor(() =>
      expect(
        calls('POST', 'git/connections/app1/installation')[0]?.json,
      ).toEqual({ installationId: '7' }),
    );
    expect(
      await screen.findByText(
        words.settings.app.installedOn.replace('{{account}}', 'covuaduongsinh'),
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: words.settings.app.permissions }),
    ).toHaveAttribute('href', 'https://github.com/settings/installations/7');
  });

  it('warns about permissions the installation lacks', async () => {
    connections = [
      appConnection({ installed: true, missing: ['checks:write'] }),
    ];
    await render(<GitSettingsPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent('checks:write');
  });
});
