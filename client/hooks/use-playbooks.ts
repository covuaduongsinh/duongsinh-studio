import { useQuery } from '@tanstack/react-query';
import { useApiClient } from '@nocobase/app-client';

export interface PlaybookParam {
  readonly name: string;
  readonly description: string;
  readonly required?: boolean;
  readonly defaultValue?: string;
}

export interface PlaybookCriterion {
  readonly text: string;
  readonly checkKind: 'command' | 'review' | 'manual';
  readonly checkValue?: string | null;
}

export interface Playbook {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly skillName: string;
  readonly instructions: string;
  readonly params: readonly PlaybookParam[];
  readonly defaultCriteria: readonly PlaybookCriterion[];
}

export interface PlaybookInvocation {
  readonly id: string;
  readonly playbookSlug: string;
  readonly issueId: string;
  readonly commentId: string | null;
  readonly params: Record<string, string>;
  readonly invokedByUserId: string | null;
  readonly createdAt: string;
}

export function usePlaybooks() {
  const api = useApiClient();
  return useQuery({
    queryKey: ['playbooks'],
    queryFn: async ({ signal }) => {
      const response = await api.request<{ data: Playbook[] }>({
        path: 'playbooks',
        signal,
      });
      return response.data ?? [];
    },
  });
}

export function usePlaybookInvocations() {
  const api = useApiClient();
  return useQuery({
    queryKey: ['playbook-invocations'],
    queryFn: async ({ signal }) => {
      const response = await api.request<{ data: PlaybookInvocation[] }>({
        path: 'playbooks/invocations',
        signal,
      });
      return response.data ?? [];
    },
  });
}
