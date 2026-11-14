import { useApiClient } from '@nocobase/app-client';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

export type ProtectionProblemName =
  'noRequiredCheck' | 'pushAllowed' | 'reviewRequired';

export interface BranchProtection {
  readonly status: 'read' | 'unreadable' | 'noRepository';
  readonly repository: string | null;
  readonly branch: string | null;
  readonly verdict: 'ok' | 'problem' | 'unknown' | null;
  readonly problems: ProtectionProblemName[];
  readonly unknowns: 'pullRequestUnknown'[];
  readonly requiredChecks: string[];
  readonly rulesReadable: boolean;
  readonly httpStatus: number | null;
}

export function useBranchProtection(
  projectId: string,
  enabled: boolean,
): UseQueryResult<BranchProtection> {
  const api = useApiClient();
  return useQuery({
    queryKey: ['projects', projectId, 'branchProtection'],
    queryFn: async ({ signal }) =>
      (
        await api.request<{ data: BranchProtection }>({
          path: `projects/${projectId}/branchProtection`,
          signal,
        })
      ).data,
    enabled: enabled && Boolean(projectId),
    // GitHub's answer changes only when a person changes the settings; "Kiểm lại" asks again.
    staleTime: 60_000,
  });
}
