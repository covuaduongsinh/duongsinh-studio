/** The project manager (Lead Agent) settings (`server/routes/project-manager.ts`). */
import { useApiClient } from '@nocobase/app-client';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

export interface ProjectManagerDefaults {
  readonly fallbackAfterSeconds: number;
  readonly delegationQueueTimeoutSeconds: number;
  readonly commentRunLimit: number;
  readonly principles: null;
}

export interface ProjectManager {
  readonly name: string;
  readonly description: string | null;
  readonly firstChoiceAgentId: string | null;
  readonly fallbackAgentId: string | null;
  readonly fallbackAfterSeconds: number;
  readonly delegationQueueTimeoutSeconds: number;
  readonly commentRunLimit: number;
  /** Null follows `builtInPrinciples`. */
  readonly principles: string | null;
  readonly builtInPrinciples: string;
  readonly defaults: ProjectManagerDefaults;
}

export type ProjectManagerPatch = Partial<
  Omit<ProjectManager, 'builtInPrinciples' | 'defaults'>
>;

export interface AgentOption {
  readonly id: string;
  readonly name: string;
  readonly tool: string | null;
  readonly model: string | null;
}

const KEY = ['project-manager'] as const;

export function useProjectManager(): UseQueryResult<ProjectManager> {
  const api = useApiClient();
  return useQuery({
    queryKey: KEY,
    queryFn: async ({ signal }) =>
      (
        await api.request<{ data: ProjectManager }>({
          path: 'projectManager',
          signal,
        })
      ).data,
  });
}

export function useProjectManagerAgentOptions(): UseQueryResult<
  readonly AgentOption[]
> {
  const api = useApiClient();
  return useQuery({
    queryKey: [...KEY, 'agent-options'],
    queryFn: async ({ signal }) =>
      (
        await api.request<{ data: AgentOption[] }>({
          path: 'projectManager/agentOptions',
          signal,
        })
      ).data,
  });
}

export function useSaveProjectManager(): UseMutationResult<
  ProjectManager,
  Error,
  ProjectManagerPatch
> {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (patch: ProjectManagerPatch) =>
      (
        await api.request<{ data: ProjectManager }>({
          path: 'projectManager',
          method: 'PATCH',
          json: patch,
        })
      ).data,
    onSuccess: (saved) => queryClient.setQueryData(KEY, saved),
  });
}
