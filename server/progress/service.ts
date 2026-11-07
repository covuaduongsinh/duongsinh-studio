import { createHash } from 'node:crypto';

/** What an issue waits for now, from structured facts first: runs, pull requests, then the issue's own fields. */
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

export interface ProgressRun {
  readonly id: string;
  readonly agentId: string;
  readonly status: string;
  readonly createdAt: string;
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
  readonly runnerName?: string | null;
}

export interface ProgressPull {
  readonly number: number;
  readonly url: string | null;
  readonly state: string;
  readonly ciState: string | null;
}

export interface ProgressFacts {
  readonly statusKey: string;
  readonly needsYou: string | null;
  readonly next: string | null;
  readonly executorIsManager: boolean;
  readonly managerHasWorked: boolean;
  readonly runs: readonly ProgressRun[];
  readonly pulls: readonly ProgressPull[];
  readonly undecidedFailedRunId: string | null;
  readonly commentRunsHeld: boolean;
  readonly agentName: (agentId: string) => string;
  readonly step: string | null;
  readonly explanationCommentId: string | null;
}

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
  readonly explanationCommentId: string | null;
  readonly next: string | null;
  readonly handOver: boolean;
}

const FINISHED = new Set(['done', 'cancelled', 'canceled', 'closed']);
const HELD = new Set(['running', 'dispatched']);

export function isFinishedStatus(statusKey: string): boolean {
  return FINISHED.has(statusKey);
}

/** The first line of a hand-over, as the demo's `step` shows it. */
export function stepOf(text: string | null | undefined): string | null {
  const line = text
    ?.split('\n')
    .map((part) => part.trim())
    .find((part) => part.length > 0 && !part.startsWith('[@'));
  return line ? viSystemLine(line).slice(0, 200) : null;
}

/**
 * The sentences the executor and the runner plugin write for the agent are English (the agent reads them), but the
 * progress line is for people. Known ones are shown in Vietnamese; anything else, a person's words included, is untouched.
 */
const SYSTEM_LINES: readonly [RegExp, (match: RegExpMatchArray) => string][] = [
  [
    /^(\S+) is in progress: work on it\.$/,
    (m) => `${m[1]} đang thực hiện: hãy làm việc này.`,
  ],
  [
    /^(\S+) was handed to you while in progress: work on it\.$/,
    (m) => `${m[1]} được giao cho bạn khi đang thực hiện: hãy làm việc này.`,
  ],
  [
    /^Nothing holds (\S+) any more: work on it\.$/,
    (m) => `Không còn gì chặn ${m[1]}: hãy làm việc này.`,
  ],
  [
    /^Retry the work of the previous run\.$/,
    () => 'Thử lại việc của lượt chạy trước.',
  ],
];

function viSystemLine(line: string): string {
  for (const [pattern, render] of SYSTEM_LINES) {
    const match = line.match(pattern);
    if (match) return render(match);
  }
  return line;
}

export function computeProgress(facts: ProgressFacts): IssueProgress {
  const held = facts.runs.find((run) => HELD.has(run.status));
  const queued = facts.runs.find((run) => run.status === 'queued');
  const open = facts.pulls.find((pull) => pull.state === 'open');
  const shown = open ?? facts.pulls[0];
  const finished = isFinishedStatus(facts.statusKey);
  const current = held ?? queued;

  let state: ProgressState;
  if (finished) state = 'finished';
  else if (held) state = 'working';
  else if (queued) state = 'queued';
  else if (facts.undecidedFailedRunId) state = 'needsDecision';
  else if (facts.commentRunsHeld) state = 'waitingForContinuation';
  else if (facts.statusKey === 'in_review') state = 'inReview';
  else if (facts.needsYou) state = 'needsDecision';
  else if (open?.ciState === 'pending') state = 'checksPending';
  else if (facts.statusKey === 'backlog') state = 'notStarted';
  else state = 'idle';

  return {
    state,
    agent: current
      ? { id: current.agentId, name: facts.agentName(current.agentId) }
      : null,
    step: current ? facts.step : null,
    since: held?.startedAt ?? held?.createdAt ?? queued?.createdAt ?? null,
    runner: held?.runnerName ?? null,
    pullRequest: shown ? { number: shown.number, url: shown.url } : null,
    needsYou: facts.needsYou,
    explanationCommentId: facts.explanationCommentId,
    next: facts.next,
    handOver:
      !finished && (!facts.executorIsManager || !facts.managerHasWorked),
  };
}

/** The newest failed run of each agent that nothing newer of that agent followed and nobody has answered. */
export function undecidedFailedRun(
  runs: readonly ProgressRun[],
  decided: ReadonlySet<string>,
): string | null {
  const newestFirst = [...runs].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
  const seenAgents = new Set<string>();
  for (const run of newestFirst) {
    if (seenAgents.has(run.agentId)) continue;
    seenAgents.add(run.agentId);
    if (run.status === 'failed' && !decided.has(run.id)) return run.id;
  }
  return null;
}

/** A stable token for something a person answers once: a UUID-shaped digest of what it is about. */
export function decisionToken(kind: string, id: string): string {
  const hex = createHash('sha1').update(`${kind}:${id}`).digest('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `5${hex.slice(13, 16)}`,
    `a${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join('-');
}
