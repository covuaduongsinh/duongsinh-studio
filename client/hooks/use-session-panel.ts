/** What the My sessions page reads beside the conversation list: the state of the issues a session links, and what its runs used. */
import { useApiClient } from '@nocobase/app-client';
import { useChatApi } from '@nocobase/app-plugin-agents/client/chat';
import type { ConversationUsage } from '@nocobase/app-plugin-agents/shared/conversations';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

export interface IssueSummary {
  readonly id: string;
  readonly identifier: string;
  readonly title: string;
  readonly statusKey: string;
}

/** The issues by id (`GET projects/issues/summaries?refs=`, at most 100; the ones the person may not see are left out). */
export function useIssueSummaries(
  ids: readonly string[],
): ReadonlyMap<string, IssueSummary> {
  const api = useApiClient();
  const refs = [...new Set(ids)].slice(0, 100).sort();
  const query = useQuery({
    queryKey: ['session-issue-summaries', refs],
    enabled: refs.length > 0,
    retry: false,
    queryFn: async ({ signal }) =>
      (
        await api.request<{ data: readonly IssueSummary[] }>({
          path: 'projects/issues/summaries',
          query: { refs: refs.join(',') },
          signal,
        })
      ).data,
  });
  return new Map((query.data ?? []).map((summary) => [summary.id, summary]));
}

/** What a conversation's runs used: tokens, and the cost the coding tools priced. */
export function useConversationUsage(
  conversationId: string,
): UseQueryResult<ConversationUsage> {
  const chat = useChatApi();
  return useQuery({
    queryKey: ['session-usage', conversationId],
    retry: false,
    queryFn: ({ signal }) => chat.usage(conversationId, signal),
  });
}
