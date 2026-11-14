import { useApiClient } from '@nocobase/app-client';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import type { IssueTierName } from './use-autopilot';

export interface IssueTier {
  readonly tier: IssueTierName;
  readonly source: 'issue' | 'default';
  readonly raisedFrom: IssueTierName | null;
  readonly reason: string | null;
}

const key = (issueId: string) => ['issues', issueId, 'tier'] as const;

export function useIssueTier(issueId: string): UseQueryResult<IssueTier> {
  const api = useApiClient();
  return useQuery({
    queryKey: key(issueId),
    queryFn: async ({ signal }) =>
      (
        await api.request<{ data: IssueTier }>({
          path: `issues/${issueId}/tier`,
          signal,
        })
      ).data,
    enabled: Boolean(issueId),
  });
}

export function useSetIssueTier(
  issueId: string,
): UseMutationResult<IssueTier, unknown, IssueTierName> {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (tier: IssueTierName) =>
      (
        await api.request<{ data: IssueTier }>({
          path: `issues/${issueId}/tier`,
          method: 'PUT',
          json: { tier },
        })
      ).data,
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: key(issueId) });
    },
  });
}
