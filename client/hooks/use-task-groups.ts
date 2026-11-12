/** The grouped issue list of My issues' split view (`GET /api/taskGroups`, `server/routes/inbox.ts`). */
import { useApiClient } from '@nocobase/app-client';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { LIVE_QUERY } from './live-query.js';

/** The four groups of the split view, in the order they are shown. */
export const SPLIT_GROUPS = ['wait', 'doing', 'backlog', 'done'] as const;
export type SplitGroupKey = (typeof SPLIT_GROUPS)[number];

/** The seven groups of the Issues table: the split view's four, with In review, Blocked and Cancelled of their own. */
export const TABLE_GROUPS = [
  'wait',
  'doing',
  'review',
  'blocked',
  'backlog',
  'done',
  'cancelled',
] as const;
export type TableGroupKey = (typeof TABLE_GROUPS)[number];

/** What an issue waits for from the person: the server's decision kinds. */
export type TaskWait =
  | 'takeOver'
  | 'limited'
  | 'failed'
  | 'authorize'
  | 'answer'
  | 'plan'
  | 'accept';

export interface TaskBlocker {
  readonly issueId: string;
  readonly identifier: string;
  readonly title: string;
  readonly reason: 'dependency' | 'stage';
}

export interface TaskRowIssue {
  readonly id: string;
  readonly identifier: string;
  readonly title: string;
  readonly statusKey: string;
  readonly needsYou?: string | null;
  readonly next?: string | null;
  readonly priority?: string | null;
  readonly updatedAt?: string;
  readonly lastActivityAt?: string;
  readonly executor?: { readonly type: string; readonly id: string } | null;
  readonly executorName?: string | null;
  readonly project?: { readonly id: string; readonly name: string } | null;
}

export interface TaskRow {
  readonly issue: TaskRowIssue;
  /** Finished and total sub-issues. */
  readonly progress?: { readonly finished: number; readonly total: number };
  readonly dependencyWait: boolean;
  readonly blockers: readonly TaskBlocker[];
  readonly waits: readonly TaskWait[];
  readonly followed: boolean;
}

export interface TaskGroup {
  readonly group: SplitGroupKey | TableGroupKey;
  readonly count: number;
  readonly data: readonly TaskRow[];
}

export interface TaskGroups {
  /** The signed-in person: what per-person state (a collapsed group) is kept under. */
  readonly membership: string;
  readonly groups: readonly TaskGroup[];
  readonly following: readonly string[];
  readonly waiting: number;
}

/** The filters the split view hands the server; sorting and deleted issues are not part of the grouped list. */
export interface TaskGroupFilters {
  readonly q?: string;
  readonly statusKey?: string;
  readonly projectId?: string;
  readonly labelId?: string;
  readonly ownerUserId?: string;
  readonly executorId?: string;
  readonly involvesUserId?: string;
}

const KEY = ['task-groups'] as const;

/** Refreshed while the page is open: a run finishing or a decision appearing moves the row without a reload. */
const REFRESH_MS = 30_000;

/**
 * `split` is My issues' list (what the person follows stays in it: `follow=all`); `table` is the Issues page's grouped
 * table, which keeps to the filters (`follow=scope`).
 */
export function useTaskGroups(
  filters: TaskGroupFilters,
  view: 'split' | 'table' = 'split',
): UseQueryResult<TaskGroups> {
  const api = useApiClient();
  const query = Object.fromEntries(
    Object.entries({
      q: filters.q,
      statusKey: filters.statusKey,
      projectId: filters.projectId,
      labelId: filters.labelId,
      ownerUserId: filters.ownerUserId,
      executorId: filters.executorId,
      involvesUserId: filters.involvesUserId,
    }).filter(([, value]) => value !== undefined && value !== ''),
  ) as Record<string, string>;
  return useQuery({
    queryKey: [...KEY, view, query],
    ...LIVE_QUERY,
    refetchInterval: REFRESH_MS,
    retry: false,
    queryFn: async ({ signal }) =>
      (
        await api.request<{ data: TaskGroups }>({
          path: 'taskGroups',
          // `follow=all`: what the person follows stays in the list even when the filters would leave it out.
          query: {
            ...query,
            mode: view,
            follow: view === 'split' ? 'all' : 'scope',
          },
          signal,
        })
      ).data,
  });
}
