// The issue page as the demo draws it: tabs, the Follow button and the property chips at the top, the "Needs you" card
// with what a person can do about the pull request, the delivery report from `issue.acceptance`, runs of system
// records folded into one line, and a header that stays while the page scrolls.
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
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import packageMetadata from '../../package.json' with { type: 'json' };
import enUS from '../../client/locales/en-US.js';
import IssueDetailPage from '../../client/pages/issues/detail/index.js';

const AT = '2026-11-01T09:00:00.000Z';
const ADA = { id: 'u1', name: 'Ada Lovelace' };

const viewer = {
  userId: ADA.id,
  name: ADA.name,
  permissions: {
    scopes: Object.fromEntries(
      [
        'pm.projects/view',
        'pm.issues/view',
        'pm.issues/edit',
        'pm.issues/close',
        'pm.comments/create',
      ].map((key) => [key, 'all']),
    ),
    settings: {},
  },
  kinds: [{ key: 'user', title: null, executor: true, mentionable: true }],
};

const comment = (
  id: string,
  authorType: string,
  authorName: string,
  content: string,
) => ({
  id,
  issueId: '21',
  authorType,
  authorId: authorType === 'user' ? ADA.id : 'agent-1',
  authorName,
  kind: 'comment',
  content,
  note: false,
  parentId: null,
  rootId: id,
  via: null,
  createdAt: '2026-11-01T09:10:00.000Z',
  editedAt: null,
  deleted: false,
  reactions: [],
  resolvedAt: null,
  resolvedById: null,
  resolvedByName: null,
  attachments: [],
});

const activity = (id: string, action: string, at: string) => ({
  id,
  actorType: 'system',
  actorId: null,
  actorName: null,
  action,
  details: {},
  via: null,
  createdAt: at,
});

const ACCEPTANCE =
  '## Delivery report\n\n### Result\n\nThe owner is told when a status changes.\n\n### Evidence\n\nChecks passed.';

const issue = {
  id: '21',
  number: 21,
  identifier: 'PM-21',
  title: 'Notify the owner on a status change',
  description: 'Tell the owner when the status moves.',
  statusKey: 'in_review',
  needsYou: 'Reply "accept" or name another status.',
  next: null,
  acceptance: ACCEPTANCE,
  priority: 'high',
  ownerUserId: ADA.id,
  executor: null,
  parentIssueId: null,
  stage: null,
  projectId: null,
  startDate: null,
  dueDate: null,
  revision: 4,
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
  parent: null,
  statuses: FIXED_STATUSES,
  activities: [
    activity('a1', 'created', '2026-11-01T09:00:00.000Z'),
    activity('a2', 'status_changed', '2026-11-01T09:01:00.000Z'),
    activity('a3', 'labels_changed', '2026-11-01T09:02:00.000Z'),
  ],
  activitiesNextCursor: null,
  threads: [
    {
      root: comment('c1', 'user', ADA.name, 'Please take care of this.'),
      replies: [],
    },
    {
      root: comment('c2', 'agent', 'Lead Agent', 'Here is what I changed.'),
      replies: [],
    },
  ],
  threadsNextCursor: null,
  subscribers: [] as { userId: string; name: string; reason: string }[],
  attachments: [],
  subtasks: [],
  blockedBy: [],
  blocks: [],
  relatedTo: [],
  blockers: [],
  hiddenBlockerCount: 0,
};

const pull = {
  id: 'pr-9',
  repositoryId: 'r1',
  repo: 'acme/app',
  number: 9,
  url: 'https://github.test/acme/app/pull/9',
  title: 'Notify the owner',
  state: 'open',
  draft: false,
  headRef: 'feat/notify',
  baseRef: 'main',
  mergeability: 'clean',
  ciState: 'success',
  checks: [],
  issueId: '21',
  autoCompleteDisabled: false,
  mergedAt: null,
  mergeForcedReason: null,
  mergeBlocker: null,
  mergeInStudio: true,
  updatedAt: AT,
};

const panels = {
  progress: {
    state: 'inReview',
    agent: null,
    step: null,
    since: null,
    runner: null,
    pullRequest: { number: 9, url: pull.url },
    needsYou: issue.needsYou,
    next: null,
    handOver: false,
    failedRunId: null,
  },
  ownerHandoff: { handoff: null, canDecide: false },
  commentRunLimit: null,
};

