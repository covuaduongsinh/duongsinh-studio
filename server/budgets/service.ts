import type { DatabaseConnection } from '@nocobase/db';
import { randomUUID } from 'node:crypto';
import { num, str, type Row } from '../git/rows.js';

/**
 * Budgets of runs and tokens, per project, per agent or for everything, by the day or the month. At 80% people are told;
 * at 100% work stops being queued until the period turns or someone releases it. Tokens count what agents reported, so
 * a run still going counts once it reports.
 */
const BUDGETS = 'dsBudgets';
const EVENTS = 'dsBudgetEvents';
const WARN_AT = 0.8;

export const BUDGET_SCOPES = ['global', 'project', 'agent'] as const;
export type BudgetScope = (typeof BUDGET_SCOPES)[number];
export const BUDGET_PERIODS = ['day', 'month'] as const;
export type BudgetPeriod = (typeof BUDGET_PERIODS)[number];

export interface BudgetView {
  readonly id: string;
  readonly scope: BudgetScope;
  /** Empty for `global`. */
  readonly scopeId: string;
  /** The project's or agent's name where people read it; null for `global`. */
  readonly scopeName?: string | null;
  readonly period: BudgetPeriod;
  readonly maxRuns: number | null;
  readonly maxTokens: number | null;
  readonly usedRuns: number;
  readonly usedTokens: number;
  readonly state: 'ok' | 'warning' | 'blocked' | 'released';
}

export interface BudgetNotice {
  readonly key: string;
  readonly kind: 'warned' | 'blocked';
  readonly budget: BudgetView;
}

export interface BudgetDeps {
  readonly conn: () => DatabaseConnection;
  readonly now?: () => Date;
  /** Told once per budget, period and kind; a failure here never stops the work. */
  readonly notify?: (notice: BudgetNotice) => Promise<void>;
  readonly scopeName?: (
    scope: 'project' | 'agent',
    id: string,
  ) => Promise<string>;
}

/** Periods turn at midnight in Vietnam, where the people are, as the autopilot's schedules do. */
const OFFSET_MS = 7 * 60 * 60 * 1000;

const startOf = (period: BudgetPeriod, now: Date): Date => {
  const local = new Date(now.getTime() + OFFSET_MS);
  return new Date(
    Date.UTC(
      local.getUTCFullYear(),
      local.getUTCMonth(),
      period === 'day' ? local.getUTCDate() : 1,
    ) - OFFSET_MS,
  );
};

const keyOf = (period: BudgetPeriod, now: Date): string =>
  new Date(now.getTime() + OFFSET_MS)
    .toISOString()
    .slice(0, period === 'day' ? 10 : 7);

const shareOf = (used: number, limit: number | null): number =>
  limit === null ? 0 : limit <= 0 ? 1 : used / limit;

/** What the figures mean; `released` only matters once the limit is reached. */
export function budgetState(figures: {
  readonly usedRuns: number;
  readonly usedTokens: number;
  readonly maxRuns: number | null;
  readonly maxTokens: number | null;
  readonly released: boolean;
}): BudgetView['state'] {
  const share = Math.max(
    shareOf(figures.usedRuns, figures.maxRuns),
    shareOf(figures.usedTokens, figures.maxTokens),
  );
  if (share >= 1) return figures.released ? 'released' : 'blocked';
  return share >= WARN_AT ? 'warning' : 'ok';
}

/** The periods a moment falls in, turning at midnight in Vietnam. */
export const budgetPeriodOf = (
  period: BudgetPeriod,
  now: Date,
): { readonly key: string; readonly since: Date } => ({
  key: keyOf(period, now),
  since: startOf(period, now),
});

