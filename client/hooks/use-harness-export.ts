import { useApiClient } from '@nocobase/app-client';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

export interface HarnessStatus {
  readonly repository: string | null;
  readonly branch: string | null;
  readonly files: number;
  readonly missing: string[];
  readonly edited: string[];
  readonly outdated: boolean;
  readonly state: 'noRepository' | 'notExported' | 'inSync' | 'drifted';
}

export interface HarnessExportResult {
  readonly number: number;
  readonly url: string;
  readonly files: number;
}

const key = (projectId: string) =>
  ['projects', projectId, 'harnessExport'] as const;

export function useHarnessStatus(
  projectId: string,
  enabled: boolean,
): UseQueryResult<HarnessStatus> {
  const api = useApiClient();
  return useQuery({
    queryKey: key(projectId),
    queryFn: async ({ signal }) =>
      (
        await api.request<{ data: HarnessStatus }>({
          path: `projects/${projectId}/harnessExport`,
          signal,
        })
      ).data,
    enabled: enabled && Boolean(projectId),
    staleTime: 60_000,
  });
}

export function useHarnessExport(
  projectId: string,
): UseMutationResult<HarnessExportResult, unknown, void> {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      (
        await api.request<{ data: HarnessExportResult }>({
          path: `projects/${projectId}/harnessExport`,
          method: 'POST',
          json: {},
        })
      ).data,
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: key(projectId) });
    },
  });
}
