// The application's issue pages over the projects plugin's real client (its query provider, hooks and API client),
// with the plugin's API answered by the fixture below: the list and board of `/issues`, and an issue's own page.
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
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import packageMetadata from '../../package.json' with { type: 'json' };
import enUS from '../../client/locales/en-US.js';
import IssueDetailPage from '../../client/pages/issues/detail/index.js';
import IssuesPage from '../../client/pages/issues/index.js';

const AT = '2026-11-01T09:00:00.000Z';
const ADA = { id: 'u1', name: 'Ada Lovelace' };

const viewer = {
  userId: ADA.id,
  name: ADA.name,
  permissions: {
    scopes: Object.fromEntries(
      [
        'pm.projects/view',
        'pm.projects/create',
        'pm.projects/manage',
        'pm.projects/delete',
        'pm.issues/view',
        'pm.issues/create',
        'pm.issues/edit',
        'pm.issues/comment',
        'pm.issues/moderate-comments',
        'pm.issues/close',
        'pm.issues/change-owner',
        'pm.issues/delete',
        'pm.attachments/upload',
      ].map((key) => [key, 'all']),
    ),
    settings: {},
  },
  kinds: [
    { key: 'user', title: null, executor: true, mentionable: true },
    { key: 'system', title: null, executor: false, mentionable: false },
  ],
};

