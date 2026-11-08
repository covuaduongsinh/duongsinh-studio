// A project's Code section: the administrator's "Add CI" button, which asks `POST /api/projectSetups/{id}/ci` for a pull request
// (never a push) and words the server's refusals in the reader's language.
import {
  AuthenticationProvider,
  authenticationClientToken,
} from '@nocobase/app-plugin-authentication/client';
import {
  answerApi,
  renderWithApp,
  type ApiCall,
} from '@nocobase/app-testing/client';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';

import packageMetadata from '../../package.json' with { type: 'json' };
import enUS from '../../client/locales/en-US.js';
import { ProjectCode } from '../../client/pages/projects/project-code.js';

let isAdmin = true;

// The viewer and the permission come from the projects plugin's own request; the button's rule is what is under test.
vi.mock('@nocobase/app-plugin-projects/client/kit', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  useViewer: () => ({
    userId: 'u1',
    name: 'Admin',
    permissions: {},
    kinds: [],
  }),
  canUseSetting: () => isAdmin,
}));

const repository = {
  id: 'r1',
  connectionId: 'c1',
  provider: 'github',
  repo: 'acme/sandbox',
  cloneUrl: 'https://github.test/acme/sandbox.git',
  webUrl: 'https://github.test/acme/sandbox',
  defaultBranch: 'main',
  branchPrefix: 'agent/',
  checksSource: 'host',
  requiredChecks: [],
  referenceChecks: [],
  pollSeconds: 300,
  polledAt: null,
  pollError: null,
  projects: [{ projectId: 'p1', isPrimary: true }],
};

let ciAnswer: () => unknown;
const api = vi.fn((call: ApiCall): unknown => {
  if (call.method === 'GET' && call.path === 'git/repositories')
    return { data: [repository] };
  if (call.method === 'POST' && call.path === 'projectSetups/p1/ci')
    return ciAnswer();
  return new Response(null, { status: 404 });
});

const apiError = (status: number, reason: string) =>
  new Response(
    JSON.stringify({
      error: { code: status, status: 'ERR', reason, message: reason },
    }),
    { status, headers: { 'content-type': 'application/json' } },
  );

function render() {
  return renderWithApp(
    <AuthenticationProvider>
      <ProjectCode projectId='p1' />
    </AuthenticationProvider>,
    {
      namespace: packageMetadata.name,
      namespaces: { [packageMetadata.name]: enUS },
      fetch: answerApi(api),
      services: (app) => {
        app.container.instance(authenticationClientToken, {
          getSession: async () => ({ data: null }),
        });
      },
    },
  );
}

const words = enUS.git.projectCode;

beforeEach(() => {
  api.mockClear();
  isAdmin = true;
  ciAnswer = () => ({
    data: {
      branch: 'ci/ds-check',
      pullRequest: {
        number: 7,
        url: 'https://github.test/acme/sandbox/pull/7',
      },
    },
  });
});

it('opens the pull request and says where it is', async () => {
  await render();
  await userEvent.click(
    await screen.findByRole('button', { name: words.addCi }),
  );
  await waitFor(() =>
    expect(
      api.mock.calls.filter(([call]) => call.path === 'projectSetups/p1/ci'),
    ).toHaveLength(1),
  );
  expect(
    await screen.findByText(
      words.ciProposed
        .replace('{{number}}', '7')
        .replace('{{url}}', 'https://github.test/acme/sandbox/pull/7'),
    ),
  ).toBeInTheDocument();
});

it('words a refusal instead of a generic failure', async () => {
  ciAnswer = () => apiError(409, 'GIT_BRANCH_EXISTS');
  await render();
  await userEvent.click(
    await screen.findByRole('button', { name: words.addCi }),
  );
  expect(
    await screen.findByText(enUS.git.errors.GIT_BRANCH_EXISTS),
  ).toBeInTheDocument();
});

it('offers the button only to whoever may link repositories', async () => {
  isAdmin = false;
  await render();
  expect(await screen.findByText('acme/sandbox')).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: words.addCi }),
  ).not.toBeInTheDocument();
});
