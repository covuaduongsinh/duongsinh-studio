/** Structured reviews and criteria checks (`server/routes/reviews.ts`). */
import { useApiClient } from '@nocobase/app-client';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

export interface ReviewCriteriaCheck {
  readonly criterionId: string;
  readonly passed: boolean;
  readonly notes?: string | null;
}

export interface ReviewView {
  readonly id: string;
  readonly pullRequestId: string;
  readonly issueId: string | null;
  readonly headSha: string;
  readonly reviewerAgentId: string;
  readonly reviewerRunId: string;
  readonly authorAgentId: string;
  readonly verdict: 'approve' | 'changes' | 'reject' | 'request_changes';
  readonly mustFix: number;
  readonly shouldFix: number;
  readonly kind: 'code' | 'security';
  readonly sameModel: boolean;
  readonly checklist: Record<string, unknown>;
  readonly summary: string;
  readonly createdAt: string;
  readonly criteriaChecks?: readonly ReviewCriteriaCheck[];
}

const REVIEWS_KEY = ['reviews'] as const;

export function usePullRequestReviews(
  pullRequestId: string,
  options?: {
    readonly headSha?: string;
    readonly kind?: 'code' | 'security';
  },
  enabled = true,
): UseQueryResult<readonly ReviewView[]> {
  const api = useApiClient();
  const searchParams = new URLSearchParams();
  if (options?.headSha) searchParams.set('headSha', options.headSha);
  if (options?.kind) searchParams.set('kind', options.kind);
  const query = searchParams.toString();
  const path = `git/pullRequests/${pullRequestId}/reviews${query ? `?${query}` : ''}`;

  return useQuery({
    queryKey: [...REVIEWS_KEY, 'pull', pullRequestId, options],
    enabled: enabled && Boolean(pullRequestId),
    queryFn: async ({ signal }) =>
      (
        await api.request<{ data: ReviewView[] }>({
          path,
          signal,
        })
      ).data,
  });
}

export function useRecentReviews(
  limit = 20,
  enabled = true,
): UseQueryResult<readonly ReviewView[]> {
  const api = useApiClient();
  return useQuery({
    queryKey: [...REVIEWS_KEY, 'recent', limit],
    enabled,
    queryFn: async ({ signal }) =>
      (
        await api.request<{ data: ReviewView[] }>({
          path: `reviews/recent?limit=${limit}`,
          signal,
        })
      ).data,
  });
}
