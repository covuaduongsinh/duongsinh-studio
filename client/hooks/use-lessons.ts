/** Lessons learned hooks (`client/hooks/use-lessons.ts`). */
import { useApiClient } from '@nocobase/app-client';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';

export interface Lesson {
  readonly id: string;
  readonly projectId: string | null;
  readonly issueId: string | null;
  readonly reviewId: string | null;
  readonly mistake: string;
  readonly rule: string;
  readonly tag: string;
  readonly target: 'skill' | 'knowledge' | 'sensitivePath' | 'projectCriteria';
  readonly targetRef: string | null;
  readonly status: 'proposed' | 'accepted' | 'rejected' | 'applied';
  readonly proposedByType: 'user' | 'agent';
  readonly proposedById: string | null;
  readonly decidedBy: string | null;
  readonly appliedRef: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ProposeLessonParams {
  readonly projectId?: string | null;
  readonly issueId?: string | null;
  readonly reviewId?: string | null;
  readonly mistake: string;
  readonly rule: string;
  readonly tag: string;
  readonly target: 'skill' | 'knowledge' | 'sensitivePath' | 'projectCriteria';
  readonly targetRef?: string | null;
}

export interface ListLessonsParams {
  readonly projectId?: string;
  readonly issueId?: string;
  readonly status?: string;
  readonly tag?: string;
  readonly target?: 'skill' | 'knowledge' | 'sensitivePath' | 'projectCriteria';
  readonly limit?: number;
}

export const LESSONS_KEY = ['lessons'] as const;

export function useLessons(
  params?: ListLessonsParams,
  enabled = true,
): UseQueryResult<readonly Lesson[]> {
  const api = useApiClient();
  return useQuery({
    queryKey: [...LESSONS_KEY, params],
    enabled,
    queryFn: async ({ signal }) =>
      (
        await api.request<{ data: readonly Lesson[] }>({
          path: 'lessons',
          query: params
            ? {
                ...(params.projectId ? { projectId: params.projectId } : {}),
                ...(params.issueId ? { issueId: params.issueId } : {}),
                ...(params.tag ? { tag: params.tag } : {}),
                ...(params.target ? { target: params.target } : {}),
                ...(params.status ? { status: params.status } : {}),
                ...(params.limit !== undefined ? { limit: params.limit } : {}),
              }
            : undefined,
          signal,
        })
      ).data,
  });
}

export function useLesson(
  id: string | null,
  enabled = true,
): UseQueryResult<Lesson> {
  const api = useApiClient();
  return useQuery({
    queryKey: [...LESSONS_KEY, id],
    enabled: Boolean(id) && enabled,
    queryFn: async ({ signal }) =>
      (
        await api.request<{ data: Lesson }>({
          path: `lessons/${id}`,
          signal,
        })
      ).data,
  });
}

export function useProposeLesson() {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: ProposeLessonParams) =>
      (
        await api.request<{ data: Lesson }>({
          path: 'lessons/propose',
          method: 'POST',
          json: params,
        })
      ).data,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: LESSONS_KEY });
    },
  });
}

export function useDecideLesson() {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      decision,
    }: {
      id: string;
      decision: 'accept' | 'reject';
    }) =>
      (
        await api.request<{ data: Lesson }>({
          path: `lessons/${id}/decide`,
          method: 'POST',
          json: { decision },
        })
      ).data,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: LESSONS_KEY });
    },
  });
}

export function useApplyLesson() {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      (
        await api.request<{ data: Lesson }>({
          path: `lessons/${id}/apply`,
          method: 'POST',
        })
      ).data,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: LESSONS_KEY });
    },
  });
}
