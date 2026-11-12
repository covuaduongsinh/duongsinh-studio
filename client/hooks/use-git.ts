/**
 * The application's git API (`server/routes/git.ts`): connections to GitHub, linked repositories, a project's code
 * locations, and pull requests with their checks and merge. Every read and change goes through `useApiClient`; the
 * server decides who may do what and answers refusals as standard API errors.
 */
import { ApiClientError, useApiClient } from '@nocobase/app-client';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

/** A GitHub App connection's App: never its key or webhook secret. */
export interface GitApp {
  readonly appId: string;
  readonly slug: string;
  readonly htmlUrl: string;
  readonly ownerLogin: string | null;
  readonly installUrl: string;
  readonly installationId: string | null;
  readonly installationAccount: string | null;
  readonly permissionsUrl: string | null;
  /** `name:level` Studio needs and the installation does not grant. */
  readonly missingPermissions: readonly string[];
  readonly webhookUrl: string | null;
  readonly lastDeliveryAt: string | null;
  readonly lastEvent: string | null;
  readonly lastError: string | null;
}

export interface GitConnection {
  readonly id: string;
  readonly provider: 'github';
  readonly kind: 'token' | 'app';
  readonly name: string;
  readonly account: string | null;
  readonly webUrl: string;
  readonly apiBaseUrl: string;
  /** A token is kept (sealed), or an App is installed; a token or key never comes back. */
  readonly hasToken: boolean;
  readonly webhooks?: boolean;
  readonly problems: readonly string[];
  readonly usedBy: number;
  readonly app?: GitApp | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Where the browser posts the GitHub App manifest (form field `manifest`). */
export interface GitAppManifestStart {
  readonly connectionId: string;
  readonly postUrl: string;
  readonly manifest: Readonly<Record<string, unknown>>;
  readonly expiresAt: string;
}

export interface GitRepository {
  readonly id: string;
  readonly connectionId: string;
  readonly provider: 'github';
  /** `owner/name`. */
  readonly repo: string;
  readonly cloneUrl: string;
  readonly webUrl: string;
  readonly defaultBranch: string;
  readonly branchPrefix: string;
  readonly polledAt: string | null;
  readonly pollError: string | null;
  readonly projects: readonly {
    readonly projectId: string;
    readonly isPrimary: boolean;
  }[];
}

export interface GitCheck {
  readonly kind: 'checkRun' | 'status';
  readonly name: string;
  readonly status: string;
  readonly conclusion: string | null;
  readonly outcome: 'pending' | 'success' | 'failure';
  readonly url: string | null;
  /** How long a reported check ran (the longest of them is the CI time); absent for checks read from the host. */
  readonly durationMs?: number | null;
}

export const MERGE_BLOCKERS = [
  'merged',
  'closed',
  'draft',
  'conflicts',
  'computing',
  'ciPending',
  'ciFailed',
  'ciMissing',
  'protected',
] as const;

export type MergeBlocker = (typeof MERGE_BLOCKERS)[number];

/** The blockers "Merge anyway" overrides: the checks, not the pull request's own state. */
export const FORCEABLE_BLOCKERS: readonly MergeBlocker[] = [
  'ciPending',
  'ciFailed',
  'ciMissing',
];

export interface GitPullRequest {
  readonly id: string;
  readonly repositoryId: string;
  readonly repo: string;
  readonly number: number;
  readonly url: string;
  readonly title: string;
  readonly state: 'open' | 'closed' | 'merged';
  readonly draft: boolean;
  readonly headRef: string;
  readonly baseRef: string;
  readonly mergeability: 'clean' | 'conflicts' | 'blocked' | 'unknown';
  readonly ciState: 'pending' | 'success' | 'failure' | null;
  readonly checks: readonly GitCheck[];
  readonly issueId: string | null;
  readonly autoCompleteDisabled: boolean;
  readonly mergedAt: string | null;
  readonly mergeForcedReason: string | null;
  readonly mergeBlocker: MergeBlocker | null;
  readonly updatedAt: string;
}

export interface NewGitConnection {
  readonly name: string;
  readonly token: string;
}

export interface NewGitRepository {
  readonly connectionId: string;
  /** `owner/name`. */
  readonly repo: string;
}

export interface MergeRequest {
  readonly pullRequestId: string;
  readonly force: boolean;
  readonly reason?: string;
}

export const gitKeys = {
  all: ['ds-git'] as const,
  connections: ['ds-git', 'connections'] as const,
  repositories: ['ds-git', 'repositories'] as const,
  pullRequests: (issueId: string) =>
    ['ds-git', 'pullRequests', issueId] as const,
};

/** `owner/name` as the server accepts it. */
export const REPOSITORY_NAME = /^[\w.-]+\/[\w.-]+$/u;

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null;
}

