import { useApiClient } from '@nocobase/app-client';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

export interface Routine {
  readonly id: string;
  readonly name: string;
  readonly playbookSlug: string | null;
  readonly template: string;
  readonly cron: string;
  readonly enabled: boolean;
  readonly projectIds: string[];
  readonly lastRunAt: string | null;
  readonly lastResult: string | null;
}

export interface RoutineTemplate {
  readonly key: string;
  readonly name: string;
  readonly playbookSlug: string | null;
  readonly template: string;
  readonly cron: string;
}

export interface RoutineInput {
  readonly name: string;
  readonly playbookSlug?: string | null;
  readonly template: string;
  readonly cron: string;
  readonly projectIds: string[];
}

export interface RoutineRun {
  readonly created: { projectId: string; issueId: string }[];
  readonly skipped: { projectId: string; reason: string; detail?: string }[];
}

const KEY = ['routines'] as const;

export function useRoutines(): UseQueryResult<Routine[]> {
  const api = useApiClient();
  return useQuery({
    queryKey: KEY,
    queryFn: async ({ signal }) =>
      (await api.request<{ data: Routine[] }>({ path: 'routines', signal }))
        .data,
  });
}

export function useRoutineTemplates(): UseQueryResult<RoutineTemplate[]> {
  const api = useApiClient();
  return useQuery({
    queryKey: [...KEY, 'templates'],
    queryFn: async ({ signal }) =>
      (
        await api.request<{ data: RoutineTemplate[] }>({
          path: 'routineTemplates',
          signal,
        })
      ).data,
  });
}

export function useRoutineProjects(): UseQueryResult<
  { id: string; name: string }[]
> {
  const api = useApiClient();
  return useQuery({
    queryKey: [...KEY, 'projects'],
    queryFn: async ({ signal }) =>
      (
        await api.request<{ data: { id: string; name: string }[] }>({
          path: 'projects',
          signal,
        })
      ).data.map(({ id, name }) => ({ id, name })),
  });
}

function useRoutineMutation<TInput, TResult>(
  send: (
    api: ReturnType<typeof useApiClient>,
    input: TInput,
  ) => Promise<TResult>,
): UseMutationResult<TResult, unknown, TInput> {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TInput) => send(api, input),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: KEY });
    },
  });
}

export const useCreateRoutine = () =>
  useRoutineMutation<RoutineInput, Routine>(
    async (api, input) =>
      (
        await api.request<{ data: Routine }>({
          path: 'routines',
          method: 'POST',
          json: input,
        })
      ).data,
  );

export const useCreateRoutineFromTemplate = () =>
  useRoutineMutation<{ key: string; projectIds: string[] }, Routine>(
    async (api, input) =>
      (
        await api.request<{ data: Routine }>({
          path: 'routines/fromTemplate',
          method: 'POST',
          json: input,
        })
      ).data,
  );

export const useSetRoutineEnabled = () =>
  useRoutineMutation<{ id: string; enabled: boolean }, Routine>(
    async (api, { id, enabled }) =>
      (
        await api.request<{ data: Routine }>({
          path: `routines/${id}/enabled`,
          method: 'POST',
          json: { enabled },
        })
      ).data,
  );

export const useRunRoutine = () =>
  useRoutineMutation<string, RoutineRun>(
    async (api, id) =>
      (
        await api.request<{ data: RoutineRun }>({
          path: `routines/${id}/run`,
          method: 'POST',
          json: {},
        })
      ).data,
  );

export const useDeleteRoutine = () =>
  useRoutineMutation<string, unknown>(async (api, id) =>
    api.request({ path: `routines/${id}`, method: 'DELETE' }),
  );
