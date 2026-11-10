/** The images the agents attached to an issue's comments, newest first (`GET /api/projects/issues/:id/screenshots`). */
import { useApiClient } from '@nocobase/app-client';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

export interface IssueScreenshot {
  readonly id: string;
  readonly filename: string;
  readonly mimeType: string;
  readonly contentUrl: string;
}

export function useIssueScreenshots(
  issueId: string,
  enabled: boolean,
): UseQueryResult<readonly IssueScreenshot[]> {
  const api = useApiClient();
  return useQuery({
    queryKey: ['issue-screenshots', issueId],
    enabled,
    retry: false,
    queryFn: async ({ signal }) =>
      (
        await api.request<{ data: readonly IssueScreenshot[] }>({
          path: `projects/issues/${encodeURIComponent(issueId)}/screenshots`,
          signal,
        })
      ).data,
  });
}
