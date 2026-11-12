import { useApiClient } from '@nocobase/app-client';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import type { ReportDays } from './use-reports.js';
import { REPORTS_KEY } from './use-reports.js';

export const SNAPSHOT_METRICS = [
  'tapsToNeedMe',
  'firstBundleBytes',
  'issueLoad4gMs',
] as const;
export type SnapshotMetric = (typeof SNAPSHOT_METRICS)[number];

export interface MetricSnapshot {
  readonly id: string;
  readonly metric: SnapshotMetric;
  readonly value: number;
  readonly note: string | null;
  readonly takenAt: string;
}

/** `GET /api/reports/flow`: how fast work reaches a pull request, and the readings taken by hand. */
export interface FlowReport {
  readonly days: ReportDays;
  readonly from: string;
  readonly to: string;
  readonly subjects: boolean;
  readonly sample: number;
  readonly firstPullRequestP50Ms: number | null;
  readonly firstPullRequestP90Ms: number | null;
  readonly runsToPullRequestP50: number | null;
  readonly runsToPullRequestP90: number | null;
  readonly snapshots: readonly MetricSnapshot[];
}

export function useFlowReport(days: ReportDays): UseQueryResult<FlowReport> {
  const api = useApiClient();
  return useQuery({
    queryKey: [...REPORTS_KEY, 'reports/flow', days],
    // The dashboard says nothing when the figures cannot be read; a retry storm would only slow the page.
    retry: false,
    queryFn: async ({ signal }) =>
      (
        await api.request<{ data: FlowReport }>({
          path: 'reports/flow',
          query: { days },
          signal,
        })
      ).data,
  });
}

export function useRecordSnapshot(): UseMutationResult<
  MetricSnapshot,
  unknown,
  {
    readonly metric: SnapshotMetric;
    readonly value: number;
    readonly note?: string | null;
  }
> {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (reading) =>
      (
        await api.request<{ data: MetricSnapshot }>({
          path: 'reports/flowSnapshots',
          method: 'POST',
          json: reading,
        })
      ).data,
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: [...REPORTS_KEY, 'reports/flow'],
      });
    },
  });
}
