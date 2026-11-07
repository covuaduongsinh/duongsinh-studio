// The dashboard, with `server/routes/reports.ts` answered by the fixture below.
import {
  answerApi,
  renderWithApp,
  type ApiCall,
} from '@nocobase/app-testing/client';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import packageMetadata from '../../package.json' with { type: 'json' };
import enUS from '../../client/locales/en-US.js';
import DashboardPage from '../../client/pages/dashboard/index.js';

// Budgets have their own tests (`budgets.test.tsx`); this page's viewer may not see them.
vi.mock('@nocobase/app-plugin-authorization/client', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  useCan: () => ({ can: false, loading: false }),
}));

const delivery = {
  days: 30,
  from: '2026-11-01',
  to: '2026-11-07',
  subjects: true,
  currency: 'USD',
  current: {
    completed: 73,
    cycleTimeP50Ms: 4 * 86_400_000,
    agentShare: 0.5,
    costPerIssue: null,
    tokensPerIssue: 12_000,
  },
  previous: {
    completed: 70,
    cycleTimeP50Ms: 8 * 86_400_000,
    agentShare: 0.5,
    costPerIssue: null,
    tokensPerIssue: null,
  },
  buckets: [
    {
      from: '2026-11-01',
      to: '2026-11-03',
      completed: 3,
      cycleTimeP50Ms: 1000,
      agentShare: 1,
      costPerIssue: null,
      tokensPerIssue: 100,
    },
    {
      from: '2026-11-04',
      to: '2026-11-07',
      completed: 5,
      cycleTimeP50Ms: 2000,
      agentShare: 0,
      costPerIssue: null,
      tokensPerIssue: 200,
    },
  ],
};

const agents = {
  days: 30,
  from: '2026-11-01',
  to: '2026-11-07',
  subjects: true,
  current: {
    runs: 20,
    successRate: 0.9,
    reworkRate: 0.1,
    runsPerIssue: 3.4,
    interventionRate: 0.2,
    queueWaitP50Ms: 60_000,
  },
  previous: {
    runs: 10,
    successRate: 0.8,
    reworkRate: 0.1,
    runsPerIssue: 3,
    interventionRate: 0.1,
    queueWaitP50Ms: 60_000,
  },
  daily: [
    {
      day: '2026-11-06',
      runsCompleted: 8,
      runsFailed: 2,
      runsCancelled: 0,
      runsOpen: 0,
    },
    {
      day: '2026-11-07',
      runsCompleted: 0,
      runsFailed: 0,
      runsCancelled: 0,
      runsOpen: 0,
    },
  ],
};

const attention = {
  subjects: true,
  blocked: {
    total: 7,
    items: [
      {
        id: 'i1',
        identifier: 'DS-1',
        title: 'Việc bị vướng',
        since: '2026-11-01T00:00:00.000Z',
      },
    ],
  },
  overdue: { total: 0, items: [] },
  reviewWaits: {
    total: 1,
    items: [
      {
        id: 'p1',
        repo: 'dsc/app',
        number: 12,
        title: 'PR chờ review',
        url: 'https://github.example.com/dsc/app/pull/12',
        since: '2026-11-01T00:00:00.000Z',
        issue: { id: 'i2', identifier: 'DS-2' },
      },
    ],
  },
  failedRuns: {
    total: 1,
    items: [
      {
        id: 'r1',
        agentId: 'a1',
        agentName: 'Claude',
        failureReason: 'toolProcess',
        finishedAt: '2026-11-07T00:00:00.000Z',
        issue: { id: 'i3', identifier: 'DS-3', title: 'Việc chạy lỗi' },
      },
    ],
  },
};

const projects = {
  days: 30,
  from: '2026-11-01',
  to: '2026-11-07',
  subjects: true,
  projects: [
    {
      id: 'p1',
      name: 'Dương Sinh App',
      total: 10,
      done: 4,
      completed: 2,
      cycleTimeP50Ms: 3_600_000,
      blocked: 1,
    },
  ],
};

let calls: ApiCall[] = [];
let failing = false;

function render() {
  return renderWithApp(<DashboardPage />, {
    namespace: packageMetadata.name,
    namespaces: { [packageMetadata.name]: enUS },
    fetch: answerApi((call: ApiCall) => {
      calls.push(call);
      const path = String(call.path);
      if (failing && path.includes('reports/agents'))
        throw new Error('The figures are unavailable.');
      if (path.includes('reports/delivery')) return { data: delivery };
      if (path.includes('reports/agents')) return { data: agents };
      if (path.includes('reports/attention')) return { data: attention };
      if (path.includes('reports/projects')) return { data: projects };
      return { data: null };
    }),
  });
}

