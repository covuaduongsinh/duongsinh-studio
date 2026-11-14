import type { DatabaseConnection } from '@nocobase/db';
import { str } from '../git/rows.js';
import {
  TRANSIENT_SKIPS,
  type ReactionContext,
  type ReactionEvent,
} from './service.js';

/** Only a red CI and a conflict are retried: they are states the pull request is still in, not moments that passed. */
const RETRYABLE: readonly ReactionEvent[] = ['ciFailed', 'conflicts'];
const TEXT_MAX = 2000;

export const SKIPPED_KIND = 'reactionSkipped';

const parse = (value: unknown): Record<string, unknown> => {
  try {
    const raw: unknown = typeof value === 'string' ? JSON.parse(value) : value;
    return typeof raw === 'object' && raw !== null
      ? (raw as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
};

/** What the log keeps of a skipped reaction, so the sweep can try it once more (S1c). */
export function skippedData(
  event: ReactionEvent,
  context: ReactionContext,
  reason: string,
): Record<string, unknown> {
  const retry =
    !context.retried &&
    TRANSIENT_SKIPS.includes(reason) &&
    RETRYABLE.includes(event);
  return {
    reaction: event,
    reason,
    headSha: context.headSha,
    ...(retry
      ? { retry: 'pending', text: context.text.slice(0, TEXT_MAX) }
      : {}),
  };
}

/**
 * One more try, at the autopilot sweep, for each reaction skipped for a reason that passes by itself, if the pull request
 * is still red (or still conflicting) on the same head. Each skip is tried once.
 */
export async function retrySkippedReactions(deps: {
  readonly conn: DatabaseConnection;
  readonly react: (
    event: ReactionEvent,
    context: ReactionContext,
  ) => Promise<unknown>;
}): Promise<number> {
  const rows = await deps.conn.query
    .selectFrom('dsAutopilotEvents')
    .selectAll()
    .where('kind', '=', SKIPPED_KIND)
    .orderBy('createdAt', 'asc')
    .limit(500)
    .execute();
  let retried = 0;
  for (const row of rows) {
    const data = parse(row.data);
    if (data.retry !== 'pending') continue;
    await deps.conn.query
      .updateTable('dsAutopilotEvents')
      .set({ data: JSON.stringify({ ...data, retry: 'done' }) })
      .where('id', '=', str(row.id))
      .execute();
    const event = data.reaction as ReactionEvent;
    if (!row.issueId || !row.pullRequestId || !RETRYABLE.includes(event))
      continue;
    const pull = await deps.conn.query
      .selectFrom('dsPullRequests')
      .select(['state', 'headSha', 'ciState', 'mergeability'])
      .where('id', '=', str(row.pullRequestId))
      .executeTakeFirst();
    if (
      !pull ||
      str(pull.state) !== 'open' ||
      str(pull.headSha) !== str(data.headSha)
    )
      continue;
    const still =
      event === 'ciFailed'
        ? str(pull.ciState) === 'failed'
        : str(pull.mergeability) === 'conflicts';
    if (!still) continue;
    retried += 1;
    await deps.react(event, {
      issueId: str(row.issueId),
      projectId: row.projectId ? str(row.projectId) : null,
      pullRequestId: str(row.pullRequestId),
      headSha: str(data.headSha),
      text: str(data.text),
      retried: true,
    });
  }
  return retried;
}
