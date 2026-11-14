// Tests for the quota card and the effective configuration (plan T, T13), at desktop and at 390 px.
import {
  answerApi,
  renderWithApp,
  type ApiCall,
} from '@nocobase/app-testing/client';
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import enUS from '../../client/locales/en-US.js';
import { QuotaCard } from '../../client/pages/home/quota-card.js';
import { ProjectEffectiveConfig } from '../../client/pages/projects/project-effective-config.js';
import packageMetadata from '../../package.json' with { type: 'json' };
import { stubMobileViewport } from './helpers/mobile-viewport.js';

stubMobileViewport();

let quota: unknown;
let refused = false;

const options = {
  namespace: packageMetadata.name,
  namespaces: { [packageMetadata.name]: enUS },
};
const fetch = answerApi((call: ApiCall) => {
  const path = String(call.path);
  if (path === 'quota')
    return refused ? new Response(null, { status: 403 }) : { data: quota };
  return {
    data: [
      {
        key: 'autopilot.enabled',
        area: 'autopilot',
        value: 'true',
        source: 'project',
      },
      {
        key: 'reaction.conflicts',
        area: 'reactions',
        value: '1/5',
        source: 'default',
      },
      {
        key: 'budget.global.day',
        area: 'budgets',
        value: '50 runs (ok)',
        source: 'system',
      },
    ],
  };
});

beforeEach(() => {
  refused = false;
  quota = {
    state: 'blocked',
    waiting: [
      {
        projectId: 'p1',
        projectName: 'Sandbox',
        activeUntil: '2026-11-14T11:00:00.000Z',
        effectiveConcurrency: 1,
      },
    ],
    budgets: [
      {
        id: 'b1',
        scope: 'global',
        scopeId: '',
        period: 'day',
        maxRuns: 10,
        maxTokens: null,
        usedRuns: 10,
        usedTokens: 0,
        state: 'blocked',
      },
    ],
  };
});

describe('QuotaCard', () => {
  it('names the project waiting on a tool quota and the budget that is used up', async () => {
    await renderWithApp(<QuotaCard />, { ...options, fetch });
    expect(await screen.findByText('Blocked')).toBeTruthy();
    expect(
      screen.getByText(/Project Sandbox is waiting on a tool quota/u),
    ).toBeTruthy();
    expect(
      screen.getByText(/budget per day is used up \(10\/10 runs\)/u),
    ).toBeTruthy();
  });

  it('shows nothing when all is well, and nothing when the person may not read it', async () => {
    quota = { state: 'ok', waiting: [], budgets: [] };
    const calm = await renderWithApp(<QuotaCard />, { ...options, fetch });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(calm.container.textContent).toBe('');
    refused = true;
    const denied = await renderWithApp(<QuotaCard />, { ...options, fetch });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(denied.container.textContent).toBe('');
  });
});

describe('ProjectEffectiveConfig', () => {
  it('lists each setting with its value and where it comes from', async () => {
    await renderWithApp(<ProjectEffectiveConfig projectId='p1' />, {
      ...options,
      fetch,
    });
    expect(await screen.findByText('Autopilot')).toBeTruthy();
    expect(screen.getByText('Reaction: branch conflict')).toBeTruthy();
    expect(screen.getByText('Project')).toBeTruthy();
    expect(screen.getByText('Default')).toBeTruthy();
    expect(screen.getByText('System')).toBeTruthy();
  });
});
