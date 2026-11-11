import { useApiClient } from '@nocobase/app-client';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

export interface AutopilotSettings {
  readonly projectId: string;
  readonly enabled: boolean;
  /** Whether Studio merges the pull request of a finished stage by itself (on unless turned off). */
  readonly autoMergeStages: boolean;
  readonly mergeMethod: string;
  readonly maxMergesPerDay: number | null;
  readonly maxActiveIssues: number | null;
  readonly stallMinutes: number;
  readonly sensitivePaths: string[] | null;
  readonly sensitivePolicy: 'extraReview' | 'human';
  readonly pausedReason: string | null;
  readonly updatedAt: string;
  readonly updatedById: string | null;
}

export interface AutopilotUpdateInput {
  readonly enabled?: boolean;
  readonly autoMergeStages?: boolean;
  readonly mergeMethod?: 'squash' | 'merge' | 'rebase';
  readonly maxMergesPerDay?: number | null;
  readonly maxActiveIssues?: number | null;
  readonly stallMinutes?: number;
  readonly sensitivePaths?: string[] | null;
  readonly sensitivePolicy?: 'extraReview' | 'human';
}

export interface AutopilotEvent {
  readonly id: string;
  readonly projectId: string;
  readonly issueId: string | null;
  readonly pullRequestId: string | null;
  readonly kind:
    'merged' | 'skipped' | 'opened' | 'stalled' | 'blocked' | 'paused';
  readonly reason: string | null;
  readonly data: Record<string, unknown> | null;
  readonly createdAt: string;
}

export interface AutopilotEvaluation {
  readonly eligible: boolean;
  readonly reasons: readonly string[];
  readonly issueId: string;
  readonly projectId?: string;
}

export interface IssueAutopilotFlag {
  readonly issueId: string;
  readonly allowAutoStart: boolean;
  readonly inheritFromParent: boolean;
  readonly autoCompleteOnMerge: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export const autopilotKeys = {
  settings: (projectId: string) =>
    ['projects', projectId, 'autopilot'] as const,
  events: (projectId: string) =>
    ['projects', projectId, 'autopilot', 'events'] as const,
  evaluation: (issueId: string) => ['issues', issueId, 'autopilot'] as const,
  flag: (issueId: string) => ['issues', issueId, 'autopilot-flag'] as const,
};

export function useProjectAutopilot(
  projectId: string,
): UseQueryResult<AutopilotSettings> {
  const api = useApiClient();
  return useQuery({
    queryKey: autopilotKeys.settings(projectId),
    queryFn: async ({ signal }) =>
      (
        await api.request<{ data: AutopilotSettings }>({
          path: `projects/${projectId}/autopilot`,
          signal,
        })
      ).data,
    enabled: Boolean(projectId),
  });
}

export function useUpdateProjectAutopilot(
  projectId: string,
): UseMutationResult<AutopilotSettings, unknown, AutopilotUpdateInput> {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: AutopilotUpdateInput) =>
      (
        await api.request<{ data: AutopilotSettings }>({
          path: `projects/${projectId}/autopilot`,
          method: 'PUT',
          json: input,
        })
      ).data,
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: autopilotKeys.settings(projectId),
      });
    },
  });
}

export function usePauseProjectAutopilot(
  projectId: string,
): UseMutationResult<AutopilotSettings, unknown, { reason: string }> {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ reason }: { reason: string }) =>
      (
        await api.request<{ data: AutopilotSettings }>({
          path: `projects/${projectId}/autopilot/pause`,
          method: 'POST',
          json: { reason },
        })
      ).data,
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: autopilotKeys.settings(projectId),
      });
      void queryClient.invalidateQueries({
        queryKey: autopilotKeys.events(projectId),
      });
    },
  });
}

export function useResumeProjectAutopilot(
  projectId: string,
): UseMutationResult<AutopilotSettings, unknown, void> {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      (
        await api.request<{ data: AutopilotSettings }>({
          path: `projects/${projectId}/autopilot/resume`,
          method: 'POST',
          json: {},
        })
      ).data,
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: autopilotKeys.settings(projectId),
      });
      void queryClient.invalidateQueries({
        queryKey: autopilotKeys.events(projectId),
      });
    },
  });
}

export function useProjectAutopilotEvents(
  projectId: string,
): UseQueryResult<AutopilotEvent[]> {
  const api = useApiClient();
  return useQuery({
    queryKey: autopilotKeys.events(projectId),
    queryFn: async ({ signal }) =>
      (
        await api.request<{ data: AutopilotEvent[] }>({
          path: 'autopilot/events',
          query: { projectId, limit: 50 },
          signal,
        })
      ).data,
    enabled: Boolean(projectId),
  });
}

export function useIssueAutopilot(
  issueId: string,
): UseQueryResult<AutopilotEvaluation> {
  const api = useApiClient();
  return useQuery({
    queryKey: autopilotKeys.evaluation(issueId),
    queryFn: async ({ signal }) =>
      (
        await api.request<{ data: AutopilotEvaluation }>({
          path: `issues/${issueId}/autopilot`,
          signal,
        })
      ).data,
    enabled: Boolean(issueId),
  });
}

export function useIssueAutopilotFlag(
  issueId: string,
): UseQueryResult<IssueAutopilotFlag | null> {
  const api = useApiClient();
  return useQuery({
    queryKey: autopilotKeys.flag(issueId),
    queryFn: async ({ signal }) =>
      (
        await api.request<{ data: IssueAutopilotFlag | null }>({
          path: `issues/${issueId}/autopilot-flag`,
          signal,
        })
      ).data,
    enabled: Boolean(issueId),
  });
}

export function useSetIssueAutopilotFlag(issueId: string): UseMutationResult<
  IssueAutopilotFlag,
  unknown,
  {
    allowAutoStart?: boolean;
    inheritFromParent?: boolean;
    autoCompleteOnMerge?: boolean;
  }
> {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      allowAutoStart?: boolean;
      inheritFromParent?: boolean;
      autoCompleteOnMerge?: boolean;
    }) =>
      (
        await api.request<{ data: IssueAutopilotFlag }>({
          path: `issues/${issueId}/autopilot-flag`,
          method: 'PUT',
          json: input,
        })
      ).data,
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: autopilotKeys.flag(issueId),
      });
    },
  });
}

export function useStopAllAutopilot(): UseMutationResult<
  { stopped: boolean },
  unknown,
  { reason: string }
> {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ reason }: { reason: string }) =>
      (
        await api.request<{ data: { stopped: boolean } }>({
          path: 'autopilot/stop-all',
          method: 'POST',
          json: { reason },
        })
      ).data,
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}
