// Settings → Budgets and the people's own choices, with `server/routes/budgets.ts` answered by the fixture.
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
import { BudgetStops } from '../../client/components/budget-stops.js';
import { budgetShare, type Budget } from '../../client/hooks/use-budgets.js';
import { BudgetUsage } from '../../client/pages/dashboard/budget-usage.js';
import BudgetsPage from '../../client/pages/settings/budgets.js';
import MyNotificationsPage from '../../client/pages/settings/my-notifications.js';

const can = vi.hoisted(() => ({ value: true }));
vi.mock('@nocobase/app-plugin-authorization/client', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  useCan: () => ({ can: can.value, loading: false }),
}));

vi.mock('@nocobase/app-plugin-notification-web-push/client', () => ({
  PushPreferences: () => <div data-testid='push-preferences' />,
}));

const blocked: Budget = {
  id: 'b1',
  scope: 'project',
  scopeId: 'p1',
  scopeName: 'Dương Sinh App',
  period: 'day',
  maxRuns: 2,
  maxTokens: null,
  usedRuns: 3,
  usedTokens: 1200,
  state: 'blocked',
};
const fine: Budget = {
  ...blocked,
  id: 'b2',
  scope: 'global',
  scopeId: '',
  scopeName: null,
  period: 'month',
  maxRuns: null,
  maxTokens: 10000,
  usedRuns: 3,
  usedTokens: 2500,
  state: 'ok',
};

let calls: ApiCall[] = [];

function render(element: React.ReactElement) {
  return renderWithApp(element, {
    namespace: packageMetadata.name,
    namespaces: { [packageMetadata.name]: enUS },
    fetch: answerApi((call: ApiCall) => {
      calls.push(call);
      const path = String(call.path);
      if (path.endsWith('scopeOptions'))
        return { data: { projects: [], agents: [] } };
      if (call.method === 'DELETE') return { data: null };
      if (call.method === 'PUT') return { data: fine };
      if (call.method === 'POST')
        return { data: { ...blocked, state: 'released' } };
      return { data: [blocked, fine], meta: { total: 2 } };
    }),
  });
}

beforeEach(() => {
  calls = [];
  can.value = true;
});

describe('Settings → Budgets', () => {
  it('shows what each budget used and releases one that stopped work', async () => {
    const user = userEvent.setup();
    render(<BudgetsPage />);
    const row = (await screen.findByText('Dương Sinh App')).closest('tr');
    if (!row) throw new Error('The budget is a row.');
    expect(within(row).getByText('3 / 2')).toBeTruthy();
    expect(within(row).getByText('Stopped')).toBeTruthy();
    const everyone = within(screen.getByRole('table'))
      .getByText('All of Studio')
      .closest('tr');
    if (!everyone) throw new Error('The budget is a row.');
    expect(within(everyone).getByText('On track')).toBeTruthy();
    expect(
      within(everyone).queryByRole('button', { name: 'Release' }),
    ).toBeNull();

    await user.click(within(row).getByRole('button', { name: 'Release' }));
    await waitFor(() =>
      expect(
        calls.some(
          (call) =>
            call.method === 'POST' &&
            String(call.path).endsWith('budgets/b1/release'),
        ),
      ).toBe(true),
    );
  });

  it('saves a limit only when one is given', async () => {
    const user = userEvent.setup();
    render(<BudgetsPage />);
    const save = await screen.findByRole('button', { name: 'Save budget' });
    expect((save as HTMLButtonElement).disabled).toBe(true);
    await user.type(screen.getByLabelText('Most runs'), '100');
    await user.click(save);
    await waitFor(() => {
      const put = calls.find((call) => call.method === 'PUT');
      expect(put?.json).toEqual({
        scope: 'global',
        scopeId: '',
        period: 'month',
        maxRuns: 100,
        maxTokens: null,
      });
    });
  });

  it('removes a budget', async () => {
    const user = userEvent.setup();
    render(<BudgetsPage />);
    const row = (await screen.findByText('Dương Sinh App')).closest('tr');
    if (!row) throw new Error('The budget is a row.');
    await user.click(within(row).getByRole('button', { name: 'Remove' }));
    await waitFor(() =>
      expect(
        calls.some(
          (call) =>
            call.method === 'DELETE' &&
            String(call.path).endsWith('budgets/b1'),
        ),
      ).toBe(true),
    );
  });

  it('who may only read sees the figures and no controls', async () => {
    can.value = false;
    render(<BudgetsPage />);
    await screen.findByText('Dương Sinh App');
    expect(screen.queryByRole('button', { name: 'Release' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save budget' })).toBeNull();
  });
});

describe('the inbox and the dashboard', () => {
  it('the inbox shows what stopped work, with the release', async () => {
    const user = userEvent.setup();
    render(<BudgetStops />);
    await screen.findByText('The budget is used up: Dương Sinh App');
    expect(screen.queryByText(/All of Studio/u)).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Release' }));
    await waitFor(() =>
      expect(calls.some((call) => call.method === 'POST')).toBe(true),
    );
  });

  it('who cannot see budgets never asks for them', async () => {
    can.value = false;
    render(<BudgetStops />);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(calls).toEqual([]);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('the dashboard shows how far along each budget is', async () => {
    render(<BudgetUsage />);
    const stopped = await screen.findByRole('meter', {
      name: 'Dương Sinh App · By day',
    });
    expect(stopped.getAttribute('aria-valuenow')).toBe('100');
    expect(
      screen
        .getByRole('meter', { name: 'All of Studio · By month' })
        .getAttribute('aria-valuenow'),
    ).toBe('25');
  });

  it('the nearer limit decides how far along a budget is', () => {
    expect(budgetShare(blocked)).toBe(1);
    expect(budgetShare(fine)).toBe(0.25);
    expect(budgetShare({ ...fine, maxTokens: 0 })).toBe(1);
    expect(budgetShare({ ...fine, maxTokens: null })).toBe(0);
  });
});

describe('Settings → My notifications', () => {
  const renderChoices = (emailAvailable: boolean) =>
    renderWithApp(<MyNotificationsPage />, {
      namespace: packageMetadata.name,
      namespaces: { [packageMetadata.name]: enUS },
      fetch: answerApi((call: ApiCall) => {
        calls.push(call);
        return {
          data: {
            emailDecisions: true,
            emailReports: false,
            pushDecisions: true,
            emailAvailable,
          },
        };
      }),
    });

  it('each choice is saved as the person turns it', async () => {
    const user = userEvent.setup();
    renderChoices(true);
    await screen.findByText('Weekly reports');
    expect(screen.getByTestId('push-preferences')).toBeTruthy();
    await user.click(screen.getByRole('switch', { name: 'Weekly reports' }));
    await waitFor(() =>
      expect(calls.find((call) => call.method === 'PUT')?.json).toEqual({
        emailReports: true,
      }),
    );
  });

  it('says so while the server has email off, and offers no choice about it', async () => {
    renderChoices(false);
    await screen.findByText('Email is not turned on for this Studio yet.');
    expect(
      screen
        .getByRole('switch', { name: 'Weekly reports' })
        .hasAttribute('data-disabled'),
    ).toBe(true);
  });
});
