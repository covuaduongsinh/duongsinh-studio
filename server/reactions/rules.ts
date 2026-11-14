import { randomUUID } from 'node:crypto';
import type { DatabaseConnection } from '@nocobase/db';
import { str, num } from '../git/rows.js';
import {
  DEFAULT_REACTION_RULES,
  REACTION_EVENTS,
  type ReactionEvent,
} from './service.js';

export interface EffectiveRule {
  readonly event: ReactionEvent;
  readonly enabled: boolean;
  readonly maxAttempts: number;
  readonly maxPerIssue: number;
  /** A project's own rule, not the built-in default. */
  readonly overridden: boolean;
}

/** Every event with the project's own rule when there is one, the built-in default otherwise. */
export async function effectiveRules(
  conn: DatabaseConnection,
  projectId: string,
): Promise<EffectiveRule[]> {
  const rows = await conn.query
    .selectFrom('dsReactionRules')
    .selectAll()
    .where('projectId', '=', projectId)
    .execute();
  return REACTION_EVENTS.map((event) => {
    const own = rows.find((row) => str(row.event) === event);
    const fallback = DEFAULT_REACTION_RULES.find(
      (rule) => rule.event === event,
    )!;
    return own
      ? {
          event,
          enabled: Boolean(own.enabled),
          maxAttempts: num(own.maxAttempts),
          maxPerIssue: num(own.maxPerIssue),
          overridden: true,
        }
      : {
          event,
          enabled: fallback.enabled,
          maxAttempts: fallback.maxAttempts,
          maxPerIssue: fallback.maxPerIssue,
          overridden: false,
        };
  });
}

/** Writes the project's rule for an event, starting from the current effective one; one row per project and event. */
export async function saveRule(
  conn: DatabaseConnection,
  projectId: string,
  event: ReactionEvent,
  patch: {
    readonly enabled?: boolean;
    readonly maxAttempts?: number;
    readonly maxPerIssue?: number;
  },
  userId: string | null,
): Promise<EffectiveRule> {
  const current = (await effectiveRules(conn, projectId)).find(
    (rule) => rule.event === event,
  )!;
  const next = {
    enabled: patch.enabled ?? current.enabled,
    maxAttempts: patch.maxAttempts ?? current.maxAttempts,
    maxPerIssue: Math.max(
      patch.maxPerIssue ?? current.maxPerIssue,
      patch.maxAttempts ?? current.maxAttempts,
    ),
  };
  const now = new Date();
  if (current.overridden)
    await conn.query
      .updateTable('dsReactionRules')
      .set({ ...next, updatedAt: now, updatedById: userId })
      .where('projectId', '=', projectId)
      .where('event', '=', event)
      .execute();
  else
    await conn.query
      .insertInto('dsReactionRules')
      .values({
        id: randomUUID(),
        projectId,
        event,
        ...next,
        escalateAfterMinutes: null,
        action: 'wake',
        updatedAt: now,
        updatedById: userId,
      })
      .execute();
  return { event, ...next, overridden: true };
}

export interface IssueReaction {
  readonly id: string;
  readonly kind: 'reacted' | 'blocked';
  readonly event: ReactionEvent | null;
  readonly attempt: number | null;
  readonly reason: string | null;
  readonly createdAt: string;
}

/** What Studio did by itself on an issue (wakes and the escalation), newest first. */
export async function issueReactions(
  conn: DatabaseConnection,
  issueId: string,
): Promise<IssueReaction[]> {
  const rows = await conn.query
    .selectFrom('dsAutopilotEvents')
    .selectAll()
    .where('issueId', '=', issueId)
    .where('kind', 'in', ['reacted', 'blocked'])
    .orderBy('createdAt', 'desc')
    .limit(50)
    .execute();
  const items: IssueReaction[] = [];
  for (const row of rows) {
    const raw: unknown =
      typeof row.data === 'string' ? safeParse(row.data) : row.data;
    const data =
      typeof raw === 'object' && raw !== null
        ? (raw as Record<string, unknown>)
        : {};
    const event =
      REACTION_EVENTS.find((name) => name === data.reaction) ?? null;
    // A "blocked" row without a reaction is the stall detector's, not ours.
    if (str(row.kind) === 'blocked' && !event) continue;
    items.push({
      id: str(row.id),
      kind: str(row.kind) === 'blocked' ? 'blocked' : 'reacted',
      event,
      attempt: typeof data.attempt === 'number' ? data.attempt : null,
      reason: row.reason ? str(row.reason) : null,
      createdAt: new Date(str(row.createdAt)).toISOString(),
    });
  }
  return items;
}

function safeParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
