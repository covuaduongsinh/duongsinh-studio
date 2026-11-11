// The Issues page's grouped table over the projects plugin's real client: groups from `taskGroups?mode=table`, folded
// per person, with a project column and the signs on a row (agent working, waiting, pull request and checks, sub-issues).
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
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import packageMetadata from '../../package.json' with { type: 'json' };
import enUS from '../../client/locales/en-US.js';
import { IssueWorkspace } from '../../client/pages/issues/issue-workspace.js';

const AT = '2026-11-01T09:00:00.000Z';
const ADA = { id: 'u1', name: 'Ada Lovelace' };

const viewer = {
  userId: ADA.id,
  name: ADA.name,
  permissions: {
    scopes: Object.fromEntries(
      ['pm.projects/view', 'pm.issues/view', 'pm.issues/edit'].map((key) => [
        key,
        'all',
      ]),
    ),
    settings: {},
  },
  kinds: [{ key: 'user', title: null, executor: true, mentionable: true }],
};

function issueOf(id: string, number: number, title: string, statusKey: string) {
  return {
    id,
    number,
    identifier: `PM-${number}`,
    title,
    description: '',
    statusKey,
    needsYou: null,
    next: null,
    acceptance: null,
    priority: 'medium',
    ownerUserId: ADA.id,
    executor: null,
    parentIssueId: null,
    stage: null,
    projectId: null,
    startDate: null,
    dueDate: null,
    revision: 1,
    createdById: ADA.id,
    createdAt: AT,
    updatedAt: AT,
    lastActivityAt: AT,
    deletedAt: null,
    owner: ADA,
    executorName: null,
    project: null,
    labels: [],
    subtaskCount: 0,
    blockedCount: 0,
  };
}

const rowOf = (
  issue: ReturnType<typeof issueOf>,
  extra: Record<string, unknown> = {},
) => ({
  issue,
  dependencyWait: false,
  blockers: [],
  waits: [],
  followed: false,
  waitingSince: null,
  unread: 0,
  parent: null,
  progress: { finished: 0, total: 0 },
  hasChildren: false,
  context: false,
  expand: [],
  ...extra,
});

const withProject = (issue: ReturnType<typeof issueOf>, name: string) => ({
  ...issue,
  project: { id: 'p1', name },
  projectId: 'p1',
});

const review = withProject(
  issueOf('31', 31, 'Review the export', 'in_review'),
  'Studio Platform',
);
const running = {
  ...withProject(
    issueOf('32', 32, 'Agent builds it', 'in_progress'),
    'Studio Platform',
  ),
  executor: { type: 'agent', id: 'a1' },
  executorName: 'Claude',
};
const held = issueOf('33', 33, 'Waits for a prerequisite', 'backlog');
const stopped = issueOf('34', 34, 'Blocked by the host', 'blocked');
const dropped = issueOf('35', 35, 'Dropped idea', 'cancelled');

const taskGroups = {
  generation: AT,
  membership: ADA.id,
  mode: 'table',
  groups: [
    { group: 'wait', count: 1, data: [rowOf(review, { waits: ['accept'] })] },
    {
      group: 'doing',
      count: 1,
      data: [
        rowOf(running, {
          progress: { finished: 1, total: 3 },
          hasChildren: true,
        }),
      ],
    },
    { group: 'blocked', count: 1, data: [rowOf(stopped)] },
    {
      group: 'backlog',
      count: 1,
      data: [
        rowOf(held, {
          dependencyWait: true,
          blockers: [
            {
              issueId: '99',
              identifier: 'PM-99',
              title: 'Prerequisite',
              reason: 'dependency',
            },
          ],
        }),
      ],
    },
    { group: 'cancelled', count: 1, data: [rowOf(dropped)] },
  ],
  following: [],
  waiting: 1,
};

const getSession = vi.fn(async () => ({ data: null }));

