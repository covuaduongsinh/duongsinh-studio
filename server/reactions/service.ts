import { randomUUID } from 'node:crypto';
import type { DatabaseConnection } from '@nocobase/db';
import type { RunAttempt } from '@nocobase/app-plugin-projects/server/tokens';
import type { AgentWaker } from '../providers/agent-executor.js';
import { str, num } from '../git/rows.js';

/** What Studio reacts to by itself (plan T, T1). */
export type ReactionEvent =
  | 'ciFailed'
  | 'conflicts'
  | 'reviewChanges'
  | 'runFailed'
  | 'prLineComment'
  | 'greenAndApproved';

export const REACTION_EVENTS: readonly ReactionEvent[] = [
  'ciFailed',
  'conflicts',
  'reviewChanges',
  'runFailed',
  'prLineComment',
  'greenAndApproved',
];

export interface ReactionRule {
  readonly projectId: string | null;
  readonly event: ReactionEvent;
  readonly enabled: boolean;
  /** Attempts for one push (one head sha). */
  readonly maxAttempts: number;
  /** Attempts for the whole issue; past it a person decides. */
  readonly maxPerIssue: number;
  readonly action: 'wake' | 'notify';
}

/** Used for any event without a stored rule: 2 attempts per push and 5 per issue (Q1), a conflict once. */
export const DEFAULT_REACTION_RULES: readonly ReactionRule[] = [
  { event: 'ciFailed', maxAttempts: 2 },
  { event: 'conflicts', maxAttempts: 1 },
  { event: 'reviewChanges', maxAttempts: 2 },
  { event: 'runFailed', maxAttempts: 2 },
  { event: 'prLineComment', maxAttempts: 2 },
  { event: 'greenAndApproved', maxAttempts: 1 },
].map((rule) => ({
  projectId: null,
  enabled: true,
  maxPerIssue: 5,
  action: 'wake' as const,
  ...rule,
})) as ReactionRule[];

export interface ReactionAttempt {
  readonly id: string;
  readonly issueId: string;
  readonly projectId: string | null;
  readonly event: ReactionEvent;
  readonly headSha: string;
  readonly attempt: number;
  readonly runId: string | null;
  readonly createdAt: Date;
}

export interface ReactionContext {
  readonly issueId: string;
  readonly projectId: string | null;
  readonly pullRequestId?: string | null;
  /** The pull request's head (or the run, for `runFailed`): one reaction group per value. */
  readonly headSha: string;
  /** What the agent is told. */
  readonly text: string;
}

export type ReactionOutcome =
  | {
      readonly outcome: 'woke';
      readonly runId: string | null;
      readonly attempt: number;
    }
  | { readonly outcome: 'escalated'; readonly reason: string }
  | { readonly outcome: 'disabled' }
  | { readonly outcome: 'skipped'; readonly reason: string };

export interface ReactionStore {
  rules(
    projectId: string | null,
    event: ReactionEvent,
  ): Promise<ReactionRule[]>;
  /** The attempts on an issue for an event; for one head when `headSha` is given. */
  attemptsFor(
    issueId: string,
    event: ReactionEvent,
    headSha?: string,
  ): Promise<ReactionAttempt[]>;
  record(attempt: ReactionAttempt): Promise<void>;
  /** Moves the issue to `blocked` with `needsYou`, comments, records the event and tells the owners. */
  escalate(input: {
    readonly issueId: string;
    readonly projectId: string | null;
    readonly pullRequestId?: string | null;
    readonly event: ReactionEvent;
    readonly reason: string;
  }): Promise<void>;
  issueState(issueId: string): Promise<{ statusKey: string } | null>;
}

export interface ReactionService {
  react(
    event: ReactionEvent,
    context: ReactionContext,
  ): Promise<ReactionOutcome>;
}

