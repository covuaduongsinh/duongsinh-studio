import { useApiClient } from '@nocobase/app-client';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

export interface RunLogHit {
  readonly runId: string;
  readonly seq: number;
  readonly at: string | null;
  readonly type: string;
  readonly snippet: string;
  readonly subjectKind: string | null;
  readonly subjectId: string | null;
}

/** The text of events across runs of the last `days` days; nothing is asked until there is a word to look for (plan S, S6). */
export function useRunLogSearch(
  text: string,
  days: number,
): UseQueryResult<RunLogHit[]> {
  const api = useApiClient();
  const q = text.trim();
  return useQuery({
    queryKey: ['runLogs', 'search', q, days],
    enabled: q.length >= 2,
    queryFn: async ({ signal }) =>
      (
        await api.request<{ data: RunLogHit[] }>({
          path: 'runLogs/search',
          query: { q, days, limit: 50 },
          signal,
        })
      ).data,
  });
}
