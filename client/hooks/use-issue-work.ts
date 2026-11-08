/** What an issue's work waits for and the decisions about it (`server/routes/issue-work.ts`). */
import { useApiClient } from '@nocobase/app-client';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

export type ProgressState =
  | 'working'
  | 'queued'
  | 'checksPending'
  | 'needsDecision'
  | 'waitingForContinuation'
  | 'inReview'
  | 'notStarted'
  | 'finished'
  | 'idle';

export interface IssueProgress {
  readonly state: ProgressState;
  readonly agent: { readonly id: string; readonly name: string } | null;
  readonly step: string | null;
  readonly since: string | null;
  readonly runner: string | null;
  readonly pullRequest: {
    readonly number: number;
    readonly url: string | null;
  } | null;
  readonly needsYou: string | null;
  readonly next: string | null;
  readonly handOver: boolean;
  readonly failedRunId: string | null;
}

export interface OwnerHandoff {
  readonly handoff: {
    readonly waiting: boolean;
    readonly ownerUserId: string;
    readonly previousOwnerUserId: string;
    readonly notificationKey: string;
    readonly transferredAt: string;
    readonly rejectedAt: string | null;
  } | null;
  readonly canDecide: boolean;
}

export interface CommentRunLimit {
  readonly token: string;
  readonly maxRuns: number;
  readonly windowHours: number;
}

export interface IssuePanels {
  readonly progress: IssueProgress;
  readonly ownerHandoff: OwnerHandoff;
  readonly commentRunLimit: CommentRunLimit | null;
}

export interface IssueRun {
  readonly id: string;
  readonly agent: string;
  readonly status: string;
  readonly trigger: string | null;
  readonly attempt: number;
  readonly createdAt: string;
  /** Null until a runner starts it. */
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
  readonly summary: string;
  readonly failureReason: string | null;
  readonly failure: string;
}

export interface IssueRunEvent {
  readonly seq: number;
  readonly at: string;
  readonly type: string;
  readonly tool: string | null;
  readonly text: string;
}

export interface AgentBoardRow {
  readonly agentId: string;
  readonly state: 'waiting' | 'working' | 'queued' | 'idle';
  readonly run: {
    readonly since: string;
    readonly runnerName: string | null;
    readonly lastActivity: { readonly text: string | null } | null;
  } | null;
  readonly queue: {
    readonly reason: string;
    readonly position: number | null;
    readonly until: string | null;
    readonly params?: Readonly<Record<string, unknown>>;
  } | null;
  readonly waiting: {
    readonly kind: string;
    readonly viewerDecides: boolean;
    readonly detail: string | null;
  } | null;
  readonly idle: {
    readonly reason: string;
    readonly mayStart: boolean;
  } | null;
  readonly issue: {
    readonly id: string;
    readonly identifier: string;
    readonly title: string;
  };
  readonly mine: boolean;
}

export interface AgentBoard {
  readonly rows: readonly AgentBoardRow[];
  readonly agents: Readonly<Record<string, { readonly name: string }>>;
  readonly summary: {
    readonly waiting: number;
    readonly working: number;
    readonly queued: number;
    readonly idle: number;
  };
}

const keys = {
  panels: (issueId: string) => ['issues', issueId, 'panels'] as const,
  runs: (issueId: string) => ['issues', issueId, 'runs'] as const,
  events: (runId: string) => ['runs', runId, 'events'] as const,
  board: (filters: unknown) => ['agent-board', filters] as const,
};

/** Polled while the page is open: nothing else tells the page a run moved on. */
const REFRESH_MS = 15_000;

export function useIssuePanels(issueId: string): UseQueryResult<IssuePanels> {
  const api = useApiClient();
  return useQuery({
    queryKey: keys.panels(issueId),
    queryFn: async ({ signal }) =>
      (
        await api.request<{ data: IssuePanels }>({
          path: `issuePanels/${issueId}`,
          signal,
        })
      ).data,
    refetchInterval: REFRESH_MS,
  });
}

export function useIssueRuns(
  issueId: string,
): UseQueryResult<readonly IssueRun[]> {
  const api = useApiClient();
  return useQuery({
    queryKey: keys.runs(issueId),
    queryFn: async ({ signal }) =>
      (
        await api.request<{ data: readonly IssueRun[] }>({
          path: 'issueRuns',
          query: { issue: issueId, pageSize: 50 },
          signal,
        })
      ).data,
    refetchInterval: REFRESH_MS,
  });
}

