import { useApiClient } from '@nocobase/app-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export type CheckKind = 'test' | 'command' | 'ci' | 'human';
export type CriteriaSource = 'human' | 'agent' | 'projectDefault';

export interface CriteriaItem {
  readonly id?: string;
  readonly issueId?: string;
  readonly projectId?: string;
  readonly text: string;
  readonly checkKind: CheckKind;
  readonly checkValue?: string | null;
  readonly position?: number;
  readonly source?: CriteriaSource;
}

export function useIssueCriteria(issueId: string | undefined) {
  const api = useApiClient();
  const queryClient = useQueryClient();
  const queryKey = ['issue-criteria', issueId];

  const query = useQuery({
    queryKey,
    enabled: Boolean(issueId),
    queryFn: async ({ signal }) => {
      const res = await api.request<{ data: CriteriaItem[] }>({
        path: `issues/${issueId}/criteria`,
        signal,
      });
      return res.data;
    },
  });

  const saveCriteria = useMutation({
    mutationFn: async (criteria: CriteriaItem[]) => {
      const res = await api.request<{ data: CriteriaItem[] }>({
        method: 'PUT',
        path: `issues/${issueId}/criteria`,
        data: { criteria },
      });
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(queryKey, data);
    },
  });

  const proposeCriteria = useMutation({
    mutationFn: async (criteria: CriteriaItem[]) => {
      const res = await api.request<{ data: CriteriaItem[] }>({
        method: 'POST',
        path: `issues/${issueId}/criteria/propose`,
        data: { criteria },
      });
      return res.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  return {
    ...query,
    criteria: query.data ?? [],
    saveCriteria,
    proposeCriteria,
  };
}

export function useProjectDefaultCriteria(projectId: string | undefined) {
  const api = useApiClient();
  const queryClient = useQueryClient();
  const queryKey = ['project-default-criteria', projectId];

  const query = useQuery({
    queryKey,
    enabled: Boolean(projectId),
    queryFn: async ({ signal }) => {
      const res = await api.request<{ data: CriteriaItem[] }>({
        path: `projects/${projectId}/defaultCriteria`,
        signal,
      });
      return res.data;
    },
  });

  const saveDefaultCriteria = useMutation({
    mutationFn: async (criteria: CriteriaItem[]) => {
      const res = await api.request<{ data: CriteriaItem[] }>({
        method: 'PUT',
        path: `projects/${projectId}/defaultCriteria`,
        data: { criteria },
      });
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(queryKey, data);
    },
  });

  return {
    ...query,
    defaultCriteria: query.data ?? [],
    saveDefaultCriteria,
  };
}
