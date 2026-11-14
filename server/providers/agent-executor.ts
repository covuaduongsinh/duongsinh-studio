import { runPriorityOf } from '../agents/run-priority.js';
import type { BudgetService } from '../budgets/service.js';
import { budgetServiceToken } from './outbound.js';
import type { Application } from '@nocobase/app-server/application';
import type { GitService } from '../git/service.js';
import type { GitHubCheck } from '../git/github.js';
import type { CiState } from '../git/pull-state.js';
import {
  evaluatePreReviewGate,
  REVIEW_PARALLEL_WITH_CI,
} from '../gates/pre-review.js';
import { gitServiceToken } from './git.js';
import { str, num } from '../git/rows.js';
import { scanSecrets } from '../security/secret-patterns.js';
import type { SecretFindingsService } from '../security/service.js';
import { secretFindingsServiceToken } from './security.js';
import { parsePlaybookInvocations } from '../playbooks/parser.js';
import { applyPlaybookToIssue } from '../playbooks/service.js';
import {
  agentsToken,
  type Agents,
  type NewInput,
  type Tx as AgentsTx,
} from '@nocobase/app-plugin-agents/server/tokens';
import type { Agent } from '@nocobase/app-plugin-agents/shared/agents';
import type { Run } from '@nocobase/app-plugin-agents/shared/runs';
import {
  DomainError,
  projectsKindsToken,
  projectsToken,
  type Actor,
  type IssueWorkHandler,
  type PrincipalKind,
  type Projects,
  type ProjectsTx,
  type RunAttempt,
  type WorkWithdrawal,
} from '@nocobase/app-plugin-projects/server/tokens';
import type { Issue } from '@nocobase/app-plugin-projects/shared/issues';
import {
  BACKLOG_STATUS,
  BLOCKED_STATUS,
  CANCELLED_STATUS,
  DONE_STATUS,
  IN_PROGRESS_STATUS,
  IN_REVIEW_STATUS,
} from '@nocobase/app-plugin-projects/shared/statuses';
import type { DatabaseConnection } from '@nocobase/db';
import {
  ServiceProvider,
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';
import {
  AGENT_KIND,
  ISSUE_SUBJECT,
  PROJECT_MANAGER_ID,
  appText,
} from '../agents/ids.js';
import { readProjectManagerSettings } from '../agents/project-manager-settings.js';

/** The window the project manager's `commentRunLimit` counts in. */
const COMMENT_RUN_WINDOW_MS = 24 * 60 * 60 * 1000;

/** The moves an agent may make: between working, waiting for a person and waiting for acceptance. */
const AGENT_MOVES = [
  { from: IN_PROGRESS_STATUS, to: BLOCKED_STATUS },
  { from: IN_PROGRESS_STATUS, to: IN_REVIEW_STATUS },
  { from: BLOCKED_STATUS, to: IN_PROGRESS_STATUS },
  { from: BLOCKED_STATUS, to: IN_REVIEW_STATUS },
  { from: IN_REVIEW_STATUS, to: IN_PROGRESS_STATUS },
  { from: IN_REVIEW_STATUS, to: BLOCKED_STATUS },
] as const;

function agentOf(issue: Issue | null): string | null {
  return issue?.executor?.type === AGENT_KIND ? issue.executor.id : null;
}

/** What wakes an agent, as `RunAttempt.triggerType` and the run input's `payload.trigger`. */
type Trigger =
  | 'statusChange'
  | 'assigned'
  | 'comment'
  | 'mention'
  | 'unblocked'
  | 'reaction';

/**
 * Wakes the agent working on an issue from outside the projects hooks (T1: a red CI, a conflict, a review comment). It
 * goes through the same `wake()` the hooks use, so a dormant, blocked or over-budget issue is left alone.
 */
export interface AgentWaker {
  /** Null when the issue does not exist or has no agent as its executor. */
  wakeIssue(input: {
    readonly issueId: string;
    readonly text: string;
  }): Promise<RunAttempt | null>;
}

export const agentWakerToken: ServiceToken<AgentWaker> =
  createServiceToken<AgentWaker>('app/agent-waker');

interface Wake {
  readonly issue: Issue;
  readonly agentId: string;
  readonly trigger: Trigger;
  readonly type: NewInput['type'];
  readonly actor: Actor;
  /** The person whose action woke the agent; left out for the system, so the issue's owner is the source. */
  readonly requestedByUserId?: string;
  readonly text: string;
  readonly commentId?: string;
  readonly readOnly?: boolean;
}

/**
 * The `agent` executor kind: an issue's executor may be an enabled agent, and its work handler wakes that agent (and
 * the agents a comment mentions or answers) through `agents.runs.enqueue`, inside the projects change's transaction.
 */
export function createAgentKind(deps: {
  readonly agents: Agents;
  readonly projects: Projects;
  readonly budgets: () => BudgetService;
  readonly git?: () => GitService;
  readonly secrets?: () => SecretFindingsService;
  /** Hands out the waker once the kind exists. */
  readonly exposeWaker?: (waker: AgentWaker) => void;
}): PrincipalKind {
  const { agents, projects } = deps;

  /** The agents plugin's unit of work on the projects change's connection; its events wait for the commit. */
  const unitOf = (tx: ProjectsTx): AgentsTx => ({
    conn: tx.conn,
    emit: (event) => tx.conn.afterCommit(() => agents.events.emit(event)),
  });

  const enabled = async (
    conn: DatabaseConnection,
    id: string,
  ): Promise<Agent | null> => {
    const agent = await agents.agents.find(conn, id);
    return agent?.status === 'enabled' ? agent : null;
  };

  /** The agents people may give work to: those that take work now, and the project manager even before it does. */
  const offered = async (conn: DatabaseConnection): Promise<Agent[]> => {
    const active = await agents.agents.listActive(conn);
    const manager = await enabled(conn, PROJECT_MANAGER_ID);
    return manager && !active.some((agent) => agent.id === manager.id)
      ? [manager, ...active]
      : active;
  };

  const actorRef = async (
    conn: DatabaseConnection,
    actor: Actor,
  ): Promise<NewInput['actor']> => {
    if (actor.id && actor.type === 'user') {
      const names = await projects.kinds.names(conn, 'user', [actor.id]);
      return {
        kind: 'user',
        id: actor.id,
        name: names.get(actor.id) ?? actor.id,
      };
    }
    if (actor.id && actor.type === AGENT_KIND) {
      const names = await agents.agents.names(conn, [actor.id]);
      return {
        kind: 'agent',
        id: actor.id,
        name: names.get(actor.id) ?? actor.id,
      };
    }
    return { kind: 'system', id: 'system', name: 'System' };
  };

  /** Runs principals' comments started on the issue in the last day. */
  const principalRuns = async (
    conn: DatabaseConnection,
    issueId: string,
  ): Promise<number> => {
    const grant = await conn.query
      .selectFrom('dsCommentRunGrants')
      .select('continuedAt')
      .where('issueId', '=', issueId)
      .executeTakeFirst();
    // Counted from the owner's last "continue" (`issueCommentRuns`), within the window.
    const since = new Date(
      Math.max(
        Date.now() - COMMENT_RUN_WINDOW_MS,
        grant?.continuedAt
          ? new Date(grant.continuedAt as string | Date).getTime()
          : 0,
      ),
    );
    const inputs = await agents.runs.inputsSince(
      conn,
      { kind: ISSUE_SUBJECT, id: issueId },
      since,
    );
    return inputs.filter((input) => input.payload.byPrincipal === true).length;
  };

  async function wake(tx: ProjectsTx, work: Wake): Promise<RunAttempt> {
    const { issue, agentId, trigger } = work;
    const attempt = (
      outcome: Pick<RunAttempt, 'started' | 'skipped' | 'runId'>,
    ): RunAttempt => ({
      kind: AGENT_KIND,
      principalId: agentId,
      subjectId: issue.id,
      triggerType: trigger,
      ...outcome,
    });
    const finished =
      issue.statusKey === DONE_STATUS || issue.statusKey === CANCELLED_STATUS;
    if (issue.statusKey === BACKLOG_STATUS || finished)
      return attempt({ started: false, skipped: 'dormant' });
    if ((await projects.subtasks.blockersOf(tx.conn, issue)).length > 0)
      return attempt({ started: false, skipped: 'blocked' });
    if (!(await agents.agents.findWorkable(tx.conn, agentId)))
      return attempt({ started: false, skipped: 'unavailable' });
    const byPrincipal = work.actor.type !== 'user';
    if (
      byPrincipal &&
      (work.type === 'comment' || trigger === 'mention') &&
      (await principalRuns(tx.conn, issue.id)) >=
        (await readProjectManagerSettings(tx.conn)).commentRunLimit
    )
      return attempt({ started: false, skipped: 'limited' });
    if (tx.rehearsal) return attempt({ started: true });
    if (
      await deps.budgets().blocking(tx.conn, {
        agentId,
        projectId: issue.projectId ?? null,
      })
    )
      return attempt({ started: false, skipped: 'limited' });
    const isReadOnly = Boolean(
      work.readOnly || (work.text && /mode:\s*read-only/i.test(work.text)),
    );
    if (isReadOnly && deps.git) {
      const openPr = await tx.conn.query
        .selectFrom('dsPullRequests')
        .selectAll()
        .where('issueId', '=', issue.id)
        .where('state', '=', 'open')
        .executeTakeFirst();
      if (openPr) {
        const git = deps.git();
        let checks: Array<Pick<GitHubCheck, 'name' | 'outcome'>> = [];
        if (Array.isArray(openPr.checks)) {
          checks = openPr.checks as Array<
            Pick<GitHubCheck, 'name' | 'outcome'>
          >;
        } else if (typeof openPr.checks === 'string') {
          try {
            const parsed: unknown = JSON.parse(openPr.checks);
            if (Array.isArray(parsed)) {
              checks = parsed as Array<Pick<GitHubCheck, 'name' | 'outcome'>>;
            }
          } catch {
            // ignore malformed stored json
          }
        }
        const prId = str(openPr.id);
        const prNumber = num(openPr.number);
        const prCiState =
          typeof openPr.ciState === 'string'
            ? (openPr.ciState as CiState)
            : undefined;
        let changedFiles: string[] = [];
        let patch = '';
        try {
          changedFiles = await git.pullFiles(prId);
          patch = await git.pullPatch(prId);
        } catch {
          // If git host reading fails, changedFiles and patch stay empty
        }
        const gate = evaluatePreReviewGate({
          pull: {
            number: prNumber,
            ciState: prCiState,
          },
          checks,
          changedFiles,
          patch,
          allowPendingCi: REVIEW_PARALLEL_WITH_CI,
        });
        if (!gate.passed) {
          const commentLines = [
            `Cổng xác định trước review chưa đạt (PR #${prNumber}):`,
            ...gate.reasons.map((r) => `- ${r}`),
            'Lượt review bị hủy để tiết kiệm tài nguyên.',
          ];
          try {
            await projects.comments.post(
              { type: 'system', id: null },
              issue.id,
              { content: commentLines.join('\n') },
              { outer: tx },
            );
          } catch {
            // Safe fallback if comments.post cannot write in this context
          }
          return attempt({ started: false, skipped: 'limited' });
        }
      }
    }
    const causedByRunId =
      work.actor.type === AGENT_KIND ? work.actor.trace?.runId : undefined;
    const result = await agents.runs.enqueue(
      {
        agentId,
        subject: { kind: ISSUE_SUBJECT, id: issue.id },
        priority: runPriorityOf(issue.priority),
        responsibleUserId: issue.ownerUserId,
        ...(causedByRunId
          ? { causedByRunId }
          : work.requestedByUserId
            ? { requestedByUserId: work.requestedByUserId }
            : {}),
        input: {
          type: work.type,
          actor: await actorRef(tx.conn, work.actor),
          text: work.text,
          payload: {
            trigger,
            issueId: issue.id,
            identifier: issue.identifier,
            byPrincipal,
            ...(work.commentId ? { commentId: work.commentId } : {}),
            ...(work.readOnly ? { mode: 'read-only' } : {}),
          },
        },
      },
      unitOf(tx),
    );
    return result.outcome === 'pending'
      ? attempt({ started: false, skipped: 'waitingOwner' })
      : attempt({ started: true, runId: result.runId });
  }

  deps.exposeWaker?.({
    async wakeIssue({ issueId, text }) {
      const row = await projects.tx
        .read()
        .query.selectFrom('pmIssues')
        .selectAll()
        .where('id', '=', issueId)
        .where('deletedAt', 'is', null)
        .executeTakeFirst();
      if (!row || str(row.executorType) !== AGENT_KIND || !row.executorId)
        return null;
      // `wake()` reads only these fields of the issue; the rest is not needed to decide or to enqueue.
      const issue = {
        id: str(row.id),
        identifier: str(row.identifier),
        statusKey: str(row.statusKey),
        priority: str(row.priority),
        ownerUserId: str(row.ownerUserId),
        projectId: row.projectId ? str(row.projectId) : null,
        executor: { type: AGENT_KIND, id: str(row.executorId) },
      } as unknown as Issue;
      return projects.tx.run((tx) =>
        wake(tx, {
          issue,
          agentId: str(row.executorId),
          trigger: 'reaction',
          type: 'statusChange',
          actor: { type: 'system', id: null },
          text,
        }),
      );
    },
  });

  /** Takes back the issue's queued work, of one agent or of every one; work a runner holds goes on. */
  const withdraw = (
    tx: ProjectsTx,
    issue: Issue,
    detail: string,
    agentId?: string,
  ): Promise<Run[]> =>
    agents.runs.withdrawQueued(
      {
        subject: { kind: ISSUE_SUBJECT, id: issue.id },
        ...(agentId ? { agentId } : {}),
        byUserId: null,
        detail,
      },
      unitOf(tx),
    );

  const userOf = (actor: Actor): string | undefined =>
    actor.type === 'user' && actor.id ? actor.id : undefined;

  const work: IssueWorkHandler = {
    observesIssueChanges: true,
    observesComments: true,

    async onIssueChanged(tx, { before, after, actor }) {
      if (
        deps.secrets &&
        after.description &&
        (!before || before.description !== after.description)
      ) {
        const matches = scanSecrets(after.description);
        if (matches.length > 0) {
          try {
            await deps.secrets().recordFindings({
              issueId: after.id,
              commentId: null,
              matches,
              ownerUserId: after.ownerUserId,
              issueIdentifier: after.identifier,
            });
          } catch (error) {
            console.warn('Failed to record secret findings for issue:', error);
          }
        }
      }

      const previous = agentOf(before);
      const next = agentOf(after);
      if (!tx.rehearsal) {
        if (previous && previous !== next)
          await withdraw(
            tx,
            after,
            'The issue has another executor now.',
            previous,
          );
        if (
          before?.statusKey === IN_PROGRESS_STATUS &&
          after.statusKey !== IN_PROGRESS_STATUS
        )
          await withdraw(tx, after, `The issue moved to ${after.statusKey}.`);
      }
      if (!next) return [];
      const assigned = next !== previous;
      const entered =
        after.statusKey === IN_PROGRESS_STATUS &&
        before?.statusKey !== IN_PROGRESS_STATUS;
      const requestedByUserId = userOf(actor);
      if (entered || (assigned && after.statusKey === IN_PROGRESS_STATUS))
        return [
          await wake(tx, {
            issue: after,
            agentId: next,
            trigger: entered ? 'statusChange' : 'assigned',
            type: 'statusChange',
            actor,
            ...(requestedByUserId ? { requestedByUserId } : {}),
            text: entered
              ? `${after.identifier} is in progress: work on it.`
              : `${after.identifier} was handed to you while in progress: work on it.`,
          }),
        ];
      if (assigned && after.statusKey === BACKLOG_STATUS)
        return [
          {
            kind: AGENT_KIND,
            principalId: next,
            subjectId: after.id,
            triggerType: 'assigned',
            started: false,
            skipped: 'dormant',
          },
        ];
      return [];
    },

    async onCommentCreated(
      tx,
      { comment, issue, parent, actor, userId, mentions },
    ) {
      if (deps.secrets && comment.content) {
        const matches = scanSecrets(comment.content);
        if (matches.length > 0) {
          try {
            await deps.secrets().recordFindings({
              issueId: issue.id,
              commentId: comment.id,
              matches,
              ownerUserId: issue.ownerUserId,
              issueIdentifier: issue.identifier,
            });
          } catch (error) {
            console.warn(
              'Failed to record secret findings for comment:',
              error,
            );
          }
        }
      }

      if (comment.content) {
        const invocations = parsePlaybookInvocations(comment.content);
        for (const inv of invocations) {
          try {
            const result = await applyPlaybookToIssue(tx.conn, {
              issueId: issue.id,
              slug: inv.slug,
              params: inv.params,
              commentId: comment.id,
              userId,
            });
            if (!result.success && result.reason === 'NOT_FOUND') {
              await projects.comments.post(
                { type: 'system', id: null },
                issue.id,
                { content: result.message },
                { outer: tx },
              );
            }
          } catch (error) {
            console.warn('Failed to apply playbook invocation:', error);
          }
        }
      }

      // Each agent the comment concerns, once: those it mentions, the agent whose comment it answers, the executor.
      const targets = new Map<string, Trigger>();
      for (const mention of mentions)
        if (mention.kind === AGENT_KIND) targets.set(mention.id, 'mention');
      if (
        parent?.authorType === AGENT_KIND &&
        parent.authorId &&
        !targets.has(parent.authorId)
      )
        targets.set(parent.authorId, 'comment');
      const executor = agentOf(issue);
      // Only auto-wake executor if comment is from a real user, or if explicitly mentioned.
      // Do not auto-wake executor on agent comments to prevent idle/empty loop wakeups between agents.
      if (actor.type === 'user' && executor && !targets.has(executor)) {
        targets.set(executor, 'comment');
      }
      const author = actor.type === AGENT_KIND ? actor.id : null;
      const readOnly = /mode:\s*read-only/i.test(comment.content);
      const attempts: RunAttempt[] = [];
      for (const [agentId, trigger] of targets) {
        if (agentId === author) continue;
        attempts.push(
          await wake(tx, {
            issue,
            agentId,
            trigger,
            type: 'comment',
            actor,
            ...(userId ? { requestedByUserId: userId } : {}),
            text: `${trigger === 'mention' ? 'You were mentioned in' : 'New comment on'} ${issue.identifier} (${comment.id}).`,
            commentId: comment.id,
            ...(readOnly ? { readOnly: true } : {}),
          }),
        );
      }
      return attempts;
    },

    async onUnblocked(tx, { issue, actor }) {
      const agentId = agentOf(issue);
      if (!agentId || issue.statusKey !== IN_PROGRESS_STATUS) return [];
      const requestedByUserId = actor ? userOf(actor) : undefined;
      return [
        await wake(tx, {
          issue,
          agentId,
          trigger: 'unblocked',
          type: 'signal',
          actor: actor ?? { type: 'system', id: null },
          ...(requestedByUserId ? { requestedByUserId } : {}),
          text: `Nothing holds ${issue.identifier} any more: work on it.`,
        }),
      ];
    },

    async onBlocked(tx, { issue }) {
      const withdrawal = (run: Run): WorkWithdrawal => ({
        kind: AGENT_KIND,
        principalId: run.agentId,
        subjectId: issue.id,
        runId: run.id,
        reason: 'blocked',
      });
      if (tx.rehearsal)
        return (
          await agents.runs.openOn(tx.conn, {
            kind: ISSUE_SUBJECT,
            id: issue.id,
          })
        )
          .filter((run) => run.status === 'queued')
          .map(withdrawal);
      return (
        await withdraw(tx, issue, 'The issue waits for unfinished issues.')
      ).map(withdrawal);
    },
  };

  return {
    key: AGENT_KIND,
    title: appText('studioAgents.kinds.agent'),
    names: (conn, ids) => agents.agents.names(conn, ids),
    executor: {
      async require(conn, id) {
        if (!(await enabled(conn, id)))
          throw new DomainError(
            'invalid',
            'INVALID_EXECUTOR',
            'The executor is not an enabled agent.',
          );
      },
      canKeep: async (conn, id) => (await enabled(conn, id)) !== null,
      candidates: async (conn) =>
        (await offered(conn)).map((agent) => agent.id),
      describe: async (conn, ids) => {
        const described = [];
        for (const id of ids) {
          const agent = await agents.agents.find(conn, id);
          if (agent)
            described.push({
              id,
              name: agent.name,
              ...(agent.nameText ? { nameText: agent.nameText } : {}),
            });
        }
        return described;
      },
    },
    mention: {
      async candidates(conn, { q, limit }) {
        const query = q.trim().toLowerCase();
        return (await offered(conn))
          .filter((agent) => !query || agent.name.toLowerCase().includes(query))
          .slice(0, limit)
          .map((agent) => ({
            kind: AGENT_KIND,
            id: agent.id,
            name: agent.name,
            ...(agent.nameText ? { nameText: agent.nameText } : {}),
          }));
      },
      mayMention: async (conn, id) => (await enabled(conn, id)) !== null,
    },
    moves: AGENT_MOVES,
    // An agent moves only the issues it executes. Moving to in_review requires passing verifications.
    mayMove: async (conn, actor, move) => {
      if (actor.type !== AGENT_KIND) return true;
      if (
        move.issue.executor?.type !== AGENT_KIND ||
        move.issue.executor.id !== actor.id
      ) {
        return false;
      }
      if (move.to === IN_REVIEW_STATUS) {
        const criteria = await conn.query
          .selectFrom('dsIssueCriteria')
          .select('id')
          .where('issueId', '=', move.issue.id)
          .execute();
        if (criteria.length === 0) return false;

        const latestVerification = await conn.query
          .selectFrom('dsVerifications')
          .selectAll()
          .where('issueId', '=', move.issue.id)
          .orderBy('createdAt', 'desc')
          .executeTakeFirst();
        if (!latestVerification || latestVerification.result !== 'passed') {
          return false;
        }

        const openPr = await conn.query
          .selectFrom('dsPullRequests')
          .select('headSha')
          .where('issueId', '=', move.issue.id)
          .where('state', '=', 'open')
          .executeTakeFirst();
        if (openPr?.headSha && latestVerification.headSha !== openPr.headSha) {
          return false;
        }
      }
      return true;
    },
    defaultExecutor: async (conn) =>
      (await enabled(conn, PROJECT_MANAGER_ID)) ? PROJECT_MANAGER_ID : null,
    work,
  };
}

/** Registers the `agent` kind with the projects plugin. */
export default class AgentExecutorProvider extends ServiceProvider<Application> {
  readonly name = 'app/agent-executor';
  private release?: () => void;

  override async boot(): Promise<void> {
    const { container } = this.app;
    if (!container.has(agentsToken) || !container.has(projectsToken)) return;
    let waker: AgentWaker | undefined;
    container.singleton(agentWakerToken, () => ({
      wakeIssue: async (input) => (waker ? waker.wakeIssue(input) : null),
    }));
    this.release = container.resolve(projectsKindsToken).add(
      createAgentKind({
        exposeWaker: (value) => {
          waker = value;
        },
        agents: container.resolve(agentsToken),
        projects: container.resolve(projectsToken),
        budgets: () => container.resolve(budgetServiceToken),
        git: container.has(gitServiceToken)
          ? () => container.resolve(gitServiceToken)
          : undefined,
        secrets: () => container.resolve(secretFindingsServiceToken),
      }),
    );
  }

  override async shutdown(): Promise<void> {
    this.release?.();
    this.release = undefined;
  }
}
