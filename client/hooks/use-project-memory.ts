/**
 * Project memory (`server/routes/project-memory.ts`): the `.nb-studio/memory/*.md` files of each project's
 * repositories, read by the server from the default branch. Read-only.
 */
import { useApiClient } from '@nocobase/app-client';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

export const MEMORY_TYPES = ['feedback', 'project', 'reference'] as const;
export type MemoryType = (typeof MEMORY_TYPES)[number];

/** Why a repository could not be read now. */
export type MemoryUnavailable =
  'noToken' | 'tokenRejected' | 'unreachable' | 'hostUnavailable';

export interface ProjectMemoryProject {
  readonly project: { readonly id: string; readonly name: string };
  readonly repos: readonly {
    readonly id: string;
    readonly name: string;
    readonly provider: 'github';
    readonly defaultBranch: string;
    readonly memories: number;
    readonly ref: string | null;
    readonly checkedAt: string | null;
    readonly unavailable: MemoryUnavailable | null;
  }[];
}

export interface MemorySummary {
  readonly path: string;
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly type: MemoryType | null;
  readonly modified: string | null;
  readonly size: number;
  readonly oversize: boolean;
  readonly problems: readonly string[];
  readonly webUrl: string;
}

export interface RepositoryMemory {
  readonly project: { readonly id: string; readonly name: string };
  readonly repositoryId: string;
  readonly repo: string;
  readonly branch: string;
  readonly commitSha: string | null;
  readonly ref: string | null;
  readonly checkedAt: string | null;
  readonly limit: number;
  readonly total: number;
  readonly webUrl: string;
  readonly memories: readonly MemorySummary[];
  readonly unavailable: MemoryUnavailable | null;
}

export interface MemoryFile extends MemorySummary {
  readonly body: string;
  readonly ref: string;
}

const keys = {
  list: ['ds-memory', 'list'] as const,
  repository: (projectId: string, repoId: string) =>
    ['ds-memory', 'repository', projectId, repoId] as const,
  file: (projectId: string, repoId: string, path: string) =>
    ['ds-memory', 'file', projectId, repoId, path] as const,
};

export function useProjectMemoryList(): UseQueryResult<ProjectMemoryProject[]> {
  const api = useApiClient();
  return useQuery({
    queryKey: keys.list,
    queryFn: async ({ signal }) =>
      (
        await api.request<{ data: ProjectMemoryProject[] }>({
          path: 'projectMemory',
          signal,
        })
      ).data,
  });
}

export function useRepositoryMemory(
  projectId: string | null,
  repoId: string | null,
): UseQueryResult<RepositoryMemory> {
  const api = useApiClient();
  return useQuery({
    queryKey: keys.repository(projectId ?? '', repoId ?? ''),
    enabled: Boolean(projectId && repoId),
    queryFn: async ({ signal }) =>
      (
        await api.request<{ data: RepositoryMemory }>({
          path: `projectMemory/${projectId ?? ''}/repos/${repoId ?? ''}`,
          signal,
        })
      ).data,
  });
}

export function useMemoryFile(
  projectId: string | null,
  repoId: string | null,
  path: string | null,
): UseQueryResult<MemoryFile> {
  const api = useApiClient();
  return useQuery({
    queryKey: keys.file(projectId ?? '', repoId ?? '', path ?? ''),
    enabled: Boolean(projectId && repoId && path),
    queryFn: async ({ signal }) =>
      (
        await api.request<{ data: MemoryFile }>({
          path: `projectMemory/${projectId ?? ''}/repos/${repoId ?? ''}/file`,
          query: { path: path ?? '' },
          signal,
        })
      ).data,
  });
}