export function createReactionService(deps: {
  readonly store: ReactionStore;
  readonly waker: Pick<AgentWaker, 'wakeIssue'>;
  readonly now?: () => Date;
  /** Told of every wake, for the issue page and the log; its failure never undoes the wake. */
  readonly onWoke?: (
    event: ReactionEvent,
    context: ReactionContext,
    attempt: number,
  ) => Promise<void>;
}): ReactionService {
  const { store, waker } = deps;
  const now = deps.now ?? (() => new Date());

  const ruleFor = async (
    projectId: string | null,
    event: ReactionEvent,
  ): Promise<ReactionRule> => {
    const stored = await store.rules(projectId, event);
    const own = stored.find(
      (rule) => rule.projectId === projectId && projectId,
    );
    const global = stored.find((rule) => rule.projectId === null);
    return (
      own ??
      global ??
      DEFAULT_REACTION_RULES.find((rule) => rule.event === event)!
    );
  };

  return {
    async react(event, context) {
      const rule = await ruleFor(context.projectId, event);
      if (!rule.enabled || rule.action !== 'wake')
        return { outcome: 'disabled' };
      const issue = await store.issueState(context.issueId);
      if (!issue || issue.statusKey !== 'in_progress')
        return { outcome: 'skipped', reason: 'notInProgress' };

      const onIssue = await store.attemptsFor(context.issueId, event);
      const onHead = onIssue.filter((a) => a.headSha === context.headSha);
      if (
        onHead.length >= rule.maxAttempts ||
        onIssue.length >= rule.maxPerIssue
      ) {
        const reason =
          onIssue.length >= rule.maxPerIssue
            ? `${event}: ${onIssue.length} lượt tự sửa trên việc này vẫn chưa xong (trần ${rule.maxPerIssue}).`
            : `${event}: ${onHead.length} lượt tự sửa trên cùng một lần đẩy vẫn chưa xong (trần ${rule.maxAttempts}).`;
        await store.escalate({
          issueId: context.issueId,
          projectId: context.projectId,
          pullRequestId: context.pullRequestId ?? null,
          event,
          reason,
        });
        return { outcome: 'escalated', reason };
      }

      const attempt: RunAttempt | null = await waker.wakeIssue({
        issueId: context.issueId,
        text: context.text,
      });
      if (!attempt?.started)
        return { outcome: 'skipped', reason: attempt?.skipped ?? 'noAgent' };
      const number = onHead.length + 1;
      await store.record({
        id: randomUUID(),
        issueId: context.issueId,
        projectId: context.projectId,
        event,
        headSha: context.headSha,
        attempt: number,
        runId: attempt.runId ?? null,
        createdAt: now(),
      });
      await deps
        .onWoke?.(event, context, number)
        .catch((error: unknown) =>
          console.warn('A reaction could not be logged', error),
        );
      return { outcome: 'woke', runId: attempt.runId ?? null, attempt: number };
    },
  };
}

type Row = Record<string, unknown>;

/**
 * The store on the application's database. `escalate` is given by the caller because it posts, notifies and records an
 * autopilot event, which need services this file does not know.
 */
export function createDatabaseReactionStore(deps: {
  readonly conn: () => DatabaseConnection;
  readonly escalate: ReactionStore['escalate'];
}): ReactionStore {
  const { conn } = deps;
  return {
    async rules(projectId, event) {
      let query = conn()
        .query.selectFrom('dsReactionRules')
        .selectAll()
        .where('event', '=', event);
      query = projectId
        ? query.where((eb) =>
            eb.or([
              eb('projectId', '=', projectId),
              eb('projectId', 'is', null),
            ]),
          )
        : query.where('projectId', 'is', null);
      return (await query.execute()).map((row: Row) => ({
        projectId: row.projectId ? str(row.projectId) : null,
        event: str(row.event) as ReactionEvent,
        enabled: Boolean(row.enabled),
        maxAttempts: num(row.maxAttempts),
        maxPerIssue: num(row.maxPerIssue),
        action: str(row.action) === 'notify' ? 'notify' : 'wake',
      }));
    },
    async attemptsFor(issueId, event, headSha) {
      let query = conn()
        .query.selectFrom('dsReactionAttempts')
        .selectAll()
        .where('issueId', '=', issueId)
        .where('event', '=', event);
      if (headSha !== undefined) query = query.where('headSha', '=', headSha);
      return (await query.orderBy('createdAt', 'asc').execute()).map(
        (row: Row) => ({
          id: str(row.id),
          issueId: str(row.issueId),
          projectId: row.projectId ? str(row.projectId) : null,
          event: str(row.event) as ReactionEvent,
          headSha: str(row.headSha),
          attempt: num(row.attempt),
          runId: row.runId ? str(row.runId) : null,
          createdAt: new Date(str(row.createdAt)),
        }),
      );
    },
    async record(attempt) {
      await conn()
        .query.insertInto('dsReactionAttempts')
        .values({ ...attempt })
        .execute();
    },
    escalate: deps.escalate,
    async issueState(issueId) {
      const row = await conn()
        .query.selectFrom('pmIssues')
        .select('statusKey')
        .where('id', '=', issueId)
        .executeTakeFirst();
      return row ? { statusKey: str(row.statusKey) } : null;
    },
  };
}