const getSession = vi.fn(async () => ({ data: null }));

const api = vi.fn((call: ApiCall): unknown => {
  const { method, path } = call;
  if (method === 'GET' && path === 'authorization/permissions')
    return { data: { unrestricted: true, permissions: [] } };
  if (method === 'GET' && path === 'projects/me') return { data: viewer };
  if (method === 'GET' && path === 'projects/issues/statuses')
    return { data: FIXED_STATUSES };
  if (
    method === 'GET' &&
    (path === 'projects/issues/21' || path === 'projects/issues/PM-21')
  )
    return { data: issue };
  if (method === 'GET' && path === 'issuePanels/21') return { data: panels };
  if (method === 'GET' && path === 'git/pullRequests') return { data: [pull] };
  if (method === 'GET' && path === 'projects/issues/21/screenshots')
    return {
      data: [
        {
          id: 's1',
          filename: 'after.png',
          ext: 'png',
          mimeType: 'image/png',
          size: 10,
          contentUrl: '/files/after.png',
        },
      ],
    };
  if (method === 'GET' && path === 'issueRuns')
    return {
      data: [
        {
          id: 'r1',
          agent: 'Lead Agent',
          status: 'completed',
          trigger: 'mention',
          attempt: 1,
          createdAt: AT,
          finishedAt: AT,
          summary: 'Done',
          failureReason: null,
          failure: null,
        },
      ],
    };
  if (
    method === 'GET' &&
    [
      'projects',
      'projects/labels',
      'projects/executors',
      'projects/members',
      'projects/apiKeyActors',
      'projects/mentionCandidates',
      'git/repositories',
      'knowledge/offers',
    ].includes(path)
  )
    return { data: [] };
  if (method === 'POST' && path === 'projects/issues/21/subscribe')
    return { data: { ok: true } };
  if (method === 'POST' && path.startsWith('git/pullRequests/pr-9/'))
    return { data: { ...pull, state: 'merged' } };
  if (method === 'POST' && path.startsWith('followUps/'))
    return { data: { ok: true } };
  return new Response(null, { status: 404 });
});

