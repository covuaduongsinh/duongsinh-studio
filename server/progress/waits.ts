import type { DatabaseConnection } from '@nocobase/db';
import { str } from '../git/rows.js';

/** Comment runs counted against the limit over this many hours (`project-manager-settings`'s `commentRunLimit`). */
export const COMMENT_RUN_WINDOW_HOURS = 24;

/** One entry of an issue's activity, as the projects plugin lists it. */
export interface ActivityRow {
  readonly id: string;
  readonly action: string;
  readonly actorId: string | null;
  readonly actorType: string;
  readonly createdAt: string;
  readonly details: Readonly<Record<string, unknown>>;
}

/**
 * The newest comment run the limit held back since the owner last let them continue, within the window; null when
 * nothing is held. Read by the issue's panels and by the inbox, so both say the same.
 */
export async function heldCommentRun(
  conn: DatabaseConnection,
  activities: readonly ActivityRow[],
  issueId: string,
  now: number = Date.now(),
): Promise<ActivityRow | null> {
  const grant = await conn.query
    .selectFrom('dsCommentRunGrants')
    .select('continuedAt')
    .where('issueId', '=', issueId)
    .executeTakeFirst();
  const since = grant?.continuedAt
    ? new Date(str(grant.continuedAt)).getTime()
    : 0;
  const windowStart = now - COMMENT_RUN_WINDOW_HOURS * 3_600_000;
  return (
    activities.find(
      (activity) =>
        activity.action === 'work_skipped' &&
        activity.details.reason === 'limited' &&
        new Date(activity.createdAt).getTime() > Math.max(since, windowStart),
    ) ?? null
  );
}

/** The newest change of owner someone else made, which the new owner may accept or reject. */
export function lastHandoff(
  activities: readonly ActivityRow[],
): ActivityRow | null {
  return (
    activities.find(
      (activity) =>
        activity.action === 'owner_changed' &&
        typeof activity.details.from === 'string' &&
        typeof activity.details.to === 'string' &&
        activity.actorId !== activity.details.to,
    ) ?? null
  );
}

/** Whether `handoff` still waits on its new owner: neither accepted nor rejected. */
export async function handoffWaiting(
  conn: DatabaseConnection,
  handoff: ActivityRow,
): Promise<boolean> {
  const decision = await conn.query
    .selectFrom('dsOwnerHandoffDecisions')
    .select('activityId')
    .where('activityId', '=', handoff.id)
    .executeTakeFirst();
  return !decision;
}
