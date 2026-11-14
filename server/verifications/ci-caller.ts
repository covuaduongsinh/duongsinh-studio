import { runIdentityOf } from '@nocobase/app-plugin-agents/server/tokens';
import { isApiKeySession } from '@nocobase/app-plugin-api-keys/server';
import type { AuthEnv } from '@nocobase/app-plugin-authentication';
import type { AuthorizationEnv } from '@nocobase/app-plugin-authorization';
import type { DatabaseConnection } from '@nocobase/db';
import type { Context } from 'hono';
import { str } from '../git/rows.js';
import {
  ciKeyRepository,
  VERIFY_SETTINGS_ID,
  VERIFY_SUBMIT_ACTION,
} from './trust.js';

type Env = AuthEnv & AuthorizationEnv;

/**
 * The repository whose CI key made this request, when it is one: an API key (not a person's session, not a run) whose
 * scope holds the verify right and that was issued for a repository. A key without the right, or not a repository's CI key,
 * is no CI caller and goes the ordinary way (plan S, S4).
 */
export async function ciCallerOf(
  context: Context<Env>,
  conn: DatabaseConnection,
): Promise<{ readonly repositoryId: string; readonly keyId: string } | null> {
  const session = context.get('auth');
  if (!session || runIdentityOf(session)?.run) return null;
  if (!isApiKeySession(session, context.req.raw.headers)) return null;
  const authorization = context.get('authz');
  const resource = { type: 'settings', id: VERIFY_SETTINGS_ID } as const;
  const keyScope = authorization.identity.keyScope;
  if (!keyScope?.allows(resource, VERIFY_SUBMIT_ACTION)) return null;
  // The key's scope narrows what its account may do, so both must allow it; an administrator's account is unrestricted.
  if (
    !(await authorization.snapshot()).unrestricted &&
    !(await authorization.can({ resource, action: VERIFY_SUBMIT_ACTION }))
  )
    return null;
  const repositoryId = await ciKeyRepository(conn, keyScope.keyId);
  return repositoryId ? { repositoryId, keyId: keyScope.keyId } : null;
}

/**
 * The issue a CI key may verify: found by id or identifier, with an open pull request in the key's repository. Anything
 * else is not found, so a key leaked from one repository cannot read or verify another's issues.
 */
export async function ciIssueOf(
  conn: DatabaseConnection,
  repositoryId: string,
  issueRef: string,
): Promise<{
  readonly id: string;
  readonly identifier: string;
  readonly title: string;
  readonly ownerUserId: string | null;
  readonly projectId: string | null;
  readonly executor: { readonly type: string; readonly id: string } | null;
} | null> {
  const row = await conn.query
    .selectFrom('pmIssues')
    .selectAll()
    .where((eb) =>
      eb.or([eb('id', '=', issueRef), eb('identifier', '=', issueRef)]),
    )
    .where('deletedAt', 'is', null)
    .executeTakeFirst();
  if (!row) return null;
  const pull = await conn.query
    .selectFrom('dsPullRequests')
    .select('id')
    .where('issueId', '=', str(row.id))
    .where('repositoryId', '=', repositoryId)
    .where('state', '=', 'open')
    .executeTakeFirst();
  if (!pull) return null;
  return {
    id: str(row.id),
    identifier: str(row.identifier),
    title: str(row.title),
    ownerUserId: row.ownerUserId ? str(row.ownerUserId) : null,
    projectId: row.projectId ? str(row.projectId) : null,
    executor:
      row.executorType && row.executorId
        ? { type: str(row.executorType), id: str(row.executorId) }
        : null,
  };
}
