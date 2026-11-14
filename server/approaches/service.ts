import { randomUUID } from 'node:crypto';
import type { Agents } from '@nocobase/app-plugin-agents/server/tokens';
import type { DatabaseConnection } from '@nocobase/db';
import { str } from '../git/rows.js';
import type { AgentWaker } from '../providers/agent-executor.js';
import { comparisonText, pickTwoProviders } from './pick.js';

export class ApproachError extends Error {
  constructor(
    readonly reason:
      | 'NEED_TWO_PROVIDERS'
      | 'NOT_STARTED'
      | 'ISSUE_NOT_FOUND'
      | 'ISSUE_FINISHED',
    message: string,
    readonly metadata: Record<string, string> = {},
  ) {
    super(message);
  }
}

const ENDED = ['completed', 'failed', 'cancelled'];

/**
 * Two approaches for one issue, on request only (Q8): two agents of different providers each write an approach in
 * read-only mode, and when both runs have ended the agent that holds the issue is asked to compare them and choose with a
 * reason. Both runs count in the budgets like any run; no code is changed meanwhile.
 */
export function createTwoApproachesService(deps: {
  readonly conn: () => DatabaseConnection;
  readonly agents: () => Agents;
  readonly waker: () => AgentWaker;
  readonly now?: () => Date;
}) {
  const now = () => (deps.now ? deps.now() : new Date());

  async function start(
    issueId: string,
    userId: string,
  ): Promise<{ agentId: string; agentName: string; runId: string }[]> {
    const conn = deps.conn();
    const issue = await conn.query
      .selectFrom('pmIssues')
      .select(['id', 'title', 'identifier', 'statusKey', 'executorId'])
      .where('id', '=', issueId)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();
    if (!issue)
      throw new ApproachError('ISSUE_NOT_FOUND', `Issue ${issueId} not found.`);
    if (['done', 'cancelled', 'closed'].includes(str(issue.statusKey)))
      throw new ApproachError('ISSUE_FINISHED', 'The issue is finished.');
    const chooser = issue.executorId ? str(issue.executorId) : null;
    const active = await deps.agents().agents.listActive(conn);
    const picked = pickTwoProviders(
      active.map((agent) => ({
        id: agent.id,
        name: agent.name,
        // A runner's agent names its tool; an application's own agent has it only in its first entry.
        tool: agent.tool ?? agent.modelEntries[0]?.tool ?? null,
        status: agent.status,
      })),
      chooser,
    );
    if (!picked)
      throw new ApproachError(
        'NEED_TWO_PROVIDERS',
        'Two approaches need two enabled agents of different providers besides the one that holds the issue.',
      );
    const runs: { agentId: string; agentName: string; runId: string }[] = [];
    const notStarted: Record<string, string> = {};
    for (const agent of picked) {
      const attempt = await deps.waker().wakeIssue({
        issueId,
        agentId: agent.id,
        readOnly: true,
        text: [
          `Mode: read-only. Viết một approach ngắn cho ${str(issue.identifier)} "${str(issue.title)}" và đăng thành một bình luận trên việc.`,
          'Nêu: cách làm, các tệp sẽ đổi, rủi ro, cách kiểm chứng. Không sửa tệp nào. Một nhà cung cấp khác cũng đang viết phương án riêng; đừng đoán phương án đó.',
        ].join('\n'),
      });
      if (attempt?.started && attempt.runId)
        runs.push({
          agentId: agent.id,
          agentName: agent.name,
          runId: attempt.runId,
        });
      else notStarted[agent.id] = attempt?.skipped ?? 'noAgent';
    }
    if (runs.length < 2)
      throw new ApproachError(
        'NOT_STARTED',
        'Both approaches must start together; a run could not start.',
        notStarted,
      );
    await conn.query
      .insertInto('dsTwoApproaches')
      .values({
        id: randomUUID(),
        issueId,
        firstRunId: runs[0].runId,
        secondRunId: runs[1].runId,
        firstAgentId: runs[0].agentId,
        secondAgentId: runs[1].agentId,
        createdById: userId,
        createdAt: now(),
      })
      .execute();
    return runs;
  }

  /** Told of every run that ended on an issue: when it completes a pair, the agent that holds the issue is asked to choose. */
  async function onRunEnded(run: {
    readonly id: string;
  }): Promise<'compared' | 'waiting' | 'unrelated'> {
    const conn = deps.conn();
    const row = await conn.query
      .selectFrom('dsTwoApproaches')
      .selectAll()
      .where((eb) =>
        eb.or([eb('firstRunId', '=', run.id), eb('secondRunId', '=', run.id)]),
      )
      .where('comparedAt', 'is', null)
      .executeTakeFirst();
    if (!row) return 'unrelated';
    const [first, second] = await Promise.all([
      deps.agents().runs.get(str(row.firstRunId)),
      deps.agents().runs.get(str(row.secondRunId)),
    ]);
    if (!ENDED.includes(first.status) || !ENDED.includes(second.status))
      return 'waiting';
    // Asked once: only the update that finds it still empty goes on.
    const claimed = await conn.query
      .updateTable('dsTwoApproaches')
      .set({ comparedAt: now() })
      .where('id', '=', str(row.id))
      .where('comparedAt', 'is', null)
      .execute();
    if (Number(claimed.updatedCount ?? 0) === 0) return 'waiting';
    const names = await deps
      .agents()
      .agents.names(conn, [str(row.firstAgentId), str(row.secondAgentId)]);
    await deps.waker().wakeIssue({
      issueId: str(row.issueId),
      text: comparisonText([
        {
          agentName: names.get(str(row.firstAgentId)) ?? str(row.firstAgentId),
          runId: first.id,
        },
        {
          agentName:
            names.get(str(row.secondAgentId)) ?? str(row.secondAgentId),
          runId: second.id,
        },
      ]),
    });
    return 'compared';
  }

  return { start, onRunEnded };
}

export type TwoApproachesService = ReturnType<
  typeof createTwoApproachesService
>;
