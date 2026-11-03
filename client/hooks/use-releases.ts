/**
 * Releases (`server/routes/deploys.ts`): Dương Sinh's recorded environments, versions from tags, where each issue is,
 * and the marks and requests that say what runs on staging and production.
 */
import { useApiClient } from '@nocobase/app-client';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

export type EnvironmentKey = 'preview' | 'staging' | 'production';
export type IssueWhere = 'merged' | 'released' | 'staging' | 'production';
export type DeploymentKind = 'deployed' | 'rolledBack';

export interface ReleaseEnvironment {
  readonly key: string;
  readonly name: string;
  readonly purpose: string;
  readonly runsOn: string;
  readonly recordOnly: boolean;
  readonly protected: boolean;
  readonly approvers: readonly string[];
  readonly maxApps: number | null;
  readonly idleStopMinutes: number | null;
  readonly removeOnClose: boolean;
  readonly publicUrlPattern: string | null;
  readonly description: string | null;
}

export interface ReleaseLine {
  readonly repositoryId: string;
  readonly branch: string;
  readonly pattern: string;
  readonly stripPrefix: string | null;
  readonly syncedAt: string | null;
  readonly syncError: string | null;
}

interface VersionRef {
  readonly id: string;
  readonly tag: string;
}

export interface ReleaseProject {
  readonly project: { readonly id: string; readonly name: string };
  readonly repositories: readonly {
    readonly id: string;
    readonly repo: string;
    readonly line: ReleaseLine;
    readonly latest: VersionRef | null;
    readonly staging: VersionRef | null;
    readonly production: VersionRef | null;
    readonly pendingCount: number;
    readonly versionCount: number;
  }[];
}

export interface ReleaseVersion {
  readonly id: string;
  readonly repositoryId: string;
  readonly repo: string;
  readonly tag: string;
  readonly version: string;
  readonly sha: string;
  readonly committedAt: string | null;
  readonly taskCount: number;
  readonly issueIds: readonly string[];
  readonly deleted: boolean;
  readonly current: { readonly staging: boolean; readonly production: boolean };
  readonly reached: { readonly staging: boolean; readonly production: boolean };
}

export interface IssueDeploymentMark {
  readonly issueId: string;
  readonly where: IssueWhere;
  readonly repositoryId: string;
  readonly version: VersionRef | null;
  readonly staging: { readonly tag: string; readonly at: string } | null;
  readonly production: { readonly tag: string; readonly at: string } | null;
  readonly mergedAt: string | null;
  readonly pullRequest: { readonly number: number; readonly url: string } | null;
  readonly issue: {
    readonly id: string;
    readonly identifier: string;
    readonly title: string;
    readonly projectId: string | null;
    readonly statusKey: string;
  } | null;
}

export interface DeploymentRequest {
  readonly id: string;
  readonly repositoryId: string;
  readonly repo: string;
  readonly versionId: string;
  readonly tag: string;
  readonly environmentKey: string;
  readonly kind: DeploymentKind;
  readonly appId: string;
  readonly note: string;
  readonly requestedById: string;
  readonly status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  readonly decisionNote: string | null;
  readonly createdAt: string;
}

export interface ReleasesMe {
  readonly userId: string;
  readonly owner: boolean;
  readonly admin: boolean;
  readonly deployer: boolean;
}

export const releaseKeys = {
  all: ['ds-releases'] as const,
  me: ['ds-releases', 'me'] as const,
  environments: ['ds-releases', 'environments'] as const,
  projects: ['ds-releases', 'projects'] as const,
  versions: (projectId: string | null) => ['ds-releases', 'versions', projectId] as const,
  pending: (projectId: string | null) => ['ds-releases', 'pending', projectId] as const,
  marks: (issueIds: readonly string[]) => ['ds-releases', 'marks', issueIds.join(',')] as const,
  requests: (awaitingMe: boolean) => ['ds-releases', 'requests', awaitingMe] as const,
  request: (id: string) => ['ds-releases', 'request', id] as const,
};

const read = <T>(api: ReturnType<typeof useApiClient>, path: string, signal?: AbortSignal, query?: Record<string, string>) =>
  api.request<{ data: T }>({ path, signal, ...(query ? { query } : {}) }).then((answer) => answer.data);

export function useReleasesMe(): UseQueryResult<ReleasesMe> {
  const api = useApiClient();
  return useQuery({ queryKey: releaseKeys.me, queryFn: ({ signal }) => read<ReleasesMe>(api, 'deploys/me', signal) });
}

