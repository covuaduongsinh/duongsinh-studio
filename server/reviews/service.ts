import { randomUUID } from 'node:crypto';
import type { DatabaseConnection, DatabaseManager } from '@nocobase/db';
import type { GitService, GitPullRequestView } from '../git/service.js';
import { str, strOrNull, num, bool, iso, type Row } from '../git/rows.js';
import { verificationReviewProblem } from './verification-check.js';

export const REVIEWS = 'dsReviews';
export const REVIEW_CRITERIA_CHECKS = 'dsReviewCriteriaChecks';

export class ReviewError extends Error {
  override name = 'ReviewError';
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

export interface ReviewCriteriaCheck {
  readonly criterionId: string;
  readonly passed: boolean;
  readonly notes?: string | null;
}

export interface ReviewSubmitInput {
  readonly runId: string;
  readonly pullRequestId: string;
  readonly headSha: string;
  readonly verdict: 'approve' | 'changes' | 'reject' | 'request_changes';
  readonly mustFix?: number;
  readonly shouldFix?: number;
  readonly kind?: 'code' | 'security';
  readonly checklist: Record<string, unknown>;
  readonly summary: string;
  readonly criteriaChecks?: readonly ReviewCriteriaCheck[];
}

export interface ReviewView {
  readonly id: string;
  readonly pullRequestId: string;
  readonly issueId: string | null;
  readonly headSha: string;
  readonly reviewerAgentId: string;
  readonly reviewerRunId: string;
  readonly authorAgentId: string;
  readonly verdict: 'approve' | 'changes' | 'reject' | 'request_changes';
  readonly mustFix: number;
  readonly shouldFix: number;
  readonly kind: 'code' | 'security';
  readonly sameModel: boolean;
  readonly checklist: Record<string, unknown>;
  readonly summary: string;
  readonly createdAt: string;
  readonly criteriaChecks?: readonly ReviewCriteriaCheck[];
}

/** The required keys in `checklist.security` when kind is 'security'. */
export const REQUIRED_SECURITY_KEYS = [
  'tenantIsolation',
  'permissionBoundaries',
  'migrationDown',
  'dependenciesLicense',
  'noSecrets',
] as const;

export interface ReviewsServiceDeps {
  readonly database: Pick<DatabaseManager, 'connection'>;
  readonly git: () => GitService;
}

export function isReadOnlyText(text: string): boolean {
  return /mode:\s*read-only/i.test(text);
}

export function createReviewsService(deps: {
  readonly database: Pick<DatabaseManager, 'connection'>;
  readonly git: () => GitService;
  /** Told of every review recorded on a pull request of an issue (the reaction rules, plan T T1.2c); never fails it. */
  readonly onReviewed?: (input: {
    readonly issueId: string;
    readonly pullRequestId: string;
    readonly headSha: string;
    readonly verdict: string;
    readonly summary: string;
  }) => Promise<void>;
}) {
  const conn = (): DatabaseConnection => deps.database.connection();

  function reviewView(
    row: Row,
    criteriaChecks?: readonly ReviewCriteriaCheck[],
  ): ReviewView {
    return {
      id: str(row.id),
      pullRequestId: str(row.pullRequestId),
      issueId: strOrNull(row.issueId),
      headSha: str(row.headSha),
      reviewerAgentId: str(row.reviewerAgentId),
      reviewerRunId: str(row.reviewerRunId),
      authorAgentId: str(row.authorAgentId),
      verdict: str(row.verdict) as
        'approve' | 'changes' | 'reject' | 'request_changes',
      mustFix: num(row.mustFix),
      shouldFix: num(row.shouldFix),
      kind: str(row.kind) as 'code' | 'security',
      sameModel: bool(row.sameModel),
      checklist: (typeof row.checklist === 'string'
        ? JSON.parse(row.checklist)
        : row.checklist) as Record<string, unknown>,
      summary: str(row.summary),
      createdAt: iso(row.createdAt) ?? new Date().toISOString(),
      ...(criteriaChecks ? { criteriaChecks } : {}),
    };
  }

  async function loadChecksForReviewIds(
    reviewIds: readonly string[],
  ): Promise<Map<string, ReviewCriteriaCheck[]>> {
    const map = new Map<string, ReviewCriteriaCheck[]>();
    if (reviewIds.length === 0) return map;
    const rows: Row[] = await conn()
      .query.selectFrom(REVIEW_CRITERIA_CHECKS)
      .selectAll()
      .where('reviewId', 'in', reviewIds as string[])
      .orderBy('createdAt', 'asc')
      .execute();
    for (const row of rows) {
      const reviewId = str(row.reviewId);
      const list = map.get(reviewId) ?? [];
      list.push({
        criterionId: str(row.criterionId),
        passed: bool(row.passed),
        notes: strOrNull(row.notes),
      });
      map.set(reviewId, list);
    }
    return map;
  }

  async function isRunReadOnly(runId: string): Promise<boolean> {
    const inputs: Row[] = await conn()
      .query.selectFrom('agRunInputs')
      .select(['text', 'payload'])
      .where('runId', '=', runId)
      .execute();

    for (const input of inputs) {
      if (typeof input.text === 'string' && isReadOnlyText(input.text)) {
        return true;
      }
      if (input.payload) {
        try {
          const parsed: unknown =
            typeof input.payload === 'string'
              ? JSON.parse(input.payload)
              : input.payload;
          if (
            parsed &&
            typeof parsed === 'object' &&
            ('mode' in parsed || 'readOnly' in parsed)
          ) {
            const obj = parsed as Record<string, unknown>;
            if (obj.mode === 'read-only' || obj.readOnly === true) {
              return true;
            }
          }
        } catch {
          // ignore
        }
      }
    }
    return false;
  }

  async function submit(input: ReviewSubmitInput): Promise<ReviewView> {
    // 1. Verify run
    const run: Row | undefined = await conn()
      .query.selectFrom('agRuns')
      .selectAll()
      .where('id', '=', input.runId)
      .executeTakeFirst();

    if (!run) {
      throw new ReviewError(
        'NOT_FOUND',
        'RUN_NOT_FOUND',
        'Review run not found.',
      );
    }
    if (run.status !== 'running' && run.status !== 'dispatched') {
      throw new ReviewError(
        'FAILED_PRECONDITION',
        'RUN_NOT_RUNNING',
        `The review run is ${String(run.status)}, not running.`,
      );
    }

    const readOnly = await isRunReadOnly(input.runId);
    if (!readOnly) {
      throw new ReviewError(
        'FAILED_PRECONDITION',
        'NOT_READ_ONLY',
        'Reviews may only be submitted by a read-only run.',
      );
    }

    const reviewerAgentId = str(run.agentId);
    const reviewerModel = strOrNull(run.model) ?? strOrNull(run.tool);

    // 2. Refresh & check pull request
    let pull: GitPullRequestView;
    try {
      pull = await deps.git().refreshPullRequest(input.pullRequestId);
    } catch {
      pull = await deps.git().getPullRequest(input.pullRequestId);
    }

    if (input.headSha !== pull.headSha) {
      throw new ReviewError(
        'FAILED_PRECONDITION',
        'HEAD_SHA_MISMATCH',
        `Pull request head (${pull.headSha}) does not match the reviewed commit (${input.headSha}).`,
      );
    }

    // 3. Determine author agent
    let authorRow: Row | undefined = await conn()
      .query.selectFrom('agRunRepos as repos')
      .innerJoin('agRuns as runs', 'runs.id', 'repos.runId')
      .select([
        'runs.id as runId',
        'runs.agentId as agentId',
        'runs.model as model',
        'runs.tool as tool',
      ])
      .where('repos.headSha', '=', pull.headSha)
      .where('repos.pushed', '=', true)
      .orderBy('repos.updatedAt', 'desc')
      .executeTakeFirst();

    if (!authorRow && pull.headRef) {
      authorRow = await conn()
        .query.selectFrom('agRunRepos as repos')
        .innerJoin('agRuns as runs', 'runs.id', 'repos.runId')
        .select([
          'runs.id as runId',
          'runs.agentId as agentId',
          'runs.model as model',
          'runs.tool as tool',
        ])
        .where('repos.branch', '=', pull.headRef)
        .where('repos.pushed', '=', true)
        .orderBy('repos.updatedAt', 'desc')
        .executeTakeFirst();
    }

    if (!authorRow) {
      throw new ReviewError(
        'FAILED_PRECONDITION',
        'AUTHOR_UNKNOWN',
        'Cannot determine the agent that authored and pushed the pull request head.',
      );
    }

    const authorAgentId = str(authorRow.agentId);
    const authorModel = strOrNull(authorRow.model) ?? strOrNull(authorRow.tool);
    const sameModel = Boolean(
      reviewerModel &&
      authorModel &&
      reviewerModel.toLowerCase() === authorModel.toLowerCase(),
    );

    const isSameRun = Boolean(
      input.runId && authorRow.runId && input.runId === str(authorRow.runId),
    );

    // An agent may not review its own PR if it is the exact same run,
    // or if the same agent uses the same model (self-review).
    // Cross-model reviews within the same team agent (e.g. Opus reviewing Sonnet's PR) are explicitly permitted.
    if (isSameRun || (reviewerAgentId === authorAgentId && sameModel)) {
      throw new ReviewError(
        'FAILED_PRECONDITION',
        'SELF_REVIEW_NOT_ALLOWED',
        'An agent may not review its own pull request with the same model.',
      );
    }

    // 4. Validate kind and security checklist if security
    const kind = input.kind ?? 'code';
    if (kind === 'security') {
      const sec = input.checklist?.security as
        Record<string, unknown> | undefined;
      if (!sec || typeof sec !== 'object') {
        throw new ReviewError(
          'FAILED_PRECONDITION',
          'SECURITY_CHECKLIST_INCOMPLETE',
          'A security review must include a checklist.security object.',
        );
      }
      for (const reqKey of REQUIRED_SECURITY_KEYS) {
        const val = sec[reqKey];
        const pass = val === true || val === 'pass' || val === 'ok';
        if (!pass) {
          throw new ReviewError(
            'FAILED_PRECONDITION',
            'SECURITY_CHECKLIST_INCOMPLETE',
            `Security review criterion ${reqKey} is incomplete or failed.`,
            { criterion: reqKey },
          );
        }
      }
    }

    // 5. Check acceptance criteria if provided
    const failedCriteria = input.criteriaChecks?.filter((c) => !c.passed);
    if (
      failedCriteria &&
      failedCriteria.length > 0 &&
      input.verdict === 'approve'
    ) {
      throw new ReviewError(
        'FAILED_PRECONDITION',
        'CRITERIA_CHECK_FAILED',
        'Cannot approve review when one or more criteria checks failed.',
        {
          criterionId: failedCriteria[0].criterionId,
          failedCount: String(failedCriteria.length),
        },
      );
    }

    // 5b. Approving means the verification output was read, and a verification CI contradicted never stands (plan T, T2).
    if (input.verdict === 'approve' && pull.issueId) {
      const latest = await conn()
        .query.selectFrom('dsVerifications')
        .select(['id', 'result'])
        .where('issueId', '=', pull.issueId)
        .where('headSha', '=', input.headSha)
        .orderBy('createdAt', 'desc')
        .executeTakeFirst();
      if (latest) {
        const items = await conn()
          .query.selectFrom('dsVerificationItems as item')
          .innerJoin(
            'dsIssueCriteria as criterion',
            'criterion.id',
            'item.criterionId',
          )
          .select([
            'criterion.checkKind as checkKind',
            'item.exitCode as exitCode',
          ])
          .where('item.verificationId', '=', latest.id)
          .execute();
        const problem = verificationReviewProblem(
          {
            result: str(latest.result),
            items: items.map((item) => ({
              checkKind: str(item.checkKind),
              exitCode: item.exitCode == null ? null : num(item.exitCode),
            })),
          },
          input.verdict,
          input.checklist,
        );
        if (problem)
          throw new ReviewError(
            'FAILED_PRECONDITION',
            problem,
            problem === 'VERIFICATION_CONTRADICTED'
              ? "CI is red on the head this verification covers; the agent's claim is contradicted."
              : 'Approve only after reading the output of the verified tests and commands: set checklist.verificationOutputReviewed to true.',
          );
      }
    }

    // 6. Insert review record
    const id = randomUUID();
    const row = {
      id,
      pullRequestId: pull.id,
      issueId: pull.issueId,
      headSha: input.headSha,
      reviewerAgentId,
      reviewerRunId: input.runId,
      authorAgentId,
      verdict: input.verdict,
      mustFix: input.mustFix ?? 0,
      shouldFix: input.shouldFix ?? 0,
      kind,
      sameModel,
      checklist: JSON.stringify(input.checklist),
      summary: input.summary,
      createdAt: new Date(),
    };

    await conn().query.insertInto(REVIEWS).values(row).execute();
    if (pull.issueId && deps.onReviewed)
      await deps
        .onReviewed({
          issueId: pull.issueId,
          pullRequestId: pull.id,
          headSha: input.headSha,
          verdict: input.verdict,
          summary: input.summary,
        })
        .catch((error: unknown) =>
          console.warn('A review reaction failed', error),
        );

    const insertedChecks: ReviewCriteriaCheck[] = [];
    if (input.criteriaChecks && input.criteriaChecks.length > 0) {
      for (const check of input.criteriaChecks) {
        await conn()
          .query.insertInto(REVIEW_CRITERIA_CHECKS)
          .values({
            id: randomUUID(),
            reviewId: id,
            criterionId: check.criterionId,
            passed: check.passed,
            notes: check.notes ?? null,
            createdAt: new Date(),
          })
          .execute();
        insertedChecks.push({
          criterionId: check.criterionId,
          passed: check.passed,
          notes: check.notes ?? null,
        });
      }
    }

    return reviewView(row, insertedChecks);
  }

  async function latestFor(
    pullRequestId: string,
    headSha: string,
    kind?: 'code' | 'security',
  ): Promise<ReviewView | null> {
    let query = conn()
      .query.selectFrom(REVIEWS)
      .selectAll()
      .where('pullRequestId', '=', pullRequestId)
      .where('headSha', '=', headSha);

    if (kind) {
      query = query.where('kind', '=', kind);
    }

    const row: Row | undefined = await query
      .orderBy('createdAt', 'desc')
      .executeTakeFirst();
    if (!row) return null;
    const checksMap = await loadChecksForReviewIds([str(row.id)]);
    return reviewView(row, checksMap.get(str(row.id)) ?? []);
  }

  async function listForPull(
    pullRequestId: string,
    options?: {
      readonly headSha?: string;
      readonly kind?: 'code' | 'security';
    },
  ): Promise<ReviewView[]> {
    let query = conn()
      .query.selectFrom(REVIEWS)
      .selectAll()
      .where('pullRequestId', '=', pullRequestId);

    if (options?.headSha) {
      query = query.where('headSha', '=', options.headSha);
    }
    if (options?.kind) {
      query = query.where('kind', '=', options.kind);
    }

    const rows: Row[] = await query.orderBy('createdAt', 'desc').execute();
    const reviewIds = rows.map((r) => str(r.id));
    const checksMap = await loadChecksForReviewIds(reviewIds);
    return rows.map((r) => reviewView(r, checksMap.get(str(r.id)) ?? []));
  }

  async function listRecent(limit = 20): Promise<ReviewView[]> {
    const rows: Row[] = await conn()
      .query.selectFrom(REVIEWS)
      .selectAll()
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .execute();
    const reviewIds = rows.map((r) => str(r.id));
    const checksMap = await loadChecksForReviewIds(reviewIds);
    return rows.map((r) => reviewView(r, checksMap.get(str(r.id)) ?? []));
  }

  return {
    submit,
    latestFor,
    listForPull,
    listRecent,
    isRunReadOnly,
  };
}

export type ReviewsService = ReturnType<typeof createReviewsService>;
