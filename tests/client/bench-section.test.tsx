// Tests for BenchSection dashboard component (`client/pages/dashboard/bench-section.tsx`).
import {
  answerApi,
  renderWithApp,
  type ApiCall,
} from '@nocobase/app-testing/client';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import enUS from '../../client/locales/en-US.js';
import { BenchSection } from '../../client/pages/dashboard/bench-section.js';
import packageMetadata from '../../package.json' with { type: 'json' };

const can = vi.hoisted(() => ({ value: true }));
vi.mock('@nocobase/app-plugin-authorization/client', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  useCan: () => ({ can: can.value, loading: false }),
}));

const mockStatus = {
  currentMonth: '2026-11',
  monthlyFullRuns: 1,
  monthlyLimit: 4,
  remainingRuns: 3,
  lastRun: null,
};

const mockRun = {
  id: 'run-1',
  set: 'ds-core',
  studioCommit: 'abcdef1234567890',
  model: 'claude-3-5-sonnet',
  skillVersions: { 'ds-workflow': 2 },
  startedAt: new Date().toISOString(),
  finishedAt: new Date().toISOString(),
  status: 'completed',
  trigger: 'manual',
  totalTasks: 10,
  passedTasks: 8,
  passRate: 0.8,
  results: [
    {
      id: 'res-1',
      benchRunId: 'run-1',
      taskKey: 'route_permission',
      issueId: 'issue-1',
      result: 'pass',
      reason: null,
      runs: 2,
      outputTokens: 1500,
      totalTokens: 5000,
      returns: 0,
      verifyAttempts: 1,
      durationMs: 45000,
    },
    {
      id: 'res-2',
      benchRunId: 'run-1',
      taskKey: 'migration_down',
      issueId: 'issue-2',
      result: 'fail',
      reason: 'Missing down method in migration',
      runs: 3,
      outputTokens: 2000,
      totalTokens: 6000,
      returns: 1,
      verifyAttempts: 2,
      durationMs: 60000,
    },
  ],
};

let calls: ApiCall[] = [];

async function render(element: React.ReactElement) {
  return await renderWithApp(element, {
    namespace: packageMetadata.name,
    namespaces: { [packageMetadata.name]: enUS },
    fetch: answerApi((call: ApiCall) => {
      calls.push(call);
      const path = String(call.path);
      if (path.endsWith('bench/status')) {
        return { data: mockStatus };
      }
      if (path.endsWith('bench/runs')) {
        return { data: [mockRun] };
      }
      if (path.includes('bench/runs/')) {
        return { data: mockRun };
      }
      if (call.method === 'POST' && path.endsWith('bench/run')) {
        return { data: mockRun };
      }
      return { data: null };
    }),
  });
}

beforeEach(() => {
  calls = [];
  can.value = true;
});

describe('Dashboard → BenchSection', () => {
  it('does not render anything when user is not unrestricted admin', async () => {
    can.value = false;
    const { container } = await render(<BenchSection />);
    expect(container.firstChild).toBeNull();
  });

  it('renders benchmark cards, metrics, tasks table and starts a run when admin', async () => {
    const user = userEvent.setup();
    await render(<BenchSection />);

    // 1. Should show benchmark title
    expect(await screen.findByText('Harness Benchmark')).toBeTruthy();

    // 2. Metric values
    expect(await screen.findByText('80%')).toBeTruthy();
    expect(await screen.findByText('1 / 4')).toBeTruthy();
    expect(await screen.findByText('abcdef1')).toBeTruthy();

    // 3. 10 Standard Tasks
    expect(
      screen.getByText('1. Route with permission & 401/403 tests'),
    ).toBeTruthy();
    expect(
      screen.getByText('2. Self-contained migration with down'),
    ).toBeTruthy();
    expect(screen.getByText('Missing down method in migration')).toBeTruthy();

    // 4. Click Run Benchmark
    const runBtn = screen.getByRole('button', { name: /Run Benchmark/i });
    expect(runBtn).toBeTruthy();
    await user.click(runBtn);

    await waitFor(() => {
      expect(
        calls.some(
          (call) =>
            call.method === 'POST' && String(call.path).endsWith('bench/run'),
        ),
      ).toBe(true);
    });
  });
});
