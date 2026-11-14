import { useApiClient } from '@nocobase/app-client';
import {
  useMutation,
  useQuery,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

export interface ChangeSummary {
  readonly pullRequestId: string;
  readonly number: number;
  readonly url: string;
  readonly headSha: string;
  readonly files: number;
  readonly additions: number;
  readonly deletions: number;
  readonly groups: {
    readonly directory: string;
    readonly files: number;
    readonly additions: number;
    readonly deletions: number;
  }[];
  readonly sensitive: string[];
  readonly verification: {
    readonly result: string;
    readonly headSha: string;
    readonly matchesHead: boolean;
  } | null;
}

export function useChangeSummary(
  pullRequestId: string,
  headSha: string,
): UseQueryResult<ChangeSummary> {
  const api = useApiClient();
  return useQuery({
    // A new head is a new summary.
    queryKey: ['pullRequests', pullRequestId, 'changeSummary', headSha],
    queryFn: async ({ signal }) =>
      (
        await api.request<{ data: ChangeSummary }>({
          path: `pullRequests/${pullRequestId}/changeSummary`,
          signal,
        })
      ).data,
    enabled: Boolean(pullRequestId),
    staleTime: 5 * 60_000,
  });
}

export function useRequestChanges(
  pullRequestId: string,
): UseMutationResult<{ commentId: string }, unknown, string> {
  const api = useApiClient();
  return useMutation({
    mutationFn: async (note: string) =>
      (
        await api.request<{ data: { commentId: string } }>({
          path: `pullRequests/${pullRequestId}/requestChanges`,
          method: 'POST',
          json: { note },
        })
      ).data,
  });
}
