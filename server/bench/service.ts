import { randomUUID } from 'node:crypto';
import type { DatabaseConnection, DatabaseManager } from '@nocobase/db';
import { str, strOrNull, num, iso, type Row } from '../git/rows.js';
import type {
  BenchRunView,
  BenchResultView,
  BenchStatusView,
} from './types.js';
import { DS_CORE_TASKS } from './sets/ds-core/index.js';

export const BENCH_RUNS = 'dsBenchRuns';
export const BENCH_RESULTS = 'dsBenchResults';
export const MAX_MONTHLY_FULL_RUNS = 4;

export class BenchError extends Error {
  override name = 'BenchError';
  constructor(
    readonly status:
      | 'INVALID_ARGUMENT'
      | 'FAILED_PRECONDITION'
      | 'NOT_FOUND'
      | 'PERMISSION_DENIED',
    readonly reason: string,
    message: string,
    readonly params: Readonly<Record<string, string>> = {},
  ) {
    super(message);
  }
}

export interface StartBenchRunInput {
  readonly set?: string;
  readonly taskKey?: string;
  readonly force?: boolean;
  readonly trigger?: 'manual' | 'scheduled';
  readonly model?: string;
  readonly studioCommit?: string;
  readonly skillVersions?: Record<string, number>;
}

export interface BenchServiceDeps {
  readonly database: DatabaseManager;
  readonly defaultModel?: () => string;
  readonly currentCommit?: () => string;
}

