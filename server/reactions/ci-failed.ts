import { randomUUID } from 'node:crypto';
import type { DatabaseConnection } from '@nocobase/db';
import { EVENTS_TABLE } from '../autopilot/evaluator.js';
import { str } from '../git/rows.js';

/**
 * Logs the first red CI result on a pull request's head, with its time (plan T, T1.0). The reaction rules of T1 read
 * these events, and so does anyone measuring how long an agent takes to react to a red build. An issue outside any
 * project has nowhere to be logged, so it is skipped.
 */
export async function recordCiFailed(
  conn: DatabaseConnection,
  event: {
    readonly issueId: string;
    readonly pullRequestId: string;
    readonly headSha: string;
  },
): Promise<boolean> {
  const issue = await conn.query
    .selectFrom('pmIssues')
    .select('projectId')
    .where('id', '=', event.issueId)
    .executeTakeFirst();
  const projectId = issue?.projectId ? str(issue.projectId) : null;
  if (!projectId) return false;
  await conn.query
    .insertInto(EVENTS_TABLE)
    .values({
      id: randomUUID(),
      projectId,
      issueId: event.issueId,
      pullRequestId: event.pullRequestId,
      kind: 'ciFailed',
      reason: null,
      data: JSON.stringify({ headSha: event.headSha }),
      createdAt: new Date(),
    })
    .execute();
  return true;
}