async function renderPage() {
  return renderWithApp(
    <AuthenticationProvider>
      <Routes>
        <Route path='/issues/:issueId' element={<IssueDetailPage />} />
      </Routes>
    </AuthenticationProvider>,
    {
      route: '/issues/PM-21',
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

const tab = (name: RegExp) => screen.findByRole('tab', { name });

describe('issue page as the demo draws it', () => {
  beforeEach(() => {
    api.mockClear();
  });

  it('has four tabs, with Activity open and the others a click away', async () => {
    const user = userEvent.setup();
    await renderPage();

    expect(await tab(/^Activity/)).toHaveAttribute('aria-selected', 'true');
    expect(await tab(/^Description/)).toBeInTheDocument();
    expect(await tab(/^Code & previews/)).toBeInTheDocument();
    expect(await tab(/^Runs/)).toBeInTheDocument();
    // The conversation is on the first tab; the description is not until its tab is opened.
    expect(screen.getByText('Here is what I changed.')).toBeInTheDocument();
    expect(screen.queryByText(issue.description)).toBeNull();

    await user.click(await tab(/^Description/));
    expect(await screen.findByText(issue.description)).toBeInTheDocument();

    await user.click(await tab(/^Code & previews/));
    expect(
      await screen.findByText('Notify the owner', { selector: 'p, span, a' }),
    ).toBeInTheDocument();

    await user.click(await tab(/^Runs/));
    await waitFor(() => expect(calls('GET', 'issueRuns')).not.toHaveLength(0));
  });

  it('follows the issue from the top of the page', async () => {
    const user = userEvent.setup();
    await renderPage();
    await user.click(
      await screen.findByRole('button', { name: enUS.issueDetail.follow }),
    );
    await waitFor(() =>
      expect(calls('POST', 'projects/issues/21/subscribe')).toHaveLength(1),
    );
  });

  it('shows priority, owner and executor as chips and the rest under More properties', async () => {
    const user = userEvent.setup();
    await renderPage();
    const chips = await screen.findByRole('group', {
      name: enUS.issueDetail.properties,
    });
    expect(within(chips).getByText(enUS.issueDetail.priority)).toBeTruthy();
    expect(within(chips).getByText(enUS.issueDetail.owner)).toBeTruthy();
    expect(within(chips).getByText(enUS.issueDetail.executor)).toBeTruthy();
    await user.click(
      within(chips).getByRole('button', {
        name: enUS.issueDetail.moreProperties,
      }),
    );
    expect(await screen.findByLabelText(enUS.issueDetail.project)).toBeTruthy();
  });

  it('puts the pull request in the "Needs you" card: merge, mark as merged, view changes and the Lead Agent explanation', async () => {
    const user = userEvent.setup();
    await renderPage();
    const card = await screen.findByTestId('issue-progress');
    await within(card).findByText(issue.needsYou);
    expect(
      await within(card).findByText(
        enUS.issueWork.needsYouActions.checksPassed,
      ),
    ).toBeInTheDocument();
    expect(
      within(card)
        .getByRole('link', { name: enUS.issueWork.needsYouActions.viewChanges })
        .getAttribute('href'),
    ).toBe(pull.url);

    await user.click(
      within(card).getByRole('button', {
        name: enUS.issueWork.needsYouActions.markMerged,
      }),
    );
    await waitFor(() =>
      expect(calls('POST', 'git/pullRequests/pr-9/markMerged')).toHaveLength(1),
    );
    await user.click(
      within(card).getByRole('button', {
        name: enUS.issueWork.needsYouActions.merge,
      }),
    );
    await waitFor(() =>
      expect(calls('POST', 'git/pullRequests/pr-9/merge')).toHaveLength(1),
    );

    // The link goes to the agent's last comment on the Activity tab.
    const scrolled = vi.fn();
    const target = screen
      .getByText('Here is what I changed.')
      .closest('[data-comment-id]') as HTMLElement;
    target.scrollIntoView = scrolled;
    await user.click(
      within(card).getByRole('button', {
        name: enUS.issueWork.needsYouActions.leadExplanation,
      }),
    );
    expect(scrolled).toHaveBeenCalled();
  });

  it('draws the delivery report from the acceptance text, with the screenshots the agents attached', async () => {
    await renderPage();
    const report = await screen.findByRole('region', {
      name: enUS.issueDetail.deliveryReport,
    });
    expect(
      await within(report).findByText(
        'The owner is told when a status changes.',
      ),
    ).toBeInTheDocument();
    const shot = await within(report).findByRole('img', {
      name: 'after.png',
    });
    expect(shot.getAttribute('src')).toContain('/files/after.png');
  });

  it('folds runs of system records into one line that opens', async () => {
    const user = userEvent.setup();
    await renderPage();
    const fold = await screen.findByRole('button', {
      name: enUS.issueDetail.activity.systemRecords.replace('{{count}}', '3'),
    });
    expect(fold).toHaveAttribute('aria-expanded', 'false');
    await user.click(fold);
    expect(fold).toHaveAttribute('aria-expanded', 'true');
    expect(
      await screen.findByText(enUS.issueDetail.activity.actions.created),
    ).toBeInTheDocument();
  });

  it('keeps a header while the page scrolls, with Merge and a way back to the top', async () => {
    const user = userEvent.setup();
    await renderPage();
    const root = await screen.findByTestId('issue-detail-root');
    expect(screen.queryByTestId('issue-sticky-header')).toBeNull();

    // The page's own container stands in for the shell's scroll area.
    const scroller = root.parentElement as HTMLElement;
    const scrollTo = vi.fn();
    scroller.scrollTo = scrollTo;
    Object.defineProperty(scroller, 'scrollTop', {
      value: 600,
      configurable: true,
    });
    fireEvent.scroll(scroller);

    const sticky = await screen.findByTestId('issue-sticky-header');
    expect(within(sticky).getByText(issue.title)).toBeInTheDocument();
    expect(
      within(sticky).getByRole('button', {
        name: enUS.issueWork.needsYouActions.merge,
      }),
    ).toBeInTheDocument();
    await user.click(
      within(sticky).getByRole('button', { name: enUS.issueDetail.backToTop }),
    );
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }));
  });
});
