// Coming back to the app asks again (V0.2): the host turns window-focus refetching off for every query.
import {
  answerApi,
  renderWithApp,
  type ApiCall,
} from '@nocobase/app-testing/client';
import { focusManager } from '@tanstack/react-query';
import { act, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LIVE_QUERY } from '../../client/hooks/live-query.js';
import { useMyWorkSummary } from '../../client/hooks/use-my-work.js';
import enUS from '../../client/locales/en-US.js';
import packageMetadata from '../../package.json' with { type: 'json' };

const calls: string[] = [];
const answer = (call: ApiCall): unknown => {
  calls.push(call.path);
  if (call.path === 'taskGroups/summary')
    return { data: { waiting: 2, doing: 1 } };
  return new Response(null, { status: 404 });
};

const Probe = () => {
  const summary = useMyWorkSummary();
  return <p>{summary.data ? `waiting ${summary.data.waiting}` : 'loading'}</p>;
};

const count = () => calls.filter((p) => p === 'taskGroups/summary').length;

const returnToApp = () => {
  act(() => {
    focusManager.setFocused(false);
    focusManager.setFocused(true);
  });
};

describe('refetch when the window regains focus', () => {
  beforeEach(() => {
    calls.length = 0;
    vi.useFakeTimers({ toFake: ['Date'] });
  });
  afterEach(() => {
    vi.useRealTimers();
    focusManager.setFocused(undefined);
  });

  it('declares the options the "needs me" queries share', () => {
    expect(LIVE_QUERY.refetchOnWindowFocus).toBe(true);
    expect(LIVE_QUERY.refetchOnReconnect).toBe(true);
  });

  it('asks again once the data is stale', async () => {
    await renderWithApp(<Probe />, {
      namespace: packageMetadata.name,
      namespaces: { [packageMetadata.name]: enUS },
      fetch: answerApi(answer),
    });
    await screen.findByText('waiting 2');
    const before = count();

    vi.setSystemTime(Date.now() + 6_000);
    returnToApp();

    await waitFor(() => expect(count()).toBeGreaterThan(before));
  });

  it('does not fire again for a quick flick away and back', async () => {
    await renderWithApp(<Probe />, {
      namespace: packageMetadata.name,
      namespaces: { [packageMetadata.name]: enUS },
      fetch: answerApi(answer),
    });
    await screen.findByText('waiting 2');
    const before = count();

    returnToApp();

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(count()).toBe(before);
  });
});
