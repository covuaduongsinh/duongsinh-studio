import { useApiClient } from '@nocobase/app-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export type SecretFindingStatus = 'active' | 'resolved' | 'ignored';

export interface SecretFinding {
  readonly id: string;
  readonly issueId: string;
  readonly commentId?: string | null;
  readonly patternKey: string;
  readonly fingerprint: string;
  readonly status: SecretFindingStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export function useSecretFindings(issueId: string | undefined) {
  const api = useApiClient();
  const queryClient = useQueryClient();
  const queryKey = ['issue-secret-findings', issueId];

  const query = useQuery({
    queryKey,
    enabled: Boolean(issueId),
    queryFn: async ({ signal }) => {
      const res = await api.request<{ data: SecretFinding[] }>({
        path: `issues/${issueId}/secret-findings`,
        signal,
      });
      return res.data;
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({
      findingId,
      status,
    }: {
      findingId: string;
      status: SecretFindingStatus;
    }) => {
      const res = await api.request<{ data: SecretFinding }>({
        method: 'POST',
        path: `secret-findings/${findingId}/status`,
        json: { status },
      });
      return res.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  return {
    ...query,
    findings: query.data ?? [],
    updateStatus,
  };
}
