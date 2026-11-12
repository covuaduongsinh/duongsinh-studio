// Today (the home page): what needs the person, what the agents are doing, what just happened (V1.1).
import {
  answerApi,
  renderWithApp,
  type ApiCall,
} from '@nocobase/app-testing/client';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import packageMetadata from '../../package.json' with { type: 'json' };
import enUS from '../../client/locales/en-US.js';
import HomePage from '../../client/pages/home/index.js';

const entry = (id: string, issueId: string, type: string, title: string) => ({
  item: {
    id,
    deliveryId: `d-${id}`,
    notificationId: `n-${id}`,
    title,
    body: `Body of ${title}`,
    target: { type: 'route', path: `/issues/${issueId}` },
    createdAt: '2026-11-08T08:00:00.000Z',
  },
  notice: {
    notificationId: `n-${id}`,
    source: 'studio',
    kind: 'decision',
    type,
    subject: { type: 'issue', id: issueId, label: `DS-${issueId}` },
    decisionKey: `${issueId}:${type}`,
    data: null,
    count: 1,
    resolvedAt: null,
    outcome: null,
  },
});

const row = (
  agentId: string,
  state: string,
  id: string,
  extra: Record<string, unknown> = {},
) => ({
  agentId,
  state,
  run: {
    since: new Date(Date.now() - 600_000).toISOString(),
    runnerName: 'vps',
    lastActivity: { text: 'Running the tests' },
  },
  queue: null,
  waiting: null,
  idle: null,
  issue: { id, identifier: `DS-${id}`, title: `Issue ${id}` },
  mine: true,
  ...extra,
});

interface Fixture {
  waiting: ReturnType<typeof entry>[];
  chat: { unread: number; needsYou: number };
  release: { count: number; reasons: { reason: string; count: number }[] };
  board: {
    rows: unknown[];
    agents: Record<string, { name: string }>;
    summary: Record<string, number>;
  };
  attention: Record<string, unknown>;
  done: unknown[];
}

let data: Fixture;
let refuse: Set<string>;
let calls: ApiCall[] = [];

const answer = (call: ApiCall): unknown => {
  calls.push(call);
  const path = String(call.path);
  if (refuse.has(path))
    return new Response(
      JSON.stringify({ error: { status: 'PERMISSION_DENIED' } }),
      {
        status: 403,
        headers: { 'content-type': 'application/json' },
      },
    );
  if (path === 'inbox/waiting') return { data: data.waiting, meta: {} };
  if (path === 'agents/conversationAttention') return { data: data.chat };
  if (path === 'attention') return { data: data.release };
  if (path === 'agentBoard') return { data: data.board };
  if (path === 'reports/attention') return { data: data.attention };
  if (path === 'taskGroups')
    return {
      data: {
        membership: 'u1',
        following: [],
        waiting: 0,
        groups: [{ group: 'done', count: data.done.length, data: data.done }],
      },
    };
  return new Response(null, { status: 404 });
};

const render = () =>
  renderWithApp(<HomePage />, {
    namespace: packageMetadata.name,
    namespaces: { [packageMetadata.name]: enUS },
    fetch: answerApi(answer),
  });

const none = { total: 0, items: [] };

beforeEach(() => {
  calls = [];
  refuse = new Set();
  data = {
    waiting: [
      entry('a', '11', 'accept', 'Review DS-11'),
      entry('b', '12', 'answer', 'Question on DS-12'),
    ],
    chat: { unread: 4, needsYou: 1 },
    release: {
      count: 2,
      reasons: [
        { reason: 'pendingRelease', count: 2 },
        { reason: 'something_else', count: 5 },
      ],
    },
    board: {
      rows: [
        row('a1', 'working', '31'),
        row('a2', 'queued', '32', { run: null }),
        row('a3', 'idle', '33'),
      ],
      agents: {
        a1: { name: 'Coder' },
        a2: { name: 'Reviewer' },
        a3: { name: 'Idle one' },
      },
      summary: { working: 1, queued: 1, waiting: 3, idle: 1 },
    },
    attention: {
      blocked: {
        total: 1,
        items: [
          {
            id: '41',
            identifier: 'DS-41',
            title: 'Stuck on a key',
            since: '2026-11-07T00:00:00Z',
          },
        ],
      },
      overdue: none,
      reviewWaits: none,
      failedRuns: {
        total: 1,
        items: [
          {
            id: 'r1',
            agentName: 'Coder',
            finishedAt: '2026-11-08T07:00:00Z',
            issue: { id: '42', identifier: 'DS-42', title: 'Failed thing' },
          },
        ],
      },
    },
    done: [
      {
        issue: {
          id: '51',
          identifier: 'DS-51',
          title: 'Finished today',
          statusKey: 'done',
          updatedAt: new Date().toISOString(),
        },
        dependencyWait: false,
        blockers: [],
        waits: [],
        followed: false,
      },
      {
        issue: {
          id: '52',
          identifier: 'DS-52',
          title: 'Finished last week',
          statusKey: 'done',
          updatedAt: '2020-01-01T00:00:00Z',
        },
        dependencyWait: false,
        blockers: [],
        waits: [],
        followed: false,
      },
    ],
  };
});