const issue = {
  id: '11',
  number: 1,
  identifier: 'PM-1',
  title: 'Sign in with an email link',
  description: 'People get a link that signs them in.',
  statusKey: 'backlog',
  needsYou: null,
  next: null,
  acceptance: null,
  priority: 'high',
  ownerUserId: ADA.id,
  executor: null,
  parentIssueId: null,
  stage: null,
  projectId: null,
  startDate: null,
  dueDate: null,
  revision: 3,
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

const comment = {
  id: 'c1',
  issueId: issue.id,
  authorType: 'user',
  authorId: ADA.id,
  authorName: ADA.name,
  kind: 'comment',
  content: 'The link should expire after 15 minutes.',
  note: false,
  parentId: null,
  rootId: 'c1',
  via: null,
  createdAt: AT,
  editedAt: null,
  deleted: false,
  reactions: [],
  resolvedAt: null,
  resolvedById: null,
  resolvedByName: null,
  attachments: [],
};

const detail = {
  ...issue,
  parent: null,
  statuses: FIXED_STATUSES,
  activities: [
    {
      id: 'a1',
      actorType: 'user',
      actorId: ADA.id,
      actorName: ADA.name,
      action: 'issue_created',
      details: { identifier: issue.identifier },
      via: null,
      createdAt: AT,
    },
  ],
  activitiesNextCursor: null,
  threads: [{ root: comment, replies: [] }],
  threadsNextCursor: null,
  subscribers: [{ userId: ADA.id, name: ADA.name, reason: 'creator' }],
  attachments: [],
  subtasks: [],
  blockedBy: [],
  blocks: [],
  relatedTo: [],
  blockers: [],
  hiddenBlockerCount: 0,
};

const getSession = vi.fn(async () => ({ data: null }));

const api = vi.fn((call: ApiCall): unknown => {
  const { method, path } = call;
  if (method === 'GET' && path === 'authorization/permissions')
    return { data: { unrestricted: true, permissions: [] } };
  if (method === 'GET' && path === 'projects/me') return { data: viewer };
  if (method === 'GET' && path === 'projects/members')
    return { data: [{ userId: ADA.id, name: ADA.name, email: null }] };
  if (
    method === 'GET' &&
    [
      'projects',
      'projects/labels',
      'projects/executors',
      'projects/apiKeyActors',
      'projects/mentionCandidates',
      // The issue page's pull request panel (`git-pages.test.tsx` covers it); none is linked here.
      'git/pullRequests',
    ].includes(path)
  )
    return { data: [] };
  if (method === 'GET' && path === 'projects/issues/statuses')
    return { data: FIXED_STATUSES };
  if (method === 'GET' && path === 'projects/issues')
    return { data: [issue], meta: {} };
  if (method === 'GET' && path === 'git/pullRequests/marks')
    return { data: {} };
  if (method === 'GET' && path === 'taskGroups')
    return {
      data: {
        generation: issue.createdAt,
        membership: ADA.id,
        mode: 'table',
        groups: [
          {
            group: 'doing',
            count: 1,
            data: [
              {
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
              },
            ],
          },
        ],
        following: [],
        waiting: 0,
      },
    };
  if (method === 'GET' && path === 'projects/issues/board')
    return {
      data: {
        columns: FIXED_STATUSES.map((status) => ({
          status,
          issues: status.key === issue.statusKey ? [issue] : [],
          nextCursor: null,
        })),
      },
    };
  if (method === 'GET' && path === `projects/issues/${issue.identifier}`)
    return { data: detail };
  if (method === 'PATCH' && path === `projects/issues/${issue.id}`)
    return {
      data: {
        issue: {
          ...issue,
          ...(call.json && typeof call.json === 'object' ? call.json : {}),
          revision: issue.revision + 1,
        },
      },
    };
  if (method === 'POST' && path === `projects/issues/${issue.id}/comments`)
    return {
      data: {
        comment: { ...comment, id: 'c2', rootId: 'c2', content: 'On it.' },
        triggered: [],
      },
    };
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
        <Route path='/issues' element={<IssuesPage />}>
          <Route path=':issueId' element={<IssueDetailPage />} />
        </Route>
      </Routes>
    </AuthenticationProvider>,
    {
      route,
      namespace: packageMetadata.name,
      namespaces: { [packageMetadata.name]: enUS },
      plugins: [projects({ routes: false, realtime: false })],
      fetch: answerApi(api),
      // Stand-ins for the authentication and authorization plugins, as `page-harness.test.tsx` registers them.
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

/** The calls the page made to `path` with `method`. */
function calls(method: string, path: string): ApiCall[] {
  return api.mock.calls
    .map(([call]) => call)
    .filter((call) => call.method === method && call.path === path);
}

describe('issues page', () => {
  beforeEach(() => {
    api.mockClear();
    window.localStorage.clear();
  });

  it('lists the issues grouped by what they wait for, linking each to its page', async () => {
    await renderAt('/issues?view=list');

    expect(
      await screen.findByRole('heading', { level: 1, name: enUS.issues.title }),
    ).toBeInTheDocument();
    const link = (await screen.findByText(issue.title)).closest('a');
    expect(link).toHaveAttribute('href', '/issues/PM-1');
    expect(calls('GET', 'taskGroups')[0]?.query).toMatchObject({
      mode: 'table',
      follow: 'scope',
    });
  });

  it('shows the board when asked, a column per status with the issue in its own', async () => {
    await renderAt('/issues?view=board');

    const region = await screen.findByRole('region', {
      name: enUS.issues.board.label,
    });
    expect(await within(region).findByText(issue.title)).toBeInTheDocument();
    expect(within(region).getAllByRole('region')).toHaveLength(
      FIXED_STATUSES.length,
    );
    expect(calls('GET', 'projects/issues/board')).not.toHaveLength(0);
  });

  it('switches the view in the URL', async () => {
    await renderAt('/issues?view=board');
    await screen.findByRole('region', { name: enUS.issues.board.label });

    await userEvent.click(
      screen.getByRole('button', { name: enUS.issues.view.list }),
    );

    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent(
        '/issues?view=list',
      ),
    );
    expect(await screen.findByText(issue.title)).toBeInTheDocument();
  });

  it('sends the search term to the list request', async () => {
    await renderAt('/issues?view=list');
    await screen.findByText(issue.title);

    await userEvent.type(
      screen.getByRole('textbox', { name: enUS.issues.search }),
      'email',
    );

    await waitFor(() =>
      expect(
        calls('GET', 'taskGroups').some((call) => call.query?.q === 'email'),
      ).toBe(true),
    );
    expect(screen.getByTestId('location')).toHaveTextContent('q=email');
  });

  it('offers New issue, which opens the dialog route under /issues', async () => {
    await renderAt('/issues?view=list');

    const button = await screen.findByRole('button', { name: /New issue/u });
    expect(button).toHaveAttribute(
      'href',
      expect.stringMatching(/^\/issues\/new/u),
    );
  });
});

describe('issue page', () => {
  beforeAll(() => {
    // The comment box is a ProseMirror editor, which measures the selection; jsdom lays nothing out.
    const noRects = () =>
      Object.assign([], { item: () => null }) as unknown as DOMRectList;
    const emptyRect = () => new DOMRect();
    Range.prototype.getClientRects ??= noRects;
    Range.prototype.getBoundingClientRect ??= emptyRect;
    Element.prototype.getClientRects ??= noRects;
    document.elementFromPoint ??= () => null;
  });

  beforeEach(() => {
    api.mockClear();
  });

  it('shows the issue, its properties and its activity', async () => {
    await renderAt('/issues/PM-1');

    expect(
      await screen.findByRole('heading', { level: 1, name: issue.title }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('group', { name: enUS.issueDetail.properties }),
    ).toBeInTheDocument();
    expect(screen.getByText(comment.content)).toBeInTheDocument();
    expect(
      screen.getByText(enUS.issueDetail.activity.actions.created),
    ).toBeInTheDocument();
    // The description has its own tab.
    await userEvent.click(
      screen.getByRole('tab', { name: enUS.issueDetail.tabs.description }),
    );
    expect(await screen.findByText(issue.description)).toBeInTheDocument();
  });

  it('changes the status with the revision it read', async () => {
    await renderAt('/issues/PM-1');
    await screen.findByRole('heading', { level: 1, name: issue.title });

    // The list under the page has a Status filter of its own: this is the one among the issue's properties.
    await userEvent.click(
      within(
        screen.getByRole('group', { name: enUS.issueDetail.properties }),
      ).getByLabelText(enUS.issueDetail.status),
    );
    await userEvent.click(
      await screen.findByRole('option', { name: 'Blocked' }),
    );

    await waitFor(() =>
      expect(calls('PATCH', `projects/issues/${issue.id}`)[0]?.json).toEqual({
        statusKey: 'blocked',
        revision: issue.revision,
      }),
    );
  });

  it('posts a comment', async () => {
    await renderAt('/issues/PM-1');
    await screen.findByRole('heading', { level: 1, name: issue.title });

    await userEvent.click(
      screen.getByRole('textbox', { name: enUS.issueDetail.composer.label }),
    );
    // Pasted rather than typed: jsdom has no layout, so the editor drops keystrokes it cannot place.
    await userEvent.paste('On it.');
    await userEvent.click(
      screen.getByRole('button', { name: enUS.issueDetail.composer.send }),
    );

    await waitFor(() =>
      expect(
        calls('POST', `projects/issues/${issue.id}/comments`)[0]?.json,
      ).toEqual({ content: 'On it.' }),
    );
  });

  // The query retries a failed read before it gives up, so the answer takes a few seconds.
  it('explains an issue it cannot find', { timeout: 30_000 }, async () => {
    await renderAt('/issues/PM-404');

    expect(
      await screen.findByRole('alert', {}, { timeout: 20_000 }),
    ).toHaveTextContent(enUS.issueDetail.notFound);
  });
});
