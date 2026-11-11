// The split view of My issues over the projects plugin's real client: the grouped list read from `taskGroups`, groups
// that fold and are remembered per person, the chosen issue kept in the URL, the "n / total" stepper and the keys.
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
import type { ReactElement } from 'react';
import { Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import packageMetadata from '../../package.json' with { type: 'json' };
import enUS from '../../client/locales/en-US.js';
import { IssueSplitView } from '../../client/pages/issues/issue-split-view.js';
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

const accept = issueOf(
  '21',
  21,
  'Notify the owner on a status change',
  'in_review',
);
const running = issueOf('22', 22, 'Hide private prerequisites', 'in_progress');
const held = issueOf('23', 23, 'Language switcher', 'backlog');
const finished = issueOf('24', 24, 'Filter run logs', 'done');

const taskGroups = {
  generation: AT,
  membership: ADA.id,
  mode: 'split',
  groups: [
    { group: 'wait', count: 1, data: [rowOf(accept, { waits: ['accept'] })] },
    { group: 'doing', count: 1, data: [rowOf(running)] },
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
    { group: 'done', count: 1, data: [rowOf(finished)] },
  ],
  following: [],
  waiting: 1,
};

const detailOf = (issue: ReturnType<typeof issueOf>) => ({
  ...issue,
  parent: null,
  statuses: FIXED_STATUSES,
  activities: [],
  activitiesNextCursor: null,
  threads: [],
  threadsNextCursor: null,
  subscribers: [],
  attachments: [],
  subtasks: [],
  blockedBy: [],
  blocks: [],
  relatedTo: [],
  blockers: [],
  hiddenBlockerCount: 0,
});

const issues = [accept, running, held, finished];

const getSession = vi.fn(async () => ({ data: null }));

const api = vi.fn((call: ApiCall): unknown => {
  const { method, path } = call;
  if (method === 'GET' && path === 'authorization/permissions')
    return { data: { unrestricted: true, permissions: [] } };
  if (method === 'GET' && path === 'projects/me') return { data: viewer };
  if (method === 'GET' && path === 'taskGroups') return { data: taskGroups };
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
      'projects/mentionCandidates',
      'git/pullRequests',
    ].includes(path)
  )
    return { data: [] };
  const detail = issues.find(
    (issue) =>
      method === 'GET' &&
      (path === `projects/issues/${issue.id}` ||
        path === `projects/issues/${issue.identifier}`),
  );
  if (detail) return { data: detailOf(detail) };
  if (method === 'POST' && path.startsWith('followUps/issues/'))
    return { data: { ok: true } };
  return new Response(null, { status: 404 });
});

function LocationProbe(): ReactElement {
  const location = useLocation();
  return (
    <span data-testid='location'>{location.pathname + location.search}</span>
  );
}