/** The `metadata` of a standard API error body, when the error carries one. */
function errorMetadata(
  error: unknown,
): Readonly<Record<string, unknown>> | undefined {
  if (!(error instanceof ApiClientError) || !isRecord(error.payload))
    return undefined;
  const body = error.payload.error;
  return isRecord(body) && isRecord(body.metadata) ? body.metadata : undefined;
}

/** Why the server refused a merge (`MERGE_BLOCKED`, `metadata.mergeBlocker`), or null for any other failure. */
export function mergeBlockerOf(error: unknown): MergeBlocker | null {
  const blocker = errorMetadata(error)?.mergeBlocker;
  return MERGE_BLOCKERS.find((entry) => entry === blocker) ?? null;
}

/** The refusal's `reason`, such as `GIT_TOKEN_REJECTED`, for the page to word in the reader's language. */
export function errorReason(error: unknown): string | undefined {
  return error instanceof ApiClientError ? error.reason : undefined;
}

export function isForbidden(error: unknown): boolean {
  return error instanceof ApiClientError && error.status === 403;
}

export function useGitConnections(): UseQueryResult<GitConnection[]> {
  const api = useApiClient();
  return useQuery({
    queryKey: gitKeys.connections,
    queryFn: async ({ signal }) =>
      (
        await api.request<{ data: GitConnection[] }>({
          path: 'git/connections',
          signal,
        })
      ).data,
  });
}

export function useGitRepositories(): UseQueryResult<GitRepository[]> {
  const api = useApiClient();
  return useQuery({
    queryKey: gitKeys.repositories,
    queryFn: async ({ signal }) =>
      (
        await api.request<{ data: GitRepository[] }>({
          path: 'git/repositories',
          signal,
        })
      ).data,
  });
}

export function useIssuePullRequests(
  issueId: string,
): UseQueryResult<GitPullRequest[]> {
  const api = useApiClient();
  return useQuery({
    queryKey: gitKeys.pullRequests(issueId),
    queryFn: async ({ signal }) =>
      (
        await api.request<{ data: GitPullRequest[] }>({
          path: 'git/pullRequests',
          query: { issueId },
          signal,
        })
      ).data,
  });
}

/** What an issue's pull requests come to, for a list row. */
export interface PullMark {
  readonly count: number;
  readonly merged: boolean;
  readonly state: 'open' | 'merged' | 'closed';
  readonly ciState: 'pending' | 'success' | 'failure' | null;
  readonly url: string;
}

/** The pull request marks of several issues in one read (`GET git/pullRequests/marks`). */
export function usePullRequestMarks(
  issueIds: readonly string[],
): UseQueryResult<Readonly<Record<string, PullMark>>> {
  const api = useApiClient();
  const ids = issueIds.slice(0, 100);
  return useQuery({
    queryKey: ['git', 'pull-marks', ids],
    enabled: ids.length > 0,
    retry: false,
    queryFn: async ({ signal }) =>
      (
        await api.request<{ data: Record<string, PullMark> }>({
          path: 'git/pullRequests/marks',
          query: { issueIds: ids.join(',') },
          signal,
        })
      ).data,
  });
}

export function useCreateGitConnection(): UseMutationResult<
  GitConnection,
  unknown,
  NewGitConnection
> {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: NewGitConnection) =>
      (
        await api.request<{ data: GitConnection }>({
          path: 'git/connections',
          method: 'POST',
          json: { name: input.name, token: input.token },
        })
      ).data,
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: gitKeys.connections }),
  });
}

/** Starts making a GitHub App: Studio answers the manifest; `submitAppManifest` sends the browser to GitHub with it. */
export function useStartGitApp(): UseMutationResult<
  GitAppManifestStart,
  unknown,
  { readonly organization?: string }
> {
  const api = useApiClient();
  return useMutation({
    mutationFn: async (input: { readonly organization?: string }) =>
      (
        await api.request<{ data: GitAppManifestStart }>({
          path: 'git/connections/startAppManifest',
          method: 'POST',
          json: input.organization ? { organization: input.organization } : {},
        })
      ).data,
  });
}

/** Posts the manifest to GitHub as a form, as GitHub's manifest flow requires; the page leaves for github.com. */
export function submitAppManifest(start: GitAppManifestStart): void {
  const form = document.createElement('form');
  form.method = 'post';
  form.action = start.postUrl;
  form.hidden = true;
  const field = document.createElement('input');
  field.type = 'hidden';
  field.name = 'manifest';
  field.value = JSON.stringify(start.manifest);
  form.append(field);
  document.body.append(form);
  form.submit();
}

/** Finishes making a GitHub App with the one-time `code` and `state` GitHub sent back. */
export function useCompleteGitApp(): UseMutationResult<
  GitConnection,
  unknown,
  { readonly code: string; readonly state: string }
> {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      readonly code: string;
      readonly state: string;
    }) =>
      (
        await api.request<{ data: GitConnection }>({
          path: 'git/connections/appManifest/complete',
          method: 'POST',
          json: { code: input.code, state: input.state },
        })
      ).data,
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: gitKeys.connections }),
  });
}