describe('dashboard', () => {
  beforeEach(() => {
    calls = [];
    failing = false;
  });

  it('shows the four figures against the period before', async () => {
    render();
    const completed = await screen.findByRole('group', {
      name: 'Issues completed',
    });
    expect(within(completed).getByText('73')).toBeTruthy();
    expect(within(completed).getByText('+4%')).toBeTruthy();
    expect(within(completed).getByText('vs 70 before')).toBeTruthy();

    const cycle = screen.getByRole('group', { name: 'Median cycle time' });
    expect(within(cycle).getByText('4 days')).toBeTruthy();
    // Faster is good: a drop is not a warning.
    expect(within(cycle).getByText('−50%').className).toContain('text-primary');

    const share = screen.getByRole('group', { name: 'Completed by agents' });
    expect(within(share).getByText('No change')).toBeTruthy();

    const tokens = screen.getByRole('group', { name: 'Tokens per issue' });
    expect(within(tokens).getByText('12K')).toBeTruthy();
  });

  it('asks again for the period chosen', async () => {
    render();
    await screen.findByRole('group', { name: 'Issues completed' });
    expect(screen.getByRole('button', { name: '30 days' })).toHaveProperty(
      'ariaPressed',
      'true',
    );
    await userEvent.click(screen.getByRole('button', { name: '7 days' }));
    await waitFor(() =>
      expect(
        calls.some(
          (call) =>
            String(call.path).includes('reports/delivery') &&
            /days\D+7/u.test(JSON.stringify(call)),
        ),
      ).toBe(true),
    );
  });

  it('stacks the runs by outcome, with a legend and a table of the same numbers', async () => {
    render();
    const section = await screen.findByRole('region', {
      name: 'Runs by outcome',
    });
    const legend = within(section).getByRole('list', { name: 'Run outcomes' });
    for (const name of ['Completed', 'Failed', 'Cancelled', 'In progress'])
      expect(within(legend).getByText(name)).toBeTruthy();
    // 8 and 2 out of an axis ending at 10.
    const column = within(section).getByTestId('run-day-2026-11-06');
    expect(
      [...column.querySelectorAll<HTMLElement>('div')].map(
        (segment) => segment.style.height,
      ),
    ).toEqual(['80%', '20%']);
    expect(
      within(section).getByTestId('run-day-2026-11-07').children,
    ).toHaveLength(0);

    await userEvent.click(
      within(section).getByRole('button', { name: 'Show as table' }),
    );
    const rows = within(section).getAllByRole('row');
    expect(rows).toHaveLength(3);
    expect(within(rows[1] as HTMLElement).getByText('8')).toBeTruthy();
  });

  it('lists what needs attention, each linking to its work', async () => {
    render();
    const blocked = await screen.findByRole('region', { name: 'Blocked' });
    expect(within(blocked).getByText('7')).toBeTruthy();
    expect(within(blocked).getByText('6 more')).toBeTruthy();
    expect(
      within(blocked)
        .getByRole('link', { name: /Việc bị vướng/ })
        .getAttribute('href'),
    ).toContain('/issues/i1');

    const overdue = screen.getByRole('region', { name: 'Overdue' });
    expect(within(overdue).getByText('Nothing here.')).toBeTruthy();

    const reviews = screen.getByRole('region', {
      name: 'Waiting for review over 2 days',
    });
    expect(
      within(reviews).getByRole('link', { name: /PR chờ review/ }),
    ).toHaveProperty('target', '_blank');

    const failed = screen.getByRole('region', {
      name: 'Failed runs in the last 24 hours',
    });
    expect(within(failed).getByText('Claude')).toBeTruthy();
  });

  it('gives each project its progress', async () => {
    render();
    const link = await screen.findByRole('link', { name: 'Dương Sinh App' });
    expect(link.getAttribute('href')).toContain('/projects/p1');
    expect(screen.getByText('4/10')).toBeTruthy();
  });

  it('says so when figures cannot be read, and keeps the others', async () => {
    failing = true;
    render();
    expect(
      await screen.findByText(
        'Some figures could not be read. Try refreshing.',
        {},
        { timeout: 10_000 },
      ),
    ).toBeTruthy();
    expect(
      screen.getByRole('group', { name: 'Issues completed' }),
    ).toBeTruthy();
  });
});