export function createBenchService(deps: BenchServiceDeps) {
  const conn = (): DatabaseConnection => deps.database.connection();

  function startOfMonthIso(): string {
    const now = new Date();
    const start = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0),
    );
    return start.toISOString();
  }

  async function countMonthlyFullRuns(): Promise<number> {
    const start = startOfMonthIso();
    const rows = await conn()
      .query.selectFrom(BENCH_RUNS)
      .selectAll()
      .where('set', '=', 'ds-core')
      .where('startedAt', '>=', start)
      .execute();
    return rows.length;
  }

  function runViewOf(row: Row, results?: BenchResultView[]): BenchRunView {
    let skillVersions: Record<string, number> = {};
    if (typeof row.skillVersions === 'string') {
      try {
        skillVersions = JSON.parse(row.skillVersions) as Record<string, number>;
      } catch {
        // ignore malformed stored json
      }
    } else if (row.skillVersions && typeof row.skillVersions === 'object') {
      skillVersions = row.skillVersions as Record<string, number>;
    }

    const totalTasks = results ? results.length : undefined;
    const passedTasks = results
      ? results.filter((r) => r.result === 'passed').length
      : undefined;
    const passRate =
      totalTasks && totalTasks > 0 && passedTasks !== undefined
        ? Math.round((passedTasks / totalTasks) * 100)
        : undefined;

    return {
      id: str(row.id),
      set: str(row.set),
      studioCommit: str(row.studioCommit),
      model: str(row.model),
      skillVersions,
      startedAt: iso(row.startedAt) ?? new Date().toISOString(),
      finishedAt: row.finishedAt ? iso(row.finishedAt) : null,
      status: str(row.status) as BenchRunView['status'],
      trigger: str(row.trigger) as BenchRunView['trigger'],
      createdAt: iso(row.createdAt) ?? new Date().toISOString(),
      updatedAt: iso(row.updatedAt) ?? new Date().toISOString(),
      ...(totalTasks !== undefined ? { totalTasks } : {}),
      ...(passedTasks !== undefined ? { passedTasks } : {}),
      ...(passRate !== undefined ? { passRate } : {}),
      ...(results ? { results } : {}),
    };
  }

  function resultViewOf(row: Row): BenchResultView {
    return {
      id: str(row.id),
      benchRunId: str(row.benchRunId),
      taskKey: str(row.taskKey),
      issueId: strOrNull(row.issueId),
      result: str(row.result) as BenchResultView['result'],
      reason: strOrNull(row.reason),
      runs: num(row.runs),
      outputTokens: num(row.outputTokens),
      totalTokens: num(row.totalTokens),
      returns: num(row.returns),
      verifyAttempts: num(row.verifyAttempts),
      durationMs: num(row.durationMs),
      createdAt: iso(row.createdAt) ?? new Date().toISOString(),
      updatedAt: iso(row.updatedAt) ?? new Date().toISOString(),
    };
  }

  async function listRuns(limit = 20): Promise<BenchRunView[]> {
    const rows = await conn()
      .query.selectFrom(BENCH_RUNS)
      .selectAll()
      .orderBy('startedAt', 'desc')
      .limit(limit)
      .execute();

    const views: BenchRunView[] = [];
    for (const row of rows) {
      const resultRows = await conn()
        .query.selectFrom(BENCH_RESULTS)
        .selectAll()
        .where('benchRunId', '=', str(row.id))
        .execute();
      const results = resultRows.map(resultViewOf);
      views.push(runViewOf(row, results));
    }
    return views;
  }

  async function getRun(id: string): Promise<BenchRunView> {
    const row = await conn()
      .query.selectFrom(BENCH_RUNS)
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (!row) {
      throw new BenchError(
        'NOT_FOUND',
        'BENCH_RUN_NOT_FOUND',
        `Bench run ${id} not found.`,
      );
    }

    const resultRows = await conn()
      .query.selectFrom(BENCH_RESULTS)
      .selectAll()
      .where('benchRunId', '=', id)
      .execute();
    const results = resultRows.map(resultViewOf);
    return runViewOf(row, results);
  }

  async function startRun(input: StartBenchRunInput): Promise<BenchRunView> {
    const setName = input.set ?? 'ds-core';
    const isFullRun = !input.taskKey;

    if (isFullRun) {
      const currentMonthRuns = await countMonthlyFullRuns();
      if (currentMonthRuns >= MAX_MONTHLY_FULL_RUNS && !input.force) {
        throw new BenchError(
          'FAILED_PRECONDITION',
          'BENCH_MONTHLY_LIMIT_REACHED',
          `Monthly full bench run limit (${MAX_MONTHLY_FULL_RUNS} runs) has been reached. Use force option to override.`,
          {
            currentMonthRuns: String(currentMonthRuns),
            max: String(MAX_MONTHLY_FULL_RUNS),
          },
        );
      }
    }

    const tasksToRun = input.taskKey
      ? DS_CORE_TASKS.filter((t) => t.key === input.taskKey)
      : DS_CORE_TASKS;

    if (tasksToRun.length === 0) {
      throw new BenchError(
        'INVALID_ARGUMENT',
        'UNKNOWN_BENCH_TASK',
        `Task key "${input.taskKey ?? ''}" is not found in set "${setName}".`,
      );
    }

    const runId = randomUUID();
    const now = new Date().toISOString();
    const studioCommit =
      input.studioCommit ??
      (deps.currentCommit ? deps.currentCommit() : 'HEAD');
    const model =
      input.model ??
      (deps.defaultModel ? deps.defaultModel() : 'claude-3-5-sonnet');
    const skillVersions = input.skillVersions ?? {
      'ds-workflow': 3,
      'ds-review': 3,
      'ds-development': 2,
    };

    await conn()
      .query.insertInto(BENCH_RUNS)
      .values({
        id: runId,
        set: setName,
        studioCommit,
        model,
        skillVersions: JSON.stringify(skillVersions),
        startedAt: now,
        finishedAt: null,
        status: 'running',
        trigger: input.trigger ?? 'manual',
        createdAt: now,
        updatedAt: now,
      })
      .execute();

    const createdResults: BenchResultView[] = [];

    for (const task of tasksToRun) {
      const resultId = randomUUID();
      await conn()
        .query.insertInto(BENCH_RESULTS)
        .values({
          id: resultId,
          benchRunId: runId,
          taskKey: task.key,
          issueId: null,
          result: 'running',
          reason: null,
          runs: 0,
          outputTokens: 0,
          totalTokens: 0,
          returns: 0,
          verifyAttempts: 0,
          durationMs: 0,
          createdAt: now,
          updatedAt: now,
        })
        .execute();

      createdResults.push({
        id: resultId,
        benchRunId: runId,
        taskKey: task.key,
        issueId: null,
        result: 'running',
        reason: null,
        runs: 0,
        outputTokens: 0,
        totalTokens: 0,
        returns: 0,
        verifyAttempts: 0,
        durationMs: 0,
        createdAt: now,
        updatedAt: now,
      });
    }

    return getRun(runId);
  }

  async function updateTaskResult(
    resultId: string,
    update: {
      readonly result: 'passed' | 'failed' | 'timeout' | 'running';
      readonly reason?: string | null;
      readonly issueId?: string | null;
      readonly runs?: number;
      readonly outputTokens?: number;
      readonly totalTokens?: number;
      readonly returns?: number;
      readonly verifyAttempts?: number;
      readonly durationMs?: number;
    },
  ): Promise<void> {
    const now = new Date().toISOString();
    await conn()
      .query.updateTable(BENCH_RESULTS)
      .set({
        result: update.result,
        ...(update.reason !== undefined ? { reason: update.reason } : {}),
        ...(update.issueId !== undefined ? { issueId: update.issueId } : {}),
        ...(update.runs !== undefined ? { runs: update.runs } : {}),
        ...(update.outputTokens !== undefined
          ? { outputTokens: update.outputTokens }
          : {}),
        ...(update.totalTokens !== undefined
          ? { totalTokens: update.totalTokens }
          : {}),
        ...(update.returns !== undefined ? { returns: update.returns } : {}),
        ...(update.verifyAttempts !== undefined
          ? { verifyAttempts: update.verifyAttempts }
          : {}),
        ...(update.durationMs !== undefined
          ? { durationMs: update.durationMs }
          : {}),
        updatedAt: now,
      })
      .where('id', '=', resultId)
      .execute();
  }

  async function finishRun(
    runId: string,
    status: 'completed' | 'failed' | 'aborted' = 'completed',
  ): Promise<BenchRunView> {
    const now = new Date().toISOString();
    await conn()
      .query.updateTable(BENCH_RUNS)
      .set({
        status,
        finishedAt: now,
        updatedAt: now,
      })
      .where('id', '=', runId)
      .execute();

    return getRun(runId);
  }

  async function getStatus(): Promise<BenchStatusView> {
    const currentMonthRuns = await countMonthlyFullRuns();
    const runs = await listRuns(1);
    const lastRun = runs[0] ?? null;

    return {
      currentMonthRuns,
      maxMonthlyRuns: MAX_MONTHLY_FULL_RUNS,
      isLimitReached: currentMonthRuns >= MAX_MONTHLY_FULL_RUNS,
      lastRun,
      passRate: lastRun?.passRate ?? null,
    };
  }

  return {
    listRuns,
    getRun,
    startRun,
    updateTaskResult,
    finishRun,
    getStatus,
    countMonthlyFullRuns,
  };
}

export type BenchService = ReturnType<typeof createBenchService>;
