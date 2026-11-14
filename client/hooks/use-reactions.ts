import { useApiClient } from '@nocobase/app-client';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

export type ReactionEventName =
  | 'ciFailed'
  | 'conflicts'
  | 'reviewChanges'
  | 'runFailed'
  | 'prLineComment'
  | 'greenAndApproved';

export interface ReactionRule {
  readonly event: ReactionEventName;
  readonly enabled: boolean;
  readonly maxAttempts: number;
  readonly maxPerIssue: number;
  /** The project's own rule, not the built-in default. */
  readonly overridden: boolean;
}

export interface ReactionRuleInput {
  readonly enabled?: boolean;
  readonly maxAttempts?: number;
  readonly maxPerIssue?: number;
}

export interface IssueReaction {
  readonly id: string;
  readonly kind: 'reacted' | 'blocked';
  readonly event: ReactionEventName | null;
  readonly attempt: number | null;
  readonly reason: string | null;
  readonly createdAt: string;
}

export const reactionKeys = {
  rules: (projectId: string) => ['projects', projectId, 'reactions'] as const,
  issue: (issueId: string) => ['issues', issueId, 'reactions'] as const,
};

export function useProjectReactions(
  projectId: string,
): UseQueryResult<ReactionRule[]> {
  const api = useApiClient();
  return useQuery({
    queryKey: reactionKeys.rules(projectId),
    queryFn: async ({ signal }) =>
      (
        await api.request<{ data: ReactionRule[] }>({
          path: `projects/${projectId}/reactions`,
          signal,
        })
      ).data,
    enabled: Boolean(projectId),
  });
}

export function useUpdateProjectReaction(
  projectId: string,
): UseMutationResult<
  ReactionRule,
  unknown,
  { event: ReactionEventName; input: ReactionRuleInput }
> {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ event, input }) =>
      (
        await api.request<{ data: ReactionRule }>({
          path: `projects/${projectId}/reactions/${event}`,
          method: 'PUT',
          json: input,
        })
      ).data,
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: reactionKeys.rules(projectId),
      });
    },
  });
}

export function useIssueReactions(
  issueId: string,
): UseQueryResult<IssueReaction[]> {
  const api = useApiClient();
  return useQuery({
    queryKey: reactionKeys.issue(issueId),
    queryFn: async ({ signal }) =>
      (
        await api.request<{ data: IssueReaction[] }>({
          path: `issues/${issueId}/reactions`,
          signal,
        })
      ).data,
    enabled: Boolean(issueId),
  });
}
