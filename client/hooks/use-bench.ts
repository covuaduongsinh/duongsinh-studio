/** The harness benchmark figures and actions (`server/routes/bench.ts`). */
import { useApiClient } from '@nocobase/app-client';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';

export interface BenchTaskResult {
  readonly id: string;
  readonly benchRunId: string;
  readonly taskKey: string;
  readonly issueId: string | null;
  readonly result: 'pass' | 'fail' | 'pending';
  readonly reason: string | null;
  readonly runs: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
  readonly returns: number;
  readonly verifyAttempts: number;
  readonly durationMs: number;
}

export interface BenchRun {
  readonly id: string;
  readonly set: string;
  readonly studioCommit: string;
  readonly model: string;
  readonly skillVersions: Record<string, number>;
  readonly startedAt: string;
  readonly finishedAt: string | null;
  readonly status: 'pending' | 'running' | 'completed' | 'failed';
  readonly trigger: string;
  readonly totalTasks: number;
  readonly passedTasks: number;
  readonly passRate: number;
  readonly results?: readonly BenchTaskResult[];
}

export interface BenchStatus {
  readonly currentMonth: string;
  readonly monthlyFullRuns: number;
  readonly monthlyLimit: number;
  readonly remainingRuns: number;
  readonly lastRun: BenchRun | null;
}

export const BENCH_KEY = ['bench'] as const;

export function useBenchStatus(enabled = true): UseQueryResult<BenchStatus> {
  const api = useApiClient();
  return useQuery({
    queryKey: [...BENCH_KEY, 'status'],
    enabled,
    queryFn: async ({ signal }) =>
      (
        await api.request<{ data: BenchStatus }>({
          path: 'bench/status',
          signal,
        })
      ).data,
  });
}

export function useBenchRuns(
  limit = 20,
  enabled = true,
): UseQueryResult<readonly BenchRun[]> {
  const api = useApiClient();
  return useQuery({
    queryKey: [...BENCH_KEY, 'runs', limit],
    enabled,
    queryFn: async ({ signal }) =>
      (
        await api.request<{ data: readonly BenchRun[] }>({
          path: 'bench/runs',
          query: { limit },
          signal,
        })
      ).data,
  });
}

export function useBenchRun(
  id: string | null,
  enabled = true,
): UseQueryResult<BenchRun> {
  const api = useApiClient();
  return useQuery({
    queryKey: [...BENCH_KEY, 'runs', id],
    enabled: Boolean(id) && enabled,
    queryFn: async ({ signal }) =>
      (
        await api.request<{ data: BenchRun }>({
          path: `bench/runs/${id}`,
          signal,
        })
      ).data,
  });
}

export function useStartBenchRun() {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      set?: string;
      taskKey?: string;
      force?: boolean;
    }) =>
      (
        await api.request<{ data: BenchRun }>({
          path: 'bench/run',
          method: 'POST',
          json: params,
        })
      ).data,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: BENCH_KEY });
    },
  });
}
