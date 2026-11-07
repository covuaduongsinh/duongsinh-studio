/** Setting a project up in one step, and the skills new projects start with (`server/routes/project-setups.ts`). */
import { useApiClient } from '@nocobase/app-client';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

export interface GitConnectionChoice {
  readonly id: string;
  readonly name: string;
  readonly account: string | null;
}

export type ProjectInitChoice =
  | { readonly method: 'empty' }
  | { readonly method: 'prompt'; readonly prompt: string }
  | { readonly method: 'nocobase' };

export type ProjectSetupInput = {
  readonly name: string;
  readonly description?: string;
} & (
  | { readonly codeLocation: 'none' }
  | {
      readonly codeLocation: 'existingRepo';
      readonly existingRepo: {
        readonly connectionId: string;
        readonly fullName: string;
        readonly cloneUrl: string;
        readonly defaultBranch: string;
        readonly init: ProjectInitChoice;
      };
    }
  | {
      readonly codeLocation: 'newRepo';
      readonly newRepo: {
        readonly connectionId: string;
        readonly name: string;
        readonly private: boolean;
        readonly init: ProjectInitChoice;
      };
      /** Studio's own check on the new repository's pull requests, committed with the person's token. */
      readonly ci?: { readonly workflow: 'ds-check' };
    }
);

export interface ProjectSetupAnswer {
  readonly data: {
    readonly projectId: string;
    /** Why a deploy or CI choice was not applied; the project exists either way. */
    readonly deployError?: string | null;
  };
  readonly meta?: { readonly message?: string };
}

export function useGitConnectionChoices(): UseQueryResult<
  readonly GitConnectionChoice[]
> {
  const api = useApiClient();
  return useQuery({
    queryKey: ['git-status'],
    retry: false,
    queryFn: async ({ signal }) =>
      (
        await api.request<{
          data: { connections: GitConnectionChoice[] };
        }>({ path: 'git/status', signal })
      ).data.connections,
  });
}

export interface AppTemplateChoice {
  readonly packageName: string;
  readonly version: string;
}

/** The template and version a NocoBase project starts from, as this installation names them. */
export function useProjectSetupTemplate(
  enabled: boolean,
): UseQueryResult<AppTemplateChoice> {
  const api = useApiClient();
  return useQuery({
    queryKey: ['project-setup-template'],
    enabled,
    retry: false,
    staleTime: Infinity,
    queryFn: async ({ signal }) =>
      (
        await api.request<{ data: AppTemplateChoice }>({
          path: 'projectSetupTemplate',
          signal,
        })
      ).data,
  });
}

export function useProjectSetup(): UseMutationResult<
  ProjectSetupAnswer,
  unknown,
  ProjectSetupInput
> {
  const api = useApiClient();
  return useMutation({
    mutationFn: (json) =>
      api.request<ProjectSetupAnswer>({
        method: 'POST',
        path: 'projectSetups',
        json,
      }),
  });
}

export function useConnectPersonalToken(): UseMutationResult<
  unknown,
  unknown,
  { readonly connectionId: string; readonly token: string }
> {
  const api = useApiClient();
  return useMutation({
    mutationFn: ({ connectionId, token }) =>
      api.request({
        method: 'POST',
        path: `git/authorizations/${connectionId}/useToken`,
        json: { token },
      }),
  });
}

export interface LibrarySkill {
  readonly id: string;
  readonly slug: string;
  readonly description: string;
}

const DEFAULT_SKILLS = ['project-default-skills'] as const;

export function useSkillLibrary(): UseQueryResult<readonly LibrarySkill[]> {
  const api = useApiClient();
  return useQuery({
    queryKey: ['skill-library'],
    queryFn: async ({ signal }) =>
      (
        await api.request<{ data: LibrarySkill[] }>({
          path: 'agents/skills',
          signal,
        })
      ).data,
  });
}

export function useProjectDefaultSkills(): UseQueryResult<readonly string[]> {
  const api = useApiClient();
  return useQuery({
    queryKey: DEFAULT_SKILLS,
    queryFn: async ({ signal }) =>
      (
        await api.request<{ data: { skillIds: string[] } }>({
          path: 'projectDefaultSkills',
          signal,
        })
      ).data.skillIds,
  });
}

export function useSetProjectDefaultSkills(): UseMutationResult<
  unknown,
  unknown,
  readonly string[]
> {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (skillIds) =>
      api.request({
        method: 'PUT',
        path: 'projectDefaultSkills',
        json: { skillIds },
      }),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: DEFAULT_SKILLS });
    },
  });
}
