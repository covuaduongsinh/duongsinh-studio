/** What waits on the viewer across the application (`server/routes/inbox.ts`, `/api/attention`). */
import { useApiClient } from '@nocobase/app-client';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { LIVE_QUERY } from './live-query.js';

export interface FollowUpIssue {
  readonly id: string;
  readonly identifier: string;
  readonly title: string;
  readonly statusKey: string;
  readonly executorName: string | null;
  readonly lastActivityAt: string;
  readonly owned: boolean;
  readonly followed: boolean;
  readonly unread: number;
}

export interface FollowUps {
  readonly issues: readonly FollowUpIssue[];
  readonly counts: {
    readonly in_review: number;
    readonly blocked: number;
    readonly in_progress: number;
    readonly backlog: number;
  };
  readonly truncated: boolean;
}

const FOLLOW_UPS_KEY = ['follow-ups'] as const;
const BADGES_KEY = ['navigation-badges'] as const;
const BADGE_REFRESH_MS = 60_000;

export function useFollowUps(): UseQueryResult<FollowUps> {
  const api = useApiClient();
  return useQuery({
    ...LIVE_QUERY,
    queryKey: FOLLOW_UPS_KEY,
    queryFn: async ({ signal }) =>
      (await api.request<{ data: FollowUps }>({ path: 'followUps', signal }))
        .data,
  });
}

export function useFollowUpAction(): UseMutationResult<
  unknown,
  unknown,
  {
    readonly issueId: string;
    readonly action: 'follow' | 'unfollow' | 'markSeen';
  }
> {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ issueId, action }) =>
      api.request({
        method: 'POST',
        path: `followUps/issues/${issueId}/${action}`,
        json: {},
      }),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: FOLLOW_UPS_KEY });
    },
  });
}

export interface NavigationCounts {
  readonly decisions: number;
  readonly myIssues: number;
  /** Open conversations that need the person or hold messages they have not read. */
  readonly sessions: number;
  readonly releases: number;
  /**
   * What the "Today" entry shows (V1.2), one number instead of the same count on three entries: decisions on the person's
   * issues, conversations asking for them, and releases waiting. Unread conversation messages do not add to it.
   */
  readonly needsYou: number;
}

const RELEASE_REASONS = new Set(['pendingRelease', 'deployment_requested']);

/** Counts for the menu's badges; each stands on its own, so one failing leaves the others. */
export function useNavigationCounts(enabled: boolean): NavigationCounts {
  const api = useApiClient();
  const result = useQuery({
    queryKey: BADGES_KEY,
    enabled,
    ...LIVE_QUERY,
    refetchInterval: BADGE_REFRESH_MS,
    retry: false,
    queryFn: async ({ signal }) => {
      const [pending, summary, attention, sessions] = await Promise.allSettled([
        api.request<{ data: { decision: number; info: number } }>({
          path: 'inbox/pending',
          signal,
        }),
        api.request<{ data: { waiting: number } }>({
          path: 'taskGroups/summary',
          signal,
        }),
        api.request<{
          data: { reasons: { reason: string; count: number }[] };
        }>({ path: 'attention', signal }),
        api.request<{ data: { unread: number; needsYou: number } }>({
          path: 'agents/conversationAttention',
          signal,
        }),
      ]);
      const waiting =
        summary.status === 'fulfilled' ? summary.value.data.waiting : 0;
      const asking =
        sessions.status === 'fulfilled' ? sessions.value.data.needsYou : 0;
      const releases =
        attention.status === 'fulfilled'
          ? attention.value.data.reasons
              .filter((item) => RELEASE_REASONS.has(item.reason))
              .reduce((sum, item) => sum + item.count, 0)
          : 0;
      return {
        needsYou: waiting + asking + releases,
        decisions:
          pending.status === 'fulfilled'
            ? pending.value.data.decision + pending.value.data.info
            : 0,
        myIssues:
          summary.status === 'fulfilled' ? summary.value.data.waiting : 0,
        // What needs the person first; unread messages count when nothing is asking for them.
        sessions:
          sessions.status === 'fulfilled'
            ? sessions.value.data.needsYou || sessions.value.data.unread
            : 0,
        releases:
          attention.status === 'fulfilled'
            ? attention.value.data.reasons
                .filter((item) => RELEASE_REASONS.has(item.reason))
                .reduce((sum, item) => sum + item.count, 0)
            : 0,
      };
    },
  });
  return (
    result.data ?? {
      decisions: 0,
      myIssues: 0,
      sessions: 0,
      releases: 0,
      needsYou: 0,
    }
  );
}