/** Records the App's installation (`installationId` from GitHub, else its only one) and reads its permissions again. */
export function useSetGitAppInstallation(): UseMutationResult<
  GitConnection,
  unknown,
  { readonly connectionId: string; readonly installationId?: string }
> {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      readonly connectionId: string;
      readonly installationId?: string;
    }) =>
      (
        await api.request<{ data: GitConnection }>({
          path: `git/connections/${encodeURIComponent(input.connectionId)}/installation`,
          method: 'POST',
          json: input.installationId
            ? { installationId: input.installationId }
            : {},
        })
      ).data,
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: gitKeys.connections }),
  });
}

export function useDeleteGitConnection(): UseMutationResult<
  void,
  unknown,
  string
> {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (connectionId: string) => {
      await api.request({
        path: `git/connections/${encodeURIComponent(connectionId)}`,
        method: 'DELETE',
      });
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: gitKeys.connections }),
  });
}

export function useLinkGitRepository(): UseMutationResult<
  GitRepository,
  unknown,
  NewGitRepository
> {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: NewGitRepository) =>
      (
        await api.request<{ data: GitRepository }>({
          path: 'git/repositories',
          method: 'POST',
          json: { connectionId: input.connectionId, repo: input.repo },
        })
      ).data,
    onSettled: () => queryClient.invalidateQueries({ queryKey: gitKeys.all }),
  });
}

export function useAttachRepository(
  projectId: string,
): UseMutationResult<
  GitRepository,
  unknown,
  { readonly repositoryId: string; readonly primary: boolean }
> {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input) =>
      (
        await api.request<{ data: GitRepository }>({
          path: `projects/${encodeURIComponent(projectId)}/codeLocations`,
          method: 'POST',
          json: { repositoryId: input.repositoryId, primary: input.primary },
        })
      ).data,
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: gitKeys.repositories }),
  });
}

/** Proposes the pull request check to a project's primary repository: a pull request with the caller's own token. */
export function useProposeCi(projectId: string): UseMutationResult<
  {
    readonly branch: string;
    readonly pullRequest: { readonly number: number; readonly url: string };
  },
  unknown,
  void
> {
  const api = useApiClient();
  return useMutation({
    mutationFn: async () =>
      (
        await api.request<{
          data: {
            branch: string;
            pullRequest: { number: number; url: string };
          };
        }>({
          path: `projectSetups/${encodeURIComponent(projectId)}/ci`,
          method: 'POST',
          json: {},
        })
      ).data,
  });
}

export function useRefreshPullRequest(
  issueId: string,
): UseMutationResult<GitPullRequest, unknown, string> {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (pullRequestId: string) =>
      (
        await api.request<{ data: GitPullRequest }>({
          path: `git/pullRequests/${encodeURIComponent(pullRequestId)}/refresh`,
          method: 'POST',
        })
      ).data,
    onSettled: () =>
      queryClient.invalidateQueries({
        queryKey: gitKeys.pullRequests(issueId),
      }),
  });
}

export function useMergePullRequest(
  issueId: string,
): UseMutationResult<GitPullRequest, unknown, MergeRequest> {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ pullRequestId, force, reason }: MergeRequest) =>
      (
        await api.request<{ data: GitPullRequest }>({
          path: `git/pullRequests/${encodeURIComponent(pullRequestId)}/merge`,
          method: 'POST',
          json: force ? { force, reason } : { force },
        })
      ).data,
    onSettled: () =>
      queryClient.invalidateQueries({
        queryKey: gitKeys.pullRequests(issueId),
      }),
  });
}

/** Records a pull request merged outside Studio (`POST git/pullRequests/:id/markMerged`; the server checks who may). */
export function useMarkPullRequestMerged(
  issueId: string,
): UseMutationResult<
  GitPullRequest,
  unknown,
  { readonly pullRequestId: string }
> {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ pullRequestId }) =>
      (
        await api.request<{ data: GitPullRequest }>({
          path: `git/pullRequests/${encodeURIComponent(pullRequestId)}/markMerged`,
          method: 'POST',
          json: {},
        })
      ).data,
    onSettled: () =>
      queryClient.invalidateQueries({
        queryKey: gitKeys.pullRequests(issueId),
      }),
  });
}

export function useSetPullAutoComplete(
  issueId: string,
): UseMutationResult<
  GitPullRequest,
  unknown,
  { readonly pullRequestId: string; readonly autoCompleteDisabled: boolean }
> {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ pullRequestId, autoCompleteDisabled }) =>
      (
        await api.request<{ data: GitPullRequest }>({
          path: `git/pullRequests/${encodeURIComponent(pullRequestId)}`,
          method: 'PATCH',
          json: { autoCompleteDisabled },
        })
      ).data,
    onSettled: () =>
      queryClient.invalidateQueries({
        queryKey: gitKeys.pullRequests(issueId),
      }),
  });
}
