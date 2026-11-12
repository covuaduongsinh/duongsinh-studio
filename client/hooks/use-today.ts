/**
 * The "Today" page's one read (V1.1): what needs the person, what the agents are doing, what just happened. Seven
 * endpoints that already exist, asked together under one query key; each stands on its own, so a source that fails or is
 * refused (403) leaves its part empty and the rest still shows. Polled and asked again on focus like the badges;
 * realtime (`pm:changes`) comes with V3.
 */
import { useApiClient } from '@nocobase/app-client';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import type { InboxEntry } from '#extensions/nocobase-inbox/model';
import { LIVE_QUERY } from './live-query.js';
import type { AgentBoard } from './use-issue-work.js';
import type { AttentionReport } from './use-reports.js';
import type { TaskGroups, TaskRow } from './use-task-groups.js';

export const TODAY_KEY = ['today'] as const;
const TODAY_REFRESH_MS = 60_000;
const DAY_MS = 86_400_000;

export interface ReleaseAttention {
  readonly count: number;
  readonly reasons: readonly {
    readonly reason: string;
    readonly count: number;
    readonly path?: string;
  }[];
}

export interface ChatAttention {
  readonly unread: number;
  readonly needsYou: number;
}

export type TodaySource =
  'waiting' | 'chat' | 'release' | 'agents' | 'attention' | 'done';

export interface Today {
  readonly waiting: readonly InboxEntry[] | null;
  readonly chat: ChatAttention | null;
  readonly release: ReleaseAttention | null;
  readonly agents: AgentBoard | null;
  readonly attention: AttentionReport | null;
  /** Issues of the person's finished in the last 24 hours. */
  readonly done: readonly TaskRow[] | null;
  /** The sources that could not be read. */
  readonly failed: readonly TodaySource[];
}

const RELEASE_REASONS = new Set(['pendingRelease', 'deployment_requested']);

/** The releases that wait on the person: what the menu's badge counts too. */
export const releasesWaiting = (release: ReleaseAttention | null): number =>
  release === null
    ? 0
    : release.reasons
        .filter((item) => RELEASE_REASONS.has(item.reason))
        .reduce((sum, item) => sum + item.count, 0);

/** What needs the person, as one number: decisions, conversations asking for them, and releases waiting. */
export const needMeTotal = (today: Today): number =>
  (today.waiting?.length ?? 0) +
  (today.chat?.needsYou ?? 0) +
  releasesWaiting(today.release);

export function useToday(): UseQueryResult<Today> {
  const api = useApiClient();
  return useQuery({
    queryKey: TODAY_KEY,
    ...LIVE_QUERY,
    refetchInterval: TODAY_REFRESH_MS,
    retry: false,
    queryFn: async ({ signal }): Promise<Today> => {
      const get = <T>(path: string, query?: Record<string, string>) =>
        api.request<{ data: T }>({ path, signal, ...(query ? { query } : {}) });
      const [waiting, chat, release, agents, attention, groups] =
        await Promise.allSettled([
          get<readonly InboxEntry[]>('inbox/waiting'),
          get<ChatAttention>('agents/conversationAttention'),
          get<ReleaseAttention>('attention'),
          get<AgentBoard>('agentBoard'),
          get<AttentionReport>('reports/attention'),
          get<TaskGroups>('taskGroups', { mode: 'split', follow: 'all' }),
        ]);
      const failed: TodaySource[] = [];
      const take = <T>(
        result: PromiseSettledResult<{ data: T }>,
        source: TodaySource,
      ): T | null => {
        if (result.status === 'fulfilled') return result.value.data;
        failed.push(source);
        return null;
      };
      const since = Date.now() - DAY_MS;
      const taskGroups = take(groups, 'done');
      return {
        waiting: take(waiting, 'waiting'),
        chat: take(chat, 'chat'),
        release: take(release, 'release'),
        agents: take(agents, 'agents'),
        attention: take(attention, 'attention'),
        done: taskGroups
          ? (
              taskGroups.groups.find((group) => group.group === 'done')?.data ??
              []
            ).filter(
              (row) =>
                Date.parse(
                  row.issue.updatedAt ?? row.issue.lastActivityAt ?? '',
                ) >= since,
            )
          : null,
        failed,
      };
    },
  });
}
