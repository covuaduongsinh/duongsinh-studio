// A project's page as the demo draws it: one route per tab under /projects/:projectId, the bare path going to Overview,
// Issues as the grouped table of that project, and Settings split into sections kept in `?section=`.
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
import { FIXED_STATUSES } from '@nocobase/app-plugin-projects/shared/statuses';
import {
  answerApi,
  renderWithApp,
  type ApiCall,
} from '@nocobase/app-testing/client';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import packageMetadata from '../../package.json' with { type: 'json' };
import enUS from '../../client/locales/en-US.js';
import ProjectDetailPage from '../../client/pages/projects/detail/index.js';
import { ProjectIssuesTab } from '../../client/pages/projects/detail/issues.js';
import { ProjectMembersTab } from '../../client/pages/projects/detail/members.js';
import { ProjectOverviewTab } from '../../client/pages/projects/detail/overview.js';
import { ProjectReleasesTab } from '../../client/pages/projects/detail/releases.js';
import { ProjectSettingsTab } from '../../client/pages/projects/detail/settings.js';

// The agents plugin's sections talk to its own API; what matters is the scope this page hands them.
vi.mock('@nocobase/app-plugin-agents/client/kit', () => ({
  VariablesSection: (props: { scope: string; scopeId: string }) => (
    <div data-testid='variables'>{`${props.scope}:${props.scopeId}`}</div>
  ),
  DefaultSkillsSection: (props: { scope: string; scopeId: string }) => (
    <div data-testid='skills'>{`${props.scope}:${props.scopeId}`}</div>
  ),
}));

const AT = '2026-11-01T09:00:00.000Z';

let manager = true;

const project = {
  id: 'p1',
  name: 'Studio Platform',
  description: 'The platform.',
  visibility: 'everyone',
  status: 'in_progress',
  priority: 'high',
  leadUserId: 'u1',
  startDate: null,
  dueDate: null,
  setupIssueId: null,
  lead: { id: 'u1', name: 'Ada' },
  members: [{ id: 'u1', name: 'Ada' }],
  memberCount: 1,
  issueCounts: {
    total: 10,
    done: 4,
    byStatus: { backlog: 3, in_progress: 2, in_review: 1, done: 4 },
  },
  createdAt: AT,
  updatedAt: AT,
};

const viewer = () => ({
  userId: 'u1',
  name: 'Ada',
  permissions: {
    scopes: Object.fromEntries(
      [
        'pm.projects/view',
        'pm.issues/view',
        ...(manager ? ['pm.projects/edit', 'pm.projects/manage'] : []),
      ].map((key) => [key, 'all']),
    ),
    settings: {},
  },
  kinds: [{ key: 'user', title: null, executor: true, mentionable: true }],
});

const getSession = vi.fn(async () => ({ data: null }));

const api = vi.fn((call: ApiCall): unknown => {
  const { method, path } = call;
  if (method === 'GET' && path === 'authorization/permissions')
    return { data: { unrestricted: true, permissions: [] } };
  if (method === 'GET' && path === 'projects/me') return { data: viewer() };
  if (method === 'GET' && path === 'projects/p1') return { data: project };
  if (method === 'GET' && path === 'projects/issues/statuses')
    return { data: FIXED_STATUSES };
  if (method === 'GET' && path === 'projectSetups/p1')
    return {
      data: {
        projectId: 'p1',
        method: 'prompt',
        state: 'running',
        repo: null,
        firstCommit: false,
        appTemplate: null,
        agentId: null,
        waitingForRunner: false,
        issueId: 'i9',
        runSucceeded: false,
        pushed: false,
        error: null,
        completedAt: null,
      },
    };
  if (method === 'GET' && path === 'taskGroups')
    return {
      data: {
        generation: AT,
        membership: 'u1',
        mode: 'table',
        groups: [],
        following: [],
        waiting: 0,
      },
    };
  if (method === 'GET' && path === 'deploys/hubCounts')
    return {
      data: {
        tagVersions: 0,
        pendingVersionTasks: 0,
        test: 0,
        previews: 0,
        releases: 0,
        unreleased: 0,
      },
    };
  if (
    method === 'GET' &&
    [
      'projects',
      'projects/labels',
      'projects/executors',
      'projects/members',
      'projects/apiKeyActors',
      'git/repositories',
      'git/connections',
      'deploys/releases',
      'deploys/environments',
      'deploys/pending',
      'projectMemory',
    ].includes(path)
  )
    return { data: [] };
  return new Response(null, { status: 404 });
});

