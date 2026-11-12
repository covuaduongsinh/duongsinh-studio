/** What waits on the signed-in person and what is under way (`server/routes/inbox.ts`), for the home page. */
import { useApiClient } from '@nocobase/app-client';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import type { InboxEntry } from '#extensions/nocobase-inbox/model';
import { LIVE_QUERY } from './live-query.js';

export interface MyWorkSummary {
  /** The issues the person owns or executes that are open, and how many of them wait on a decision of theirs. */
  readonly mine: { readonly open: number; readonly waiting: number };
  readonly waiting: number;
}

const WORK = ['my-work'] as const;

/** Polled while the page is open, and asked again when the window regains focus (`LIVE_QUERY`): a decision appears without a reload. */
const REFRESH_MS = 30_000;

export function useMyWorkSummary(): UseQueryResult<MyWorkSummary> {
  const api = useApiClient();
  return useQuery({
    queryKey: [...WORK, 'summary'],
    ...LIVE_QUERY,
    refetchInterval: REFRESH_MS,
    // Polled again soon anyway, and the page has a Try again button: an error should show now, not after backoffs.
    retry: false,
    queryFn: async ({ signal }) =>
      (
        await api.request<{ data: MyWorkSummary }>({
          path: 'taskGroups/summary',
          signal,
        })
      ).data,
  });
}

/** Unlike the inbox's own source this does not swallow errors: the page says when the list could not be read. */
export function useWaitingDecisions(): UseQueryResult<readonly InboxEntry[]> {
  const api = useApiClient();
  return useQuery({
    queryKey: [...WORK, 'waiting'],
    ...LIVE_QUERY,
    refetchInterval: REFRESH_MS,
    // Polled again soon anyway, and the page has a Try again button: an error should show now, not after backoffs.
    retry: false,
    queryFn: async ({ signal }) =>
      (
        await api.request<{ data: readonly InboxEntry[] }>({
          path: 'inbox/waiting',
          signal,
        })
      ).data,
  });
}
