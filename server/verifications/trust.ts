import type { DatabaseConnection } from '@nocobase/db';
import { str } from '../git/rows.js';

/** Who submitted a verification. Null in the table (every row before plan S) is read as `agent`. */
export type VerificationSource = 'agent' | 'ci' | 'person';

/** The settings item of the repository CI key's right to read the plan and submit a verification (plan S, S4). */
export const VERIFY_SETTINGS_ID = 'studio.verify';
export const VERIFY_SUBMIT_ACTION = 'submit';

/** Whether the project asks that only a verification submitted by its CI key counts (off unless turned on). */
export async function verifyOnCiOf(
  conn: DatabaseConnection,
  projectId: string | null,
): Promise<boolean> {
  if (!projectId) return false;
  const row = await conn.query
    .selectFrom('dsAutopilotSettings')
    .select('verifyOnCi')
    .where('projectId', '=', projectId)
    .executeTakeFirst();
  const value: unknown = row?.verifyOnCi;
  return value === true || value === 1 || value === '1' || value === 't';
}

/**
 * The latest verification of an issue that its project trusts: any, or while "verify on CI" is on, the latest one the
 * CI key submitted. The gates (an agent's move to review, the autopilot's merge) read this, never the table directly.
 */
export async function trustedVerificationOf(
  conn: DatabaseConnection,
  issueId: string,
): Promise<Record<string, unknown> | undefined> {
  const issue = await conn.query
    .selectFrom('pmIssues')
    .select('projectId')
    .where('id', '=', issueId)
    .executeTakeFirst();
  const ciOnly = await verifyOnCiOf(
    conn,
    issue?.projectId ? str(issue.projectId) : null,
  );
  let query = conn.query
    .selectFrom('dsVerifications')
    .selectAll()
    .where('issueId', '=', issueId);
  if (ciOnly) query = query.where('source', '=', 'ci');
  return query.orderBy('createdAt', 'desc').executeTakeFirst();
}

/** The repository a CI key was issued for, or null for a key that is not a repository's CI key. */
export async function ciKeyRepository(
  conn: DatabaseConnection,
  keyId: string,
): Promise<string | null> {
  const row = await conn.query
    .selectFrom('dsRepositoryCiKeys')
    .select('repositoryId')
    .where('keyId', '=', keyId)
    .executeTakeFirst();
  return row ? str(row.repositoryId) : null;
}