function Probe() {
  const location = useLocation();
  return (
    <span data-testid='location'>{location.pathname + location.search}</span>
  );
}

async function renderAt(route: string) {
  return renderWithApp(
    <AuthenticationProvider>
      <Probe />
      <Routes>
        <Route path='/projects/:projectId' element={<ProjectDetailPage />}>
          <Route path='overview' element={<ProjectOverviewTab />} />
          <Route path='issues' element={<ProjectIssuesTab />} />
          <Route path='members' element={<ProjectMembersTab />} />
          <Route path='releases' element={<ProjectReleasesTab />} />
          <Route path='settings' element={<ProjectSettingsTab />} />
        </Route>
      </Routes>
    </AuthenticationProvider>,
    {
      route,
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

const calls = (path: string): ApiCall[] =>
  api.mock.calls.map(([call]) => call).filter((call) => call.path === path);
const where = () => screen.getByTestId('location').textContent;
const tabs = enUS.projectDetail.tabs;

describe('a project’s tabs', () => {
  beforeEach(() => {
    api.mockClear();
    manager = true;
  });

  it('sends the bare path to Overview and lists the tabs with the open one marked', async () => {
    await renderAt('/projects/p1');
    await waitFor(() => expect(where()).toBe('/projects/p1/overview'));
    const nav = await screen.findByRole('navigation', {
      name: enUS.projectDetail.tabsLabel,
    });
    for (const name of [
      tabs.overview,
      tabs.issues,
      tabs.knowledge,
      tabs.memory,
      tabs.members,
      tabs.releases,
      tabs.settings,
    ])
      expect(
        within(nav).getByRole('link', { name: new RegExp(`^${name}`) }),
      ).toBeInTheDocument();
    expect(
      within(nav).getByRole('link', { name: new RegExp(`^${tabs.overview}`) }),
    ).toHaveAttribute('aria-current', 'page');
    // The counts are the project's own figures.
    expect(
      within(nav).getByRole('link', { name: new RegExp(`^${tabs.issues} 10`) }),
    ).toBeInTheDocument();
  });

  it('shows the next step of a project still being set up, linking to its first issue', async () => {
    await renderAt('/projects/p1/overview');
    const card = await screen.findByRole('region', {
      name: enUS.projectDetail.nextSteps.title,
    });
    expect(
      within(card)
        .getByRole('link', { name: enUS.projectDetail.nextSteps.openIssue })
        .getAttribute('href'),
    ).toBe('/issues/i9');
  });

  it('lists the issues of this project alone, as the grouped table', async () => {
    const user = userEvent.setup();
    await renderAt('/projects/p1/overview');
    await user.click(
      await screen.findByRole('link', { name: new RegExp(`^${tabs.issues}`) }),
    );
    await waitFor(() => expect(where()).toBe('/projects/p1/issues'));
    await waitFor(() =>
      expect(calls('taskGroups')[0]?.query).toMatchObject({
        projectId: 'p1',
        mode: 'table',
        follow: 'scope',
      }),
    );
  });

  it('narrows the releases hub to the project', async () => {
    await renderAt('/projects/p1/releases');
    await waitFor(() =>
      expect(calls('deploys/hubCounts')[0]?.query).toMatchObject({
        projectId: 'p1',
      }),
    );
  });

  it('splits Settings into sections kept in the address, the variables on the project scope', async () => {
    const user = userEvent.setup();
    await renderAt('/projects/p1/settings');
    const sections = await screen.findByRole('navigation', {
      name: enUS.projectDetail.sectionsLabel,
    });
    await user.click(
      within(sections).getByRole('link', {
        name: enUS.projectDetail.sections.variables,
      }),
    );
    await waitFor(() => expect(where()).toContain('section=variables'));
    expect(await screen.findByTestId('variables')).toHaveTextContent(
      'project:p1',
    );
    expect(screen.queryByTestId('skills')).toBeNull();
    await user.click(
      within(sections).getByRole('link', {
        name: enUS.projectDetail.sections.skills,
      }),
    );
    expect(await screen.findByTestId('skills')).toHaveTextContent('project:p1');
  });

  it('leaves Settings out for someone who may not manage the project', async () => {
    manager = false;
    await renderAt('/projects/p1/overview');
    const nav = await screen.findByRole('navigation', {
      name: enUS.projectDetail.tabsLabel,
    });
    expect(
      within(nav).queryByRole('link', {
        name: new RegExp(`^${tabs.settings}`),
      }),
    ).toBeNull();
  });
});