describe('Today', () => {
  it('adds up what needs the person: decisions, chat and releases', async () => {
    await render();
    const card = await screen.findByRole('region', { name: 'Needs me' });
    // 2 decisions + 1 conversation + 2 releases (the unrelated reason is not counted).
    expect(await within(card).findByText('5')).toBeInTheDocument();
    expect(
      within(card).getByRole('link', { name: /Review DS-11/u }),
    ).toHaveAttribute('href', '/issues/11');
    expect(
      within(card).getByRole('link', { name: /1 conversations are waiting/u }),
    ).toHaveAttribute('href', '/sessions');
    expect(
      within(card).getByRole('link', { name: /2 releases are waiting/u }),
    ).toHaveAttribute('href', '/releases?tab=pending');
  });

  it('shows five decisions and sends the rest to the inbox to-do view', async () => {
    data.waiting = Array.from({ length: 8 }, (_, i) =>
      entry(`e${i}`, String(20 + i), 'accept', `Decision ${i}`),
    );
    await render();
    const card = await screen.findByRole('region', { name: 'Needs me' });
    expect(
      await within(card).findAllByRole('link', { name: /Decision \d/u }),
    ).toHaveLength(5);
    expect(
      within(card).getByRole('link', { name: 'See all 8 that need you' }),
    ).toHaveAttribute('href', '/inbox?view=todo');
  });

  it('says plainly when nothing needs them', async () => {
    data.waiting = [];
    data.chat = { unread: 0, needsYou: 0 };
    data.release = { count: 0, reasons: [] };
    await render();
    expect(await screen.findByText('Nothing needs you.')).toBeInTheDocument();
  });

  it('lists the agents that work or queue, not the idle ones, with what they just did', async () => {
    await render();
    const card = await screen.findByRole('region', { name: 'Agents at work' });
    expect(
      await within(card).findByText(
        /Working 1 · Queued for a runner 1 · Waiting for people 3/u,
      ),
    ).toBeInTheDocument();
    const working = within(card).getByRole('link', { name: /DS-31 Issue 31/u });
    expect(working).toHaveAttribute('href', '/issues/31');
    expect(working).toHaveTextContent('Coder');
    expect(working).toHaveTextContent('Running the tests');
    expect(
      within(card).getByRole('link', { name: /DS-32/u }),
    ).toBeInTheDocument();
    expect(within(card).queryByRole('link', { name: /DS-33/u })).toBeNull();
  });

  it('lists failed runs and blocked issues, and what finished in the last day only', async () => {
    await render();
    const card = await screen.findByRole('region', {
      name: 'Just done, just failed',
    });
    expect(
      await within(card).findByRole('link', { name: /DS-42 Failed thing/u }),
    ).toHaveAttribute('href', '/issues/42');
    expect(
      within(card).getByRole('link', { name: /DS-41 Stuck on a key/u }),
    ).toBeInTheDocument();
    expect(
      within(card).getByRole('link', { name: /DS-51/u }),
    ).toBeInTheDocument();
    expect(within(card).queryByRole('link', { name: /DS-52/u })).toBeNull();
    expect(
      within(card).getByRole('link', { name: 'Full report' }),
    ).toHaveAttribute('href', '/dashboard');
  });

  it('keeps showing the rest when one source is refused', async () => {
    refuse = new Set(['agentBoard', 'reports/attention']);
    await render();
    expect(
      await screen.findByRole('region', { name: 'Needs me' }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(calls.some((c) => c.path === 'agentBoard')).toBe(true),
    );
    expect(screen.queryByRole('region', { name: 'Agents at work' })).toBeNull();
    // The finished list still comes from another source.
    expect(
      await screen.findByRole('link', { name: /DS-51/u }),
    ).toBeInTheDocument();
  });

  it('offers a retry when nothing can be read', async () => {
    refuse = new Set([
      'inbox/waiting',
      'agents/conversationAttention',
      'attention',
      'agentBoard',
      'reports/attention',
      'taskGroups',
    ]);
    const user = userEvent.setup();
    await render();
    expect(
      await screen.findByText('This page could not be loaded.'),
    ).toBeInTheDocument();
    refuse = new Set();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(
      await screen.findByRole('region', { name: 'Needs me' }),
    ).toBeInTheDocument();
  });

  it('keeps the pages that left the sidebar one tap away', async () => {
    await render();
    const nav = await screen.findByRole('navigation', { name: 'Go to' });
    expect(within(nav).getByRole('link', { name: 'Inbox' })).toHaveAttribute(
      'href',
      '/inbox',
    );
    expect(
      within(nav).getByRole('link', { name: 'My issues' }),
    ).toHaveAttribute('href', '/my-issues');
    expect(
      within(nav).getByRole('link', { name: 'Following' }),
    ).toHaveAttribute('href', '/follow-ups');
  });

  it('reads everything in one go and asks nothing else', async () => {
    await render();
    await screen.findByRole('region', { name: 'Needs me' });
    expect(new Set(calls.map((c) => c.path))).toEqual(
      new Set([
        'inbox/waiting',
        'agents/conversationAttention',
        'attention',
        'agentBoard',
        'reports/attention',
        'taskGroups',
      ]),
    );
  });
});

describe('Today on a phone', () => {
  beforeEach(() => {
    vi.stubGlobal('innerWidth', 390);
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('max-width'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('stacks the three blocks in one column, each reachable, with no wide table', async () => {
    const { container } = await render();
    const headings = (await screen.findAllByRole('region')).map((region) =>
      region.getAttribute('aria-labelledby'),
    );
    expect(headings).toEqual(['today-need-me', 'today-agents', 'today-recent']);
    expect(container.querySelector('table')).toBeNull();
    // One column: the three blocks sit in a flex column, not a grid.
    const blocks = (await screen.findAllByRole('region')).map(
      (region) => region.parentElement?.parentElement,
    );
    expect(new Set(blocks).size).toBe(1);
    expect(blocks[0]?.className).toContain('flex-col');
    expect(blocks[0]?.className).not.toContain('grid');
  });
});
