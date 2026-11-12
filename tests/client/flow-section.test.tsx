// "Nhịp giao việc" on the dashboard: the pull request pace and the readings taken by hand (plan V, "Đo trước").
import {
  answerApi,
  renderWithApp,
  type ApiCall,
} from '@nocobase/app-testing/client';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import enUS from '../../client/locales/en-US.js';
import { FlowSection } from '../../client/pages/dashboard/flow-section.js';
import packageMetadata from '../../package.json' with { type: 'json' };

const report = {
  days: 30,
  from: '2026-10-09',
  to: '2026-11-07',
  subjects: true,
  sample: 4,
  firstPullRequestP50Ms: 40 * 60_000,
  firstPullRequestP90Ms: 3 * 3_600_000,
  runsToPullRequestP50: 2,
  runsToPullRequestP90: 5,
  snapshots: [
    {
      id: 's1',
      metric: 'tapsToNeedMe',
      value: 3,
      note: null,
      takenAt: '2026-11-12T03:00:00.000Z',
    },
  ],
};

let calls: ApiCall[] = [];
let denyRecording = false;
let missing = false;

const duration = (ms: number | null) =>
  ms === null ? '—' : `${ms / 60_000} min`;

const render = () =>
  renderWithApp(<FlowSection days={30} duration={duration} />, {
    namespace: packageMetadata.name,
    namespaces: { [packageMetadata.name]: enUS },
    fetch: answerApi((call: ApiCall) => {
      calls.push(call);
      if (call.path === 'reports/flow')
        return missing ? new Response(null, { status: 404 }) : { data: report };
      if (call.path === 'reports/flowSnapshots')
        return denyRecording
          ? new Response(
              JSON.stringify({ error: { status: 'PERMISSION_DENIED' } }),
              {
                status: 403,
                headers: { 'content-type': 'application/json' },
              },
            )
          : {
              data: {
                id: 's2',
                metric: 'firstBundleBytes',
                value: 1,
                note: null,
                takenAt: '2026-11-12T04:00:00.000Z',
              },
            };
      return new Response(null, { status: 404 });
    }),
  });

beforeEach(() => {
  calls = [];
  denyRecording = false;
  missing = false;
});

describe('delivery pace card', () => {
  it('shows the pace from assignment to pull request and the latest reading', async () => {
    await render();
    const pace = await screen.findByRole('group', {
      name: 'Assigned → PR opened',
    });
    expect(within(pace).getByText('40 min · P90 180 min')).toBeInTheDocument();
    const runs = screen.getByRole('group', {
      name: 'Runs per issue until the PR opens',
    });
    expect(within(runs).getByText('2 · P90 5')).toBeInTheDocument();
    expect(screen.getAllByText(/4 issues/)).not.toHaveLength(0);
    expect(screen.getByText(/Latest: 3 taps/)).toBeInTheDocument();
  });

  it('records a reading and asks for the figures again', async () => {
    const user = userEvent.setup();
    await render();
    const input = await screen.findByLabelText('Value: First bundle size');
    await user.type(input, '420000');
    const row = input.closest('form') as HTMLElement;
    await user.click(within(row).getByRole('button', { name: 'Record' }));
    await waitFor(() =>
      expect(
        calls.some(
          (call) =>
            call.method === 'POST' &&
            call.path === 'reports/flowSnapshots' &&
            JSON.stringify(call.json) ===
              JSON.stringify({ metric: 'firstBundleBytes', value: 420000 }),
        ),
      ).toBe(true),
    );
    await waitFor(() =>
      expect(
        calls.filter((call) => call.path === 'reports/flow').length,
      ).toBeGreaterThan(1),
    );
  });

  it('does not send a value that is not a whole number', async () => {
    const user = userEvent.setup();
    await render();
    const input = await screen.findByLabelText('Value: First bundle size');
    await user.type(input, '4.5');
    const row = input.closest('form') as HTMLElement;
    expect(within(row).getByRole('button', { name: 'Record' })).toBeDisabled();
  });

  it('says so when the administrator-only recording is refused', async () => {
    denyRecording = true;
    const user = userEvent.setup();
    await render();
    const input = await screen.findByLabelText('Value: Work page load on 4G');
    await user.type(input, '3200');
    const row = input.closest('form') as HTMLElement;
    await user.click(within(row).getByRole('button', { name: 'Record' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not record the reading.',
    );
  });

  it('shows nothing when the figures cannot be read', async () => {
    missing = true;
    await render();
    await waitFor(() =>
      expect(calls.some((c) => c.path === 'reports/flow')).toBe(true),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('region', { name: 'Delivery pace' }),
      ).toBeNull(),
    );
  });
});

describe('delivery pace card on a phone', () => {
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

  it('stacks the figures and keeps every reading reachable at 390 px', async () => {
    await render();
    const region = await screen.findByRole('region', { name: 'Delivery pace' });
    // One column of readings, each with its own field and button, and no table to scroll sideways.
    expect(within(region).queryByRole('table')).toBeNull();
    expect(
      within(region).getAllByRole('button', { name: 'Record' }),
    ).toHaveLength(3);
    expect(region.querySelector('.sm\\:grid-cols-2')).not.toBeNull();
  });
});
