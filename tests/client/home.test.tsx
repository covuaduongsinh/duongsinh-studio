// The home page: what waits on the signed-in person and what is under way, read from `server/routes/inbox.ts`.
import {
  answerApi,
  renderWithApp,
  type ApiCall,
} from '@nocobase/app-testing/client';
import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import packageMetadata from '../../package.json' with { type: 'json' };
import enUS from '../../client/locales/en-US.js';
import HomePage from '../../client/pages/home/index.js';

vi.mock('@nocobase/app-plugin-authentication/client', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  useAuthentication: () => ({
    session: { user: { id: 'u1', name: 'Dương Sinh' } },
  }),
}));

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

let summary: { mine: { open: number; waiting: number }; waiting: number };
let waiting: ReturnType<typeof entry>[];
let failWaiting = false;
let calls: ApiCall[] = [];

function render() {
  return renderWithApp(<HomePage />, {
    namespace: packageMetadata.name,
    namespaces: { [packageMetadata.name]: enUS },
    fetch: answerApi((call: ApiCall) => {
      calls.push(call);
      const path = String(call.path);
      if (path.endsWith('taskGroups/summary')) return { data: summary };
      if (path.endsWith('inbox/waiting')) {
        if (failWaiting) throw new Error('boom');
        return { data: waiting, meta: {} };
      }
      return { data: [] };
    }),
  });
}

beforeEach(() => {
  calls = [];
  failWaiting = false;
  summary = { mine: { open: 7, waiting: 2 }, waiting: 2 };
  waiting = [
    entry('a', '11', 'accept', 'Review DS-11'),
    entry('b', '12', 'answer', 'Question on DS-12'),
  ];
});

describe('home page', () => {
  it('greets the person by name and offers the three places they go next', async () => {
    render();
    expect(
      await screen.findByRole('heading', { level: 1, name: /Dương Sinh/u }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'My issues' })).toHaveAttribute(
      'href',
      '/my-issues',
    );
    expect(screen.getByRole('link', { name: 'Inbox' })).toHaveAttribute(
      'href',
      '/inbox',
    );
    expect(screen.getByRole('link', { name: 'Projects' })).toHaveAttribute(
      'href',
      '/projects',
    );
  });

  it('lists what waits on them, each one straight to its issue', async () => {
    render();
    const card = await screen.findByRole('region', {
      name: 'Waiting for my decision',
    });
    expect(await within(card).findByText('2')).toBeInTheDocument();
    const first = await within(card).findByRole('link', {
      name: /Review DS-11/u,
    });
    expect(first).toHaveAttribute('href', '/issues/11');
    expect(
      within(card).getByRole('link', { name: /Question on DS-12/u }),
    ).toHaveAttribute('href', '/issues/12');
  });

  it('shows five and says how many more are in the inbox', async () => {
    waiting = Array.from({ length: 8 }, (_, i) =>
      entry(`e${i}`, String(20 + i), 'accept', `Decision ${i}`),
    );
    summary = { mine: { open: 9, waiting: 8 }, waiting: 8 };
    render();
    const card = await screen.findByRole('region', {
      name: 'Waiting for my decision',
    });
    expect(
      await within(card).findAllByRole('link', { name: /Decision \d/u }),
    ).toHaveLength(5);
    expect(
      within(card).getByRole('link', { name: 'See all 8 in the inbox' }),
    ).toHaveAttribute('href', '/inbox');
  });

  it('counts what is under way as the open issues that do not wait on them', async () => {
    render();
    const card = await screen.findByRole('region', { name: 'Under way' });
    expect(await within(card).findByText('5')).toBeInTheDocument();
    expect(
      within(card).getByRole('link', { name: 'Open my issues' }),
    ).toHaveAttribute('href', '/my-issues');
  });

  it('says plainly when nothing waits on them', async () => {
    summary = { mine: { open: 3, waiting: 0 }, waiting: 0 };
    waiting = [];
    render();
    expect(
      await screen.findByText('Nothing is waiting for you.'),
    ).toBeInTheDocument();
  });

  it('says so, and still shows the rest, when the waiting list cannot be read', async () => {
    failWaiting = true;
    render();
    expect(
      await screen.findByText(/could not be loaded/iu),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('region', { name: 'Under way' }),
    ).toBeInTheDocument();
  });
});
