import { randomUUID } from 'node:crypto';
import type { DatabaseConnection } from '@nocobase/db';
import { PLAYBOOK_DEFINITIONS, findPlaybookDefinition } from './definitions.js';
import type { PlaybookDefinition, PlaybookInvocationRecord } from './types.js';
import { str } from '../git/rows.js';

export interface ApplyPlaybookResult {
  readonly success: boolean;
  readonly reason?: 'NOT_FOUND';
  readonly message: string;
  readonly playbook?: PlaybookDefinition;
  readonly insertedCriteriaCount: number;
}

export { findPlaybookDefinition } from './definitions.js';

export function listPlaybookDefinitions(): readonly PlaybookDefinition[] {
  return PLAYBOOK_DEFINITIONS;
}

export async function listPlaybookInvocations(
  conn: DatabaseConnection,
  limit = 50,
): Promise<PlaybookInvocationRecord[]> {
  const rows = await conn.query
    .selectFrom('dsPlaybookInvocations')
    .selectAll()
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .execute();

  return rows.map((r) => {
    let parsedParams: Record<string, string> = {};
    if (r.params) {
      try {
        parsedParams = JSON.parse(str(r.params)) as Record<string, string>;
      } catch {
        parsedParams = {};
      }
    }
    return {
      id: str(r.id),
      playbookSlug: str(r.playbookSlug),
      issueId: str(r.issueId),
      commentId: r.commentId != null ? str(r.commentId) : null,
      params: parsedParams,
      invokedByUserId:
        r.invokedByUserId != null ? str(r.invokedByUserId) : null,
      createdAt:
        r.createdAt instanceof Date
          ? r.createdAt.toISOString()
          : str(r.createdAt),
    };
  });
}

export async function applyPlaybookToIssue(
  conn: DatabaseConnection,
  options: {
    readonly issueId: string;
    readonly slug: string;
    readonly params?: Record<string, string>;
    readonly commentId?: string | null;
    readonly userId?: string | null;
  },
): Promise<ApplyPlaybookResult> {
  const {
    issueId,
    slug,
    params = {},
    commentId = null,
    userId = null,
  } = options;
  const playbook = findPlaybookDefinition(slug);

  if (!playbook) {
    const available = PLAYBOOK_DEFINITIONS.map((p) => `!${p.slug}`).join(', ');
    return {
      success: false,
      reason: 'NOT_FOUND',
      message: `Playbook "!${slug}" không tồn tại. Danh sách playbook khả dụng: ${available}`,
      insertedCriteriaCount: 0,
    };
  }

  // Record invocation
  const now = new Date();
  const invocationId = randomUUID();
  await conn.query
    .insertInto('dsPlaybookInvocations')
    .values({
      id: invocationId,
      playbookSlug: playbook.slug,
      issueId,
      commentId,
      params: JSON.stringify(params),
      invokedByUserId: userId,
      createdAt: now,
    })
    .execute();

  // Check if issue already has criteria
  const existingCriteria = await conn.query
    .selectFrom('dsIssueCriteria')
    .select(['id'])
    .where('issueId', '=', issueId)
    .execute();

  let insertedCriteriaCount = 0;
  if (existingCriteria.length === 0 && playbook.defaultCriteria.length > 0) {
    for (let i = 0; i < playbook.defaultCriteria.length; i++) {
      const crit = playbook.defaultCriteria[i];
      if (!crit) continue;
      await conn.query
        .insertInto('dsIssueCriteria')
        .values({
          id: randomUUID(),
          issueId,
          position: i + 1,
          text: crit.text,
          checkKind: crit.checkKind,
          checkValue: crit.checkValue ?? null,
          source: 'playbook',
          createdByType: 'user',
          createdById: userId,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
      insertedCriteriaCount++;
    }
  }

  return {
    success: true,
    message: `Đã áp dụng playbook !${playbook.slug}`,
    playbook,
    insertedCriteriaCount,
  };
}