export function createBudgetService(deps: BudgetDeps) {
  const now = () => (deps.now ? deps.now() : new Date());

  /** Runs queued and tokens reported in the period, within the budget's scope. */
  const usageOf = async (
    conn: DatabaseConnection,
    budget: Row,
  ): Promise<{ runs: number; tokens: number }> => {
    const scope = str(budget.scope);
    const scopeId = str(budget.scopeId);
    const since = startOf(str(budget.period) as BudgetPeriod, now());
    let runs = conn.query
      .selectFrom('agRuns as run')
      .select((eb) => [eb.fn.countAll().as('count')])
      .where('run.createdAt', '>=', since);
    let tokens = conn.query
      .selectFrom('agRunUsage as usage')
      .innerJoin('agRuns as run', 'run.id', 'usage.runId')
      .select((eb) => [
        eb.fn.sum('usage.inputTokens').as('input'),
        eb.fn.sum('usage.outputTokens').as('output'),
      ])
      .where('usage.createdAt', '>=', since);
    if (scope === 'agent') {
      runs = runs.where('run.agentId', '=', scopeId);
      tokens = tokens.where('run.agentId', '=', scopeId);
    }
    if (scope === 'project') {
      runs = runs
        .innerJoin('pmIssues as issue', 'issue.id', 'run.subjectId')
        .where('run.subjectKind', '=', 'issue')
        .where('issue.projectId', '=', scopeId);
      tokens = tokens
        .innerJoin('pmIssues as issue', 'issue.id', 'run.subjectId')
        .where('run.subjectKind', '=', 'issue')
        .where('issue.projectId', '=', scopeId);
    }
    const ran: Row | undefined = await runs.executeTakeFirst();
    const used: Row | undefined = await tokens.executeTakeFirst();
    return {
      runs: num(ran?.count),
      tokens: num(used?.input) + num(used?.output),
    };
  };

  const viewOf = async (
    conn: DatabaseConnection,
    budget: Row,
  ): Promise<BudgetView> => {
    const period = str(budget.period) as BudgetPeriod;
    const { runs, tokens } = await usageOf(conn, budget);
    const maxRuns = budget.maxRuns == null ? null : num(budget.maxRuns);
    const maxTokens = budget.maxTokens == null ? null : num(budget.maxTokens);
    const events: Row[] = await conn.query
      .selectFrom(EVENTS)
      .select(['kind'])
      .where('budgetId', '=', str(budget.id))
      .where('periodKey', '=', keyOf(period, now()))
      .execute();
    const released = events.some((event) => str(event.kind) === 'released');
    return {
      id: str(budget.id),
      scope: str(budget.scope) as BudgetScope,
      scopeId: str(budget.scopeId),
      period,
      maxRuns,
      maxTokens,
      usedRuns: runs,
      usedTokens: tokens,
      state: budgetState({
        usedRuns: runs,
        usedTokens: tokens,
        maxRuns,
        maxTokens,
        released,
      }),
    };
  };

  const named = async (view: BudgetView): Promise<BudgetView> => ({
    ...view,
    scopeName:
      view.scope === 'global'
        ? null
        : ((await deps.scopeName?.(view.scope, view.scopeId)) ?? view.scopeId),
  });

  /**
   * After the work's transaction, records the event once per period and tells people the first time. On its own
   * connection, so two wake-ups at once cannot abort each other's work: the loser of the unique key only logs.
   */
  const once = (
    conn: DatabaseConnection,
    view: BudgetView,
    kind: 'warned' | 'blocked',
  ): void => {
    conn.afterCommit(async () => {
      try {
        const own = deps.conn();
        const periodKey = keyOf(view.period, now());
        const seen: Row | undefined = await own.query
          .selectFrom(EVENTS)
          .select(['id'])
          .where('budgetId', '=', view.id)
          .where('periodKey', '=', periodKey)
          .where('kind', '=', kind)
          .executeTakeFirst();
        if (seen) return;
        await own.query
          .insertInto(EVENTS)
          .values({
            id: randomUUID(),
            budgetId: view.id,
            periodKey,
            kind,
            createdAt: now(),
          })
          .execute();
        await deps.notify?.({
          key: `ds-budget-${view.id}-${periodKey}-${kind}`,
          kind,
          budget: view,
        });
      } catch (error) {
        console.warn('Studio could not tell about a budget', error);
      }
    });
  };

  const stopping = async (
    conn: DatabaseConnection,
    work: { readonly agentId: string; readonly projectId: string | null },
  ): Promise<BudgetView | null> => {
    const rows: Row[] = await conn.query
      .selectFrom(BUDGETS)
      .selectAll()
      .execute();
    let stop: BudgetView | null = null;
    for (const row of rows) {
      const scope = str(row.scope);
      const scopeId = str(row.scopeId);
      if (
        (scope === 'agent' && scopeId !== work.agentId) ||
        (scope === 'project' && scopeId !== work.projectId)
      )
        continue;
      const view = await viewOf(conn, row);
      if (view.state === 'warning') once(conn, view, 'warned');
      if (view.state === 'blocked') {
        once(conn, view, 'blocked');
        stop ??= view;
      }
    }
    return stop;
  };

  return {
    async list(): Promise<BudgetView[]> {
      const conn = deps.conn();
      const rows: Row[] = await conn.query
        .selectFrom(BUDGETS)
        .selectAll()
        .orderBy('createdAt')
        .execute();
      return Promise.all(
        rows.map(async (row) => named(await viewOf(conn, row))),
      );
    },

    /** Sets a budget's limits; a scope and period have one budget. */
    async save(input: {
      readonly scope: BudgetScope;
      readonly scopeId: string;
      readonly period: BudgetPeriod;
      readonly maxRuns: number | null;
      readonly maxTokens: number | null;
      readonly byUserId: string;
    }): Promise<BudgetView> {
      const conn = deps.conn();
      const at = now();
      const existing: Row | undefined = await conn.query
        .selectFrom(BUDGETS)
        .select(['id'])
        .where('scope', '=', input.scope)
        .where('scopeId', '=', input.scopeId)
        .where('period', '=', input.period)
        .executeTakeFirst();
      const id = existing ? str(existing.id) : randomUUID();
      if (existing)
        await conn.query
          .updateTable(BUDGETS)
          .set({
            maxRuns: input.maxRuns,
            maxTokens: input.maxTokens,
            updatedAt: at,
          })
          .where('id', '=', id)
          .execute();
      else
        await conn.query
          .insertInto(BUDGETS)
          .values({
            id,
            scope: input.scope,
            scopeId: input.scopeId,
            period: input.period,
            maxRuns: input.maxRuns,
            maxTokens: input.maxTokens,
            createdById: input.byUserId,
            createdAt: at,
            updatedAt: at,
          })
          .execute();
      const row: Row | undefined = await conn.query
        .selectFrom(BUDGETS)
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();
      if (!row) throw new Error('A budget just written is there.');
      return named(await viewOf(conn, row));
    },

    async remove(id: string): Promise<boolean> {
      const conn = deps.conn();
      const row: Row | undefined = await conn.query
        .selectFrom(BUDGETS)
        .select(['id'])
        .where('id', '=', id)
        .executeTakeFirst();
      if (!row) return false;
      await conn.query.deleteFrom(EVENTS).where('budgetId', '=', id).execute();
      await conn.query.deleteFrom(BUDGETS).where('id', '=', id).execute();
      return true;
    },

    /** Lets work be queued again until the period turns. */
    async release(id: string, byUserId: string): Promise<BudgetView | null> {
      const conn = deps.conn();
      const row: Row | undefined = await conn.query
        .selectFrom(BUDGETS)
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();
      if (!row) return null;
      const periodKey = keyOf(str(row.period) as BudgetPeriod, now());
      const seen: Row | undefined = await conn.query
        .selectFrom(EVENTS)
        .select(['id'])
        .where('budgetId', '=', id)
        .where('periodKey', '=', periodKey)
        .where('kind', '=', 'released')
        .executeTakeFirst();
      if (!seen)
        await conn.query
          .insertInto(EVENTS)
          .values({
            id: randomUUID(),
            budgetId: id,
            periodKey,
            kind: 'released',
            actorId: byUserId,
            createdAt: now(),
          })
          .execute();
      return named(await viewOf(conn, row));
    },

    /**
     * Whether a budget stops queueing this work now, telling people at 80% and 100%. Runs on `conn`, so a caller inside
     * a transaction reads what it wrote. Answers the budget that stops it, or null.
     */
    blocking: stopping,

    /** The same answer for work on an issue, for callers outside a projects transaction. */
    async stopsIssue(
      issueId: string,
      agentId: string,
    ): Promise<BudgetView | null> {
      const conn = deps.conn();
      const issue: Row | undefined = await conn.query
        .selectFrom('pmIssues')
        .select(['projectId'])
        .where('id', '=', issueId)
        .executeTakeFirst();
      return stopping(conn, {
        agentId,
        projectId: issue ? str(issue.projectId) : null,
      });
    },
  };
}

export type BudgetService = ReturnType<typeof createBudgetService>;
