// The project's switch for Studio merging a finished stage by itself, and who is shown the emergency stop.
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
import { ProjectAutopilot } from '../../client/pages/projects/project-autopilot.js';
import ProjectsGeneralSettingsPage from '../../client/pages/settings/projects-general.js';

// The plugin's issue prefix form talks to its own API.
vi.mock('@nocobase/app-plugin-projects/client/config', () => ({
  GeneralSettings: () => <p>issue prefix</p>,
}));

const getSession = vi.fn(async () => ({ data: null }));
let unrestricted = true;
let stagesOn = true;

const project = {
  id: 'p1',
  name: 'Studio',
  description: '',
  visibility: 'everyone',
  status: 'in_progress',
  priority: 'none',
  leadUserId: 'u1',
  startDate: null,
  dueDate: null,
  setupIssueId: null,
  lead: { id: 'u1', name: 'Ada' },
  members: [{ id: 'u1', name: 'Ada' }],
  memberCount: 1,
  issueCounts: { total: 0, done: 0, byStatus: {} },
};

const settings = () => ({
  projectId: 'p1',
  enabled: false,
  autoMergeStages: stagesOn,
  mergeMethod: 'squash',
  maxMergesPerDay: null,
  maxActiveIssues: null,
  stallMinutes: 30,
  sensitivePaths: null,
  sensitivePolicy: 'extraReview',
  pausedReason: null,
  updatedAt: '2026-11-11T00:00:00.000Z',
  updatedById: null,
});

const api = vi.fn((call: ApiCall): unknown => {
  const { method, path } = call;
  if (method === 'GET' && path === 'authorization/permissions')
    return { data: { unrestricted, permissions: [] } };
  if (method === 'GET' && path === 'projects/me')
    return {
      data: {
        userId: 'u1',
        name: 'Ada',
        permissions: {
          scopes: Object.fromEntries(
            ['pm.projects/view', 'pm.projects/edit', 'pm.projects/manage'].map(
              (key) => [key, 'all'],
            ),
          ),
          settings: {},
        },
        kinds: [],
      },
    };
  if (method === 'GET' && path === 'projects/p1') return { data: project };
  if (method === 'GET' && path === 'projects/p1/autopilot')
    return { data: settings() };
  if (method === 'PUT' && path === 'projects/p1/autopilot')
    return { data: settings() };
  if (method === 'GET' && path === 'autopilot/events') return { data: [] };
  return new Response(null, { status: 404 });
});

async function render(node: React.ReactElement) {
  return renderWithApp(
    <AuthenticationProvider>{node}</AuthenticationProvider>,
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

describe('merging a finished stage by itself', () => {
  beforeEach(() => {
    api.mockClear();
    unrestricted = true;
    stagesOn = true;
  });

  it('is a switch in the project’s autopilot, on by default, saved with the rest', async () => {
    const user = userEvent.setup();
    stagesOn = false;
    await render(<ProjectAutopilot projectId='p1' />);
    const toggle = await screen.findByRole('switch', {
      name: enUS.autopilot.fields.autoMergeStages,
    });
    expect(toggle).not.toBeChecked();
    await user.click(toggle);
    expect(toggle).toBeChecked();
    await user.click(
      screen.getByRole('button', { name: enUS.autopilot.actions.save }),
    );
    await waitFor(() =>
      expect(
        api.mock.calls
          .map(([call]) => call)
          .find((call) => call.method === 'PUT')?.json,
      ).toMatchObject({ autoMergeStages: true }),
    );
  });
});

describe('the emergency stop', () => {
  beforeEach(() => {
    api.mockClear();
  });

  it('is shown to an unrestricted administrator, the only one the server lets stop everything', async () => {
    unrestricted = true;
    await render(<ProjectsGeneralSettingsPage />);
    expect(
      await screen.findByText(enUS.autopilot.emergencyStop.cardTitle),
    ).toBeInTheDocument();
  });

  it('is not shown to anyone else', async () => {
    unrestricted = false;
    await render(<ProjectsGeneralSettingsPage />);
    await screen.findByText('issue prefix');
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(
      screen.queryByText(enUS.autopilot.emergencyStop.cardTitle),
    ).not.toBeInTheDocument();
  });
});
