/** Verification settings and recent runs (`server/routes/verifications.ts`). */
import { useApiClient } from '@nocobase/app-client';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

export interface VerificationSettings {
  readonly maxConsecutiveFailures: number;
}

export interface VerificationSummary {
  readonly id: string;
  readonly issueId: string;
  readonly runId: string | null;
  readonly agentId: string | null;
  readonly headSha: string;
  readonly attempt: number;
  readonly result: 'passed' | 'failed' | 'contradicted';
  readonly createdAt: string;
}

const VERIFICATIONS_KEY = ['verifications'] as const;

export function useVerificationSettings(
  enabled = true,
): UseQueryResult<VerificationSettings> {
  const api = useApiClient();
  return useQuery({
    queryKey: [...VERIFICATIONS_KEY, 'settings'],
    enabled,
    queryFn: async ({ signal }) =>
      (
        await api.request<{ data: VerificationSettings }>({
          path: 'verifications/settings',
          signal,
        })
      ).data,
  });
}

export function useSaveVerificationSettings(): UseMutationResult<
  VerificationSettings,
  Error,
  VerificationSettings
> {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: VerificationSettings) =>
      (
        await api.request<{ data: VerificationSettings }>({
          path: 'verifications/settings',
          method: 'PUT',
          json: body,
        })
      ).data,
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: [...VERIFICATIONS_KEY, 'settings'],
      }),
  });
}

export function useRecentVerifications(
  limit = 20,
  enabled = true,
): UseQueryResult<readonly VerificationSummary[]> {
  const api = useApiClient();
  return useQuery({
    queryKey: [...VERIFICATIONS_KEY, 'recent', limit],
    enabled,
    queryFn: async ({ signal }) =>
      (
        await api.request<{ data: VerificationSummary[] }>({
          path: `verifications/recent?limit=${limit}`,
          signal,
        })
      ).data,
  });
}