async function renderAt(route: string) {
  return renderWithApp(
    <AuthenticationProvider>
      <LocationProbe />
      <Routes>
        <Route
          path='/my-issues'
          element={
            <IssueSplitView filters={{}} filtered={false} onClear={() => {}} />
          }
        />
        <Route
          path='/mine'
          element={<IssueWorkspace page='my-issues' fixedFilters={{}} />}
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

const where = () => screen.getByTestId('location').textContent;

describe('issue split view', () => {
  beforeEach(() => {
    api.mockClear();
    window.localStorage.clear();
  });

  it('reads the grouped list from taskGroups and shows the four groups with what each row waits for', async () => {
    await renderAt('/my-issues');

    expect(
      await screen.findByText(accept.title, { exact: false }),
    ).toBeInTheDocument();
    expect(calls('GET', 'taskGroups')[0]?.query).toMatchObject({
      mode: 'split',
      follow: 'all',
    });
    for (const label of [
      enUS.issues.groups.waitingForYou,
      enUS.issues.groups.inProgress,
      enUS.issues.groups.backlog,
      enUS.issues.groups.done,
    ])
      expect(screen.getByText(label)).toBeInTheDocument();
    // What the person must do, and what holds an issue back, come from the row, not from guessing at its status.
    expect(
      screen.getByText(enUS.issues.split.waits.accept),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        enUS.issues.split.blockedBy.replace('{{identifier}}', 'PM-99'),
      ),
    ).toBeInTheDocument();
  });

  it('opens My issues as the split view unless the person chose another', async () => {
    await renderAt('/mine');
    expect(
      await screen.findByText(running.title, { exact: false }),
    ).toBeInTheDocument();
    expect(calls('GET', 'taskGroups')).not.toHaveLength(0);
    expect(calls('GET', 'projects/issues/board')).toHaveLength(0);
  });

  it('folds a group and remembers it for the person', async () => {
    const user = userEvent.setup();
    const first = await renderAt('/my-issues');
    await screen.findByText(running.title, { exact: false });

    await user.click(
      screen.getByRole('button', {
        name: enUS.issues.split.fold.replace(
          '{{group}}',
          enUS.issues.groups.inProgress,
        ),
      }),
    );
    expect(screen.queryByText(running.title, { exact: false })).toBeNull();
    // The other groups keep their rows.
    expect(screen.getByText(held.title, { exact: false })).toBeInTheDocument();

    first.unmount();
    await renderAt('/my-issues');
    await screen.findByText(held.title, { exact: false });
    expect(screen.queryByText(running.title, { exact: false })).toBeNull();
    expect(
      screen.getByRole('button', {
        name: enUS.issues.split.unfold.replace(
          '{{group}}',
          enUS.issues.groups.inProgress,
        ),
      }),
    ).toBeInTheDocument();
  });

  it('keeps the chosen issue in the URL, opens the one named there and steps with the arrows', async () => {
    const user = userEvent.setup();
    await renderAt('/my-issues?issue=22');

    // The issue named in the URL is the one shown, with its place in the list.
    await waitFor(() =>
      expect(calls('GET', 'projects/issues/22').length).toBeGreaterThan(0),
    );
    expect(
      await screen.findByText(
        enUS.issues.split.position
          .replace('{{index}}', '2')
          .replace('{{total}}', '4'),
      ),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: enUS.issues.split.next }),
    );
    await waitFor(() => expect(where()).toContain('issue=23'));
    await user.click(
      screen.getByRole('button', { name: enUS.issues.split.previous }),
    );
    await waitFor(() => expect(where()).toContain('issue=22'));

    // Choosing a row writes its id to the URL; Done starts folded, so its rows are not there to choose.
    expect(screen.queryByText(finished.title, { exact: false })).toBeNull();
    await user.click(screen.getByText(held.title, { exact: false }));
    await waitFor(() => expect(where()).toContain('issue=23'));
  });

  it('moves with J and K, follows with S and opens with Enter, and says so at the foot of the list', async () => {
    const user = userEvent.setup();
    await renderAt('/my-issues?issue=21');
    await screen.findByText(
      enUS.issues.split.position
        .replace('{{index}}', '1')
        .replace('{{total}}', '4'),
    );

    await user.keyboard('j');
    await waitFor(() => expect(where()).toContain('issue=22'));
    await user.keyboard('k');
    await waitFor(() => expect(where()).toContain('issue=21'));

    await user.keyboard('s');
    await waitFor(() =>
      expect(calls('POST', 'followUps/issues/21/follow')).toHaveLength(1),
    );

    const hints = screen.getByRole('list', { name: enUS.issues.split.keys });
    expect(
      within(hints).getAllByRole('listitem').length,
    ).toBeGreaterThanOrEqual(4);

    await user.keyboard('{Enter}');
    await waitFor(() => expect(where()).toBe('/issues/PM-21'));
  });

  it('shows Follow once: the pane header has it, the embedded detail does not repeat it', async () => {
    await renderAt('/my-issues?issue=22');
    await screen.findByText(
      enUS.issues.split.position
        .replace('{{index}}', '2')
        .replace('{{total}}', '4'),
    );
    await waitFor(() =>
      expect(calls('GET', 'projects/issues/22').length).toBeGreaterThan(0),
    );
    expect(
      screen.getAllByRole('button', { name: enUS.issues.split.follow }),
    ).toHaveLength(1);
  });
});
