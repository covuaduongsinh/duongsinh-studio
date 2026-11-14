import type { DatabaseConnection } from '@nocobase/db';
import { str, strOrNull } from '../git/rows.js';

/** How much care an issue asks for (plan T, T10). */
export type Tier = 'small' | 'standard' | 'sensitive';
export const TIERS: readonly Tier[] = ['small', 'standard', 'sensitive'];
export const DEFAULT_TIER: Tier = 'standard';

export interface TierPolicy {
  /** Whether the agent writes an approach first: never, when the change is risky, or always. */
  readonly approach: 'skip' | 'whenRisky' | 'required';
  /** Review passes before a merge: the code review, plus the extra security review for a sensitive issue. */
  readonly reviewPasses: 1 | 2;
}

export const TIER_POLICY: Record<Tier, TierPolicy> = {
  small: { approach: 'skip', reviewPasses: 1 },
  standard: { approach: 'whenRisky', reviewPasses: 1 },
  sensitive: { approach: 'required', reviewPasses: 2 },
};

export class TierError extends Error {
  constructor(
    readonly reason: 'TIER_RAISED' | 'INVALID_TIER',
    message: string,
  ) {
    super(message);
  }
}

export const isTier = (value: unknown): value is Tier =>
  typeof value === 'string' && (TIERS as readonly string[]).includes(value);

/** Whether the merge needs the extra security review: the issue is sensitive or its pull request touches sensitive paths. */
export const extraReviewNeeded = (
  tier: Tier,
  touchedSensitive: readonly string[],
): boolean => tier === 'sensitive' || touchedSensitive.length > 0;

export interface IssueTier {
  readonly tier: Tier;
  /** `issue`: someone chose it or sensitive paths raised it; `default`: the project's default. */
  readonly source: 'issue' | 'default';
  readonly raisedFrom: Tier | null;
  readonly reason: string | null;
}

/** The project's default tier (`standard` until its autopilot settings say otherwise). */
export async function defaultTierOf(
  conn: DatabaseConnection,
  projectId: string | null,
): Promise<Tier> {
  if (!projectId) return DEFAULT_TIER;
  const row = await conn.query
    .selectFrom('dsAutopilotSettings')
    .select('defaultTier')
    .where('projectId', '=', projectId)
    .executeTakeFirst();
  const value = row ? strOrNull(row.defaultTier) : null;
  return isTier(value) ? value : DEFAULT_TIER;
}

export async function tierOf(
  conn: DatabaseConnection,
  issueId: string,
): Promise<IssueTier> {
  const row = await conn.query
    .selectFrom('dsIssueTiers')
    .selectAll()
    .where('issueId', '=', issueId)
    .executeTakeFirst();
  if (row && isTier(str(row.tier))) {
    const raised = strOrNull(row.raisedFrom);
    return {
      tier: str(row.tier) as Tier,
      source: 'issue',
      raisedFrom: isTier(raised) ? raised : null,
      reason: strOrNull(row.reason),
    };
  }
  const issue = await conn.query
    .selectFrom('pmIssues')
    .select('projectId')
    .where('id', '=', issueId)
    .executeTakeFirst();
  return {
    tier: await defaultTierOf(
      conn,
      issue?.projectId ? str(issue.projectId) : null,
    ),
    source: 'default',
    raisedFrom: null,
    reason: null,
  };
}

/**
 * A person's choice. An issue the paths raised stays at least as high as it was raised to: nothing lowers it by itself,
 * and a person who means to can say so in a new issue.
 */
export async function setTier(
  conn: DatabaseConnection,
  issueId: string,
  tier: Tier,
  by: { readonly userId: string | null; readonly reason: string | null },
): Promise<IssueTier> {
  const current = await tierOf(conn, issueId);
  if (current.raisedFrom && TIERS.indexOf(tier) < TIERS.indexOf(current.tier))
    throw new TierError(
      'TIER_RAISED',
      `This issue was raised to ${current.tier} because of the paths it touches; it is not lowered.`,
    );
  const now = new Date();
  const values = {
    tier,
    raisedFrom: current.raisedFrom,
    reason: by.reason,
    updatedAt: now,
    updatedById: by.userId,
  };
  if (current.source === 'issue')
    await conn.query
      .updateTable('dsIssueTiers')
      .set(values)
      .where('issueId', '=', issueId)
      .execute();
  else
    await conn.query
      .insertInto('dsIssueTiers')
      .values({ issueId, ...values })
      .execute();
  return tierOf(conn, issueId);
}

/** Raises an issue to sensitive because a path says so. True the first time, false when it already is. */
export async function raiseTier(
  conn: DatabaseConnection,
  issueId: string,
  because: string,
): Promise<boolean> {
  const current = await tierOf(conn, issueId);
  if (current.tier === 'sensitive') return false;
  const now = new Date();
  const values = {
    tier: 'sensitive',
    raisedFrom: current.tier,
    reason: `Chạm đường dẫn nhạy cảm: ${because}`,
    updatedAt: now,
    updatedById: null,
  };
  if (current.source === 'issue')
    await conn.query
      .updateTable('dsIssueTiers')
      .set(values)
      .where('issueId', '=', issueId)
      .execute();
  else
    await conn.query
      .insertInto('dsIssueTiers')
      .values({ issueId, ...values })
      .execute();
  return true;
}