export function useRunEvents(
  runId: string | null,
): UseQueryResult<readonly IssueRunEvent[]> {
  const api = useApiClient();
  return useQuery({
    queryKey: keys.events(runId ?? ''),
    queryFn: async ({ signal }) =>
      (
        await api.request<{ data: readonly IssueRunEvent[] }>({
          path: `issueRuns/${runId ?? ''}/events`,
          query: { pageSize: 200 },
          signal,
        })
      ).data,
    enabled: Boolean(runId),
  });
}

export function useAgentBoard(
  filters: Readonly<Record<string, string | undefined>>,
): UseQueryResult<AgentBoard> {
  const api = useApiClient();
  return useQuery({
    queryKey: keys.board(filters),
    queryFn: async ({ signal }) =>
      (
        await api.request<{ data: AgentBoard }>({
          path: 'agentBoard',
          query: Object.fromEntries(
            Object.entries(filters).filter(([, value]) => Boolean(value)),
          ),
          signal,
        })
      ).data,
    refetchInterval: REFRESH_MS,
  });
}

/**
 * Reads an issue's panels and runs again. The agents plugin's own run hooks (stop, retry) refresh the plugin's cache, not
 * this one, so the page calls this when they settle.
 */
export function useRefreshIssueRuns(issueId: string): () => void {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: keys.panels(issueId) });
    void queryClient.invalidateQueries({ queryKey: keys.runs(issueId) });
  };
}

/** A write about one issue, after which its panels, runs and the page's own record are read again. */
function useIssueWrite<Input, Output>(
  issueId: string,
  write: (input: Input) => { path: string; json?: unknown },
  onDone?: () => void,
): UseMutationResult<Output, unknown, Input> {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: Input) => {
      const request = write(input);
      return (
        await api.request<{ data: Output }>({
          method: 'POST',
          path: request.path,
          json: request.json ?? {},
        })
      ).data;
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: keys.panels(issueId) });
      void queryClient.invalidateQueries({ queryKey: keys.runs(issueId) });
      onDone?.();
    },
  });
}

export function useDecideFailedRun(issueId: string, onDone?: () => void) {
  return useIssueWrite<
    { runId: string; action: 'retry' | 'reassign' | 'cancel' },
    { outcome: string }
  >(
    issueId,
    ({ runId, action }) => ({
      path: `failedRuns/${runId}/decide`,
      json: { action },
    }),
    onDone,
  );
}

export function useContinueCommentRuns(issueId: string, onDone?: () => void) {
  return useIssueWrite<{ token: string }, { runIds: readonly string[] }>(
    issueId,
    ({ token }) => ({
      path: `issueCommentRuns/${issueId}/continue`,
      json: { token },
    }),
    onDone,
  );
}

export function useDecideHandoff(issueId: string, onDone?: () => void) {
  return useIssueWrite<
    { decision: 'accept' | 'reject'; notificationKey: string },
    unknown
  >(
    issueId,
    ({ decision, notificationKey }) => ({
      path: `issueOwnerHandoffs/${issueId}/${decision}`,
      json: { notificationKey },
    }),
    onDone,
  );
}

export function useSendBack(issueId: string, onDone?: () => void) {
  return useIssueWrite<
    { revision: number; content: string },
    { commentId: string }
  >(issueId, (json) => ({ path: `issues/${issueId}/sendBack`, json }), onDone);
}

export function useHandToManager(issueId: string, onDone?: () => void) {
  return useIssueWrite<void, { runId: string | null }>(
    issueId,
    () => ({ path: `projectManager/issues/${issueId}/start` }),
    onDone,
  );
}

export function useStartOnBoard(): UseMutationResult<
  { started: boolean; skipped: string | null },
  unknown,
  string
> {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (issueId: string) =>
      (
        await api.request<{
          data: { started: boolean; skipped: string | null };
        }>({
          method: 'POST',
          path: `agentBoard/issues/${issueId}/start`,
          json: {},
        })
      ).data,
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['agent-board'] });
    },
  });
}
