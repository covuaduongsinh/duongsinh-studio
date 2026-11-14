import { useApiClient } from '@nocobase/app-client';
import { useMutation, type UseMutationResult } from '@tanstack/react-query';

export interface ContinueResult {
  readonly started: boolean;
  readonly skipped: string | null;
  readonly runId: string | null;
}

export type LessonTargetName =
  'skill' | 'knowledge' | 'sensitivePath' | 'projectCriteria';

export function useContinueFrom(
  runId: string,
): UseMutationResult<ContinueResult, unknown, { seq: number; note?: string }> {
  const api = useApiClient();
  return useMutation({
    mutationFn: async (input) =>
      (
        await api.request<{ data: ContinueResult }>({
          path: `runs/${runId}/continueFrom`,
          method: 'POST',
          json: input,
        })
      ).data,
  });
}

export function useLessonFromRun(
  runId: string,
): UseMutationResult<
  { id: string; status: string },
  unknown,
  { seq: number; rule: string; tag: string; target: LessonTargetName }
> {
  const api = useApiClient();
  return useMutation({
    mutationFn: async (input) =>
      (
        await api.request<{ data: { id: string; status: string } }>({
          path: `runs/${runId}/lesson`,
          method: 'POST',
          json: input,
        })
      ).data,
  });
}
