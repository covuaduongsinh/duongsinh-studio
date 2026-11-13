// The App registration form (plan V, V5.3) at phone width: fill it, register, then the checklist (DNS, CI key, workflow).
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
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import packageMetadata from '../../package.json' with { type: 'json' };
import enUS from '../../client/locales/en-US.js';
import RegisterAppPage from '../../client/pages/releases/register-app.js';
import { stubMobileViewport } from './helpers/mobile-viewport.js';

stubMobileViewport();
const words = enUS.releases.register;
let refusal: string | null = null;

const api = vi.fn((call: ApiCall): unknown => {
  const { method, path } = call;
  if (method === 'GET' && path === 'authorization/permissions')
    return { data: { unrestricted: true, permissions: [] } };
  if (method === 'GET' && path === 'deploys/releases')
    return {
      data: [
        {
          project: { id: 'p1', name: 'Sandbox' },
          repositories: [{ id: 'r1', repo: 'acme/sandbox' }],
        },
      ],
    };
  if (method === 'POST' && path === 'nb3Apps/register') {
    if (refusal)
      return new Response(
        JSON.stringify({ error: { reason: refusal, message: 'x' } }),
        { status: 409, headers: { 'content-type': 'application/json' } },
      );
    return {
      data: {
        appId: 'sandbox-preview',
        environmentId: 'nb3-preview',
        environmentCreated: true,
        host: 'sandbox-preview.dsc.edu.vn',
        workflow: {
          path: '.github/workflows/ds-studio-sandbox-preview.yml',
          content: 'name: Dương Sinh Studio sandbox-preview\n',
        },
        secretName: 'DS_STUDIO_API_KEY',
      },
    };
  }
  if (method === 'POST' && path === 'releases/environments/nb3-preview/check')
    return {
      data: {
        ok: true,
        details: { dns: { 'sandbox-preview.dsc.edu.vn': '203.0.113.7' } },
      },
    };
  if (method === 'POST' && path === 'repositoryDeployments/r1/ci/setup')
    return { data: { secret: 'ds_key_secret_value' } };
  return new Response(null, { status: 404 });
});

async function render() {
  return renderWithApp(
    <AuthenticationProvider>
      <RegisterAppPage />
    </AuthenticationProvider>,
    {
      namespace: packageMetadata.name,
      namespaces: { [packageMetadata.name]: enUS },
      plugins: [projects({ routes: false, realtime: false })],
      fetch: answerApi(api),
      services: (app) => {
        app.container.instance(authenticationClientToken, {
          getSession: vi.fn(async () => ({ data: null })),
        });
        app.container.singleton(
          authorizationClientToken,
          (resolver) =>
            new AuthorizationClient(resolver.resolve(apiClientToken)),
        );
      },
    },
  );
}

async function fill(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    await screen.findByRole('combobox', { name: words.repository }),
  );
  await user.click(await screen.findByRole('option', { name: 'acme/sandbox' }));
  await user.type(screen.getByLabelText(words.appId), 'sandbox-preview');
  await user.type(
    screen.getByLabelText(words.host),
    'sandbox-preview.dsc.edu.vn',
  );
}

describe('register an NB3 App', () => {
  beforeEach(() => {
    api.mockClear();
    refusal = null;
  });

  it('stays disabled until the form is valid, then registers and lists what is left', async () => {
    const user = userEvent.setup();
    await render();
    const submit = await screen.findByRole('button', { name: words.submit });
    expect(submit).toBeDisabled();
    await fill(user);
    expect(submit).toBeEnabled();
    await user.click(submit);

    expect(await screen.findByTestId('register-result')).toBeInTheDocument();
    expect(
      api.mock.calls
        .map(([call]) => call)
        .find((call) => call.path === 'nb3Apps/register')?.json,
    ).toEqual({
      repositoryId: 'r1',
      appId: 'sandbox-preview',
      host: 'sandbox-preview.dsc.edu.vn',
      role: 'preview',
      database: 'sqlite',
    });
    expect(
      screen.getByText('name: Dương Sinh Studio sandbox-preview', {
        exact: false,
      }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: words.checkDns }));
    expect(await screen.findByRole('status')).toHaveTextContent('203.0.113.7');

    expect(screen.queryByTestId('ci-secret')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: words.makeKey }));
    expect(await screen.findByTestId('ci-secret')).toHaveTextContent(
      'ds_key_secret_value',
    );
  });

  it('says why a registration was refused', async () => {
    refusal = 'HOST_TAKEN';
    const user = userEvent.setup();
    await render();
    await fill(user);
    await user.click(screen.getByRole('button', { name: words.submit }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        words.errors.HOST_TAKEN,
      ),
    );
    expect(screen.queryByTestId('register-result')).not.toBeInTheDocument();
  });
});