const api = vi.fn((call: ApiCall): unknown => {
  const { method, path } = call;
  if (method === 'GET' && path === 'authorization/permissions')
    return { data: { unrestricted: true, permissions: [] } };
  if (method === 'GET' && path === 'projects/me') return { data: viewer };
  if (method === 'GET' && path === 'taskGroups') return { data: taskGroups };
  if (method === 'GET' && path === 'git/pullRequests/marks')
    return {
      data: {
        '32': {
          count: 1,
          merged: false,
          state: 'open',
          ciState: 'success',
          url: 'https://github.test/pr/5',
        },
      },
    };
  if (method === 'GET' && path === 'projects/issues/statuses')
    return { data: FIXED_STATUSES };
  if (
    method === 'GET' &&
    [
      'projects',
      'projects/labels',
      'projects/executors',
      'projects/members',
      'projects/apiKeyActors',
      'deploys/marks',
    ].includes(path)
  )
    return { data: [] };
  return new Response(null, { status: 404 });
});

async function renderIssues(route = '/issues') {
  return renderWithApp(
    <AuthenticationProvider>
      <Routes>
        <Route
          path='/issues'
          element={<IssueWorkspace page='issues' fixedFilters={{}} />}
        />
        <Route path='/issues/:issueId' element={<span>issue page</span>} />
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

const calls = (method: string, path: string): ApiCall[] =>
  api.mock.calls
    .map(([call]) => call)
    .filter((call) => call.method === method && call.path === path);

describe('issues grouped table', () => {
  beforeEach(() => {
    api.mockClear();
    window.localStorage.clear();
  });

  it('reads the table groups from taskGroups, scoped to the filters, and shows the project of each row', async () => {
    await renderIssues();
    expect(await screen.findByText(review.title)).toBeInTheDocument();
    expect(calls('GET', 'taskGroups')[0]?.query).toMatchObject({
      mode: 'table',
      follow: 'scope',
    });
    expect(calls('GET', 'projects/issues/board')).toHaveLength(0);
    for (const label of [
      enUS.issues.groups.waitingForYou,
      enUS.issues.groups.inProgress,
      enUS.issues.groups.blocked,
      enUS.issues.groups.backlog,
    ])
      expect(screen.getByRole('region', { name: label })).toBeInTheDocument();
    expect(screen.getAllByText('Studio Platform').length).toBeGreaterThan(0);
  });

  it('says what holds a row, who works on it, its pull request and its sub-issues', async () => {
    await renderIssues();
    await screen.findByText(running.title);
    expect(
      screen.getByText(enUS.issues.split.waits.accept),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        enUS.issues.split.blockedBy.replace('{{identifier}}', 'PM-99'),
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(enUS.issues.split.agentWorking),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        enUS.issues.list.subtasks
          .replace('{{finished}}', '1')
          .replace('{{total}}', '3'),
      ),
    ).toBeInTheDocument();
    const pr = await screen.findByText(
      `${enUS.issues.list.pr.open} · ${enUS.issues.list.ci.success}`,
    );
    expect(pr.closest('a')?.getAttribute('href')).toBe(
      'https://github.test/pr/5',
    );
    expect(calls('GET', 'git/pullRequests/marks')[0]?.query).toMatchObject({
      issueIds: expect.stringContaining('32'),
    });
  });

  it('folds a group with its count and remembers it; Cancelled starts folded', async () => {
    const user = userEvent.setup();
    const first = await renderIssues();
    await screen.findByText(running.title);
    expect(screen.queryByText(dropped.title)).toBeNull();

    await user.click(
      screen.getByRole('button', {
        name: enUS.issues.split.fold.replace(
          '{{group}}',
          enUS.issues.groups.inProgress,
        ),
      }),
    );
    expect(screen.queryByText(running.title)).toBeNull();
    expect(screen.getByText(held.title)).toBeInTheDocument();

    first.unmount();
    await renderIssues();
    await screen.findByText(held.title);
    expect(screen.queryByText(running.title)).toBeNull();
  });

  it('opens an issue from its row', async () => {
    const user = userEvent.setup();
    await renderIssues();
    await user.click(await screen.findByText(held.title));
    expect(await screen.findByText('issue page')).toBeInTheDocument();
  });
});
