import { useApiClient } from '@nocobase/app-client';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

export interface QuotaCardData {
  readonly state: 'ok' | 'warning' | 'blocked';
  readonly waiting: readonly {
    readonly projectId: string;
    readonly projectName: string;
    readonly activeUntil: string;
    readonly effectiveConcurrency: number;
  }[];
  readonly budgets: readonly {
    readonly id: string;
    readonly scope: string;
    readonly scopeId: string;
    readonly scopeName?: string | null;
    readonly period: string;
    readonly maxRuns: number | null;
    readonly maxTokens: number | null;
    readonly usedRuns: number;
    readonly usedTokens: number;
    readonly state: string;
  }[];
}

/** The quota card of the Today page; a person who may not read it (403) just gets no card. */
export function useQuota(): UseQueryResult<QuotaCardData | null> {
  const api = useApiClient();
  return useQuery({
    queryKey: ['quota'],
    refetchInterval: 60_000,
    retry: false,
    queryFn: async ({ signal }) => {
      try {
        return (
          (
            await api.request<{ data: QuotaCardData | null }>({
              path: 'quota',
              signal,
            })
          ).data ?? null
        );
      } catch {
        return null;
      }
    },
  });
}

export interface ConfigRow {
  readonly key: string;
  readonly area: 'autopilot' | 'reactions' | 'budgets' | 'tier' | 'skills';
  readonly value: string;
  readonly source: 'default' | 'project' | 'system';
}

export function useEffectiveConfig(
  projectId: string,
): UseQueryResult<ConfigRow[]> {
  const api = useApiClient();
  return useQuery({
    queryKey: ['projects', projectId, 'effectiveConfig'],
    queryFn: async ({ signal }) =>
      (
        await api.request<{ data: ConfigRow[] }>({
          path: `projects/${projectId}/effectiveConfig`,
          signal,
        })
      ).data,
    enabled: Boolean(projectId),
  });
}