export function useReleaseEnvironments(): UseQueryResult<ReleaseEnvironment[]> {
  const api = useApiClient();
  return useQuery({
    queryKey: releaseKeys.environments,
    queryFn: ({ signal }) => read<ReleaseEnvironment[]>(api, 'deploys/environments', signal),
  });
}

export function useReleaseProjects(): UseQueryResult<ReleaseProject[]> {
  const api = useApiClient();
  return useQuery({
    queryKey: releaseKeys.projects,
    queryFn: ({ signal }) => read<ReleaseProject[]>(api, 'deploys/releases', signal),
  });
}

export function useReleaseVersions(projectId: string | null): UseQueryResult<ReleaseVersion[]> {
  const api = useApiClient();
  return useQuery({
    queryKey: releaseKeys.versions(projectId),
    queryFn: ({ signal }) =>
      read<ReleaseVersion[]>(api, 'deploys/versions', signal, projectId ? { projectId } : undefined),
  });
}

export function usePendingRelease(projectId: string | null): UseQueryResult<IssueDeploymentMark[]> {
  const api = useApiClient();
  return useQuery({
    queryKey: releaseKeys.pending(projectId),
    queryFn: ({ signal }) =>
      read<IssueDeploymentMark[]>(api, 'deploys/pending', signal, projectId ? { projectId } : undefined),
  });
}

/** Where these issues are; nothing is asked for an empty list. */
export function useIssueMarks(issueIds: readonly string[]): UseQueryResult<IssueDeploymentMark[]> {
  const api = useApiClient();
  return useQuery({
    queryKey: releaseKeys.marks(issueIds),
    enabled: issueIds.length > 0,
    queryFn: ({ signal }) =>
      read<IssueDeploymentMark[]>(api, 'deploys/marks', signal, { issueIds: issueIds.join(',') }),
  });
}

export function useDeploymentRequests(awaitingMe: boolean): UseQueryResult<DeploymentRequest[]> {
  const api = useApiClient();
  return useQuery({
    queryKey: releaseKeys.requests(awaitingMe),
    queryFn: ({ signal }) =>
      read<DeploymentRequest[]>(api, 'deploys/requests', signal, awaitingMe ? { awaitingMe: 'true' } : undefined),
  });
}

export function useDeploymentRequest(id: string): UseQueryResult<DeploymentRequest> {
  const api = useApiClient();
  return useQuery({
    queryKey: releaseKeys.request(id),
    queryFn: ({ signal }) => read<DeploymentRequest>(api, `deploys/requests/${id}`, signal),
  });
}

function useReleaseMutation<I, O = unknown>(
  build: (input: I) => { readonly path: string; readonly json: unknown },
): UseMutationResult<O, unknown, I> {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: I) => {
      const { path, json } = build(input);
      return (await api.request<{ data: O }>({ path, method: 'POST', json })).data;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: releaseKeys.all }),
  });
}

export interface MarkInput {
  readonly versionId: string;
  readonly environmentKey: 'staging' | 'production';
  readonly kind: DeploymentKind;
  readonly note: string;
}

/** Marks a version on staging (an administrator) or production (the owner). */
export function useMarkVersion(): UseMutationResult<{ reopenSuggestions: string[] }, unknown, MarkInput> {
  return useReleaseMutation<MarkInput, { reopenSuggestions: string[] }>((input) => ({
    path: `deploys/versions/${input.versionId}/marks`,
    json: { environmentKey: input.environmentKey, kind: input.kind, note: input.note },
  }));
}

/** Asks the owner to mark a version on production. */
export function useRequestProduction(): UseMutationResult<DeploymentRequest, unknown, { versionId: string; note: string }> {
  return useReleaseMutation<{ versionId: string; note: string }, DeploymentRequest>((input) => ({
    path: `deploys/versions/${input.versionId}/requests`,
    json: { note: input.note },
  }));
}

export function useSyncReleaseLine(): UseMutationResult<{ added: string[]; deleted: string[] }, unknown, string> {
  return useReleaseMutation<string, { added: string[]; deleted: string[] }>((repositoryId) => ({
    path: `deploys/repositories/${repositoryId}/sync`,
    json: {},
  }));
}

export function useDecideRequest(): UseMutationResult<
  unknown,
  unknown,
  { id: string; approve: boolean; confirmAppId?: string; note?: string }
> {
  return useReleaseMutation((input: { id: string; approve: boolean; confirmAppId?: string; note?: string }) => ({
    path: `deploys/requests/${input.id}/${input.approve ? 'approve' : 'reject'}`,
    json: input.approve
      ? { confirmAppId: input.confirmAppId ?? '', ...(input.note ? { note: input.note } : {}) }
      : { note: input.note ?? '' },
  }));
}
