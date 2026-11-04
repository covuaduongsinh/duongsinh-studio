import { randomUUID } from 'node:crypto';
import type { DatabaseConnection, DatabaseManager } from '@nocobase/db';
import type { GitService, GitPullRequestView } from '../git/service.js';
import { str, strOrNull, num, bool, iso, type Row } from '../git/rows.js';

export const REVIEWS = 'dsReviews';

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

export interface ReviewSubmitInput {
  readonly runId: string;
  readonly pullRequestId: string;
  readonly headSha: string;
  readonly verdict: 'approve' | 'changes';
  readonly mustFix?: number;
  readonly shouldFix?: number;
  readonly kind?: 'code' | 'security';
  readonly checklist: Record<string, unknown>;
  readonly summary: string;
}

export interface ReviewView {
  readonly id: string;
  readonly pullRequestId: string;
  readonly issueId: string | null;
  readonly headSha: string;
  readonly reviewerAgentId: string;
  readonly reviewerRunId: string;
  readonly authorAgentId: string;
  readonly verdict: 'approve' | 'changes';
  readonly mustFix: number;
  readonly shouldFix: number;
  readonly kind: 'code' | 'security';
  readonly sameModel: boolean;
  readonly checklist: Record<string, unknown>;
  readonly summary: string;
  readonly createdAt: string;
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
}) {
  const conn = (): DatabaseConnection => deps.database.connection();

  function reviewView(row: Row): ReviewView {
    return {
      id: str(row.id),
      pullRequestId: str(row.pullRequestId),
      issueId: strOrNull(row.issueId),
      headSha: str(row.headSha),
      reviewerAgentId: str(row.reviewerAgentId),
      reviewerRunId: str(row.reviewerRunId),
      authorAgentId: str(row.authorAgentId),
      verdict: str(row.verdict) as 'approve' | 'changes',
      mustFix: num(row.mustFix),
      shouldFix: num(row.shouldFix),
      kind: str(row.kind) as 'code' | 'security',
      sameModel: bool(row.sameModel),
      checklist: (typeof row.checklist === 'string'
        ? JSON.parse(row.checklist)
        : row.checklist) as Record<string, unknown>,
      summary: str(row.summary),
      createdAt: iso(row.createdAt) ?? new Date().toISOString(),
    };
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
      throw new ReviewError('NOT_FOUND', 'RUN_NOT_FOUND', 'Review run not found.');
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
      .select(['runs.agentId as agentId', 'runs.model as model', 'runs.tool as tool'])
      .where('repos.headSha', '=', pull.headSha)
      .where('repos.pushed', '=', true)
      .orderBy('repos.updatedAt', 'desc')
      .executeTakeFirst();

    if (!authorRow && pull.headRef) {
      authorRow = await conn()
        .query.selectFrom('agRunRepos as repos')
        .innerJoin('agRuns as runs', 'runs.id', 'repos.runId')
        .select(['runs.agentId as agentId', 'runs.model as model', 'runs.tool as tool'])
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
    if (reviewerAgentId === authorAgentId) {
      throw new ReviewError(
        'FAILED_PRECONDITION',
        'SELF_REVIEW_NOT_ALLOWED',
        'An agent may not review its own pull request.',
      );
    }

    const authorModel = strOrNull(authorRow.model) ?? strOrNull(authorRow.tool);
    const sameModel = Boolean(
      reviewerModel && authorModel && reviewerModel.toLowerCase() === authorModel.toLowerCase(),
    );

    // 4. Validate kind and security checklist if security
    const kind = input.kind ?? 'code';
    if (kind === 'security') {
      const sec = input.checklist?.security as Record<string, unknown> | undefined;
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

    // 5. Insert review record
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
    return reviewView(row);
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

    const row: Row | undefined = await query.orderBy('createdAt', 'desc').executeTakeFirst();
    return row ? reviewView(row) : null;
  }

  async function listForPull(
    pullRequestId: string,
    options?: { readonly headSha?: string; readonly kind?: 'code' | 'security' },
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
    return rows.map(reviewView);
  }

  return {
    submit,
    latestFor,
    listForPull,
    isRunReadOnly,
  };
}

export type ReviewsService = ReturnType<typeof createReviewsService>;
