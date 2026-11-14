import type { DatabaseConnection } from '@nocobase/db';

/**
 * CI has the last word (plan T, T2): when the checks of a head commit are red, every `passed` verification of that
 * same head on the issue becomes `contradicted`. `mayMove` and the autopilot's gates read only `passed`, so nothing
 * moves on a claim CI refutes. Answers how many verifications changed; said again, it changes none.
 */
export async function contradictVerifications(
  connection: DatabaseConnection,
  issueId: string,
  headSha: string,
  now: Date = new Date(),
): Promise<number> {
  const result = await connection.query
    .updateTable('dsVerifications')
    .set({
      result: 'contradicted',
      contradictedAt: now,
      contradictedBy: 'ci',
    })
    .where('issueId', '=', issueId)
    .where('headSha', '=', headSha)
    .where('result', '=', 'passed')
    .execute();
  return Number(result.updatedCount ?? 0);
}
