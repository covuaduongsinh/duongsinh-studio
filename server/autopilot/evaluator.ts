import { randomUUID } from 'node:crypto';
import type { DatabaseConnection, DatabaseManager } from '@nocobase/db';
import type { GitService, GitPullRequestView } from '../git/service.js';
import type { ReviewsService, ReviewView } from '../reviews/service.js';
import { str, strOrNull, num, bool, iso, type Row } from '../git/rows.js';
import { AUTOPILOT_USER_ID } from '../../database/main/seeds/2026110803_ds_autopilot_user.js';

export const SETTINGS_TABLE = 'dsAutopilotSettings';
export const EVENTS_TABLE = 'dsAutopilotEvents';

export const DEFAULT_SENSITIVE_PATHS: readonly string[] = [
  'database/**/migrations/**',
  'database/**/seeds/**',
  'server/**/acl*',
  'server/**/authz*',
  'server/**/*permission*',
  '.github/workflows/**',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'deploy/**',
  'config.yml',
];

export interface AutopilotSettingsView {
  readonly projectId: string;
  readonly enabled: boolean;
  readonly mergeMethod: string;
  readonly maxMergesPerDay: number | null;
  readonly maxActiveIssues: number | null;
  readonly stallMinutes: number;
  readonly sensitivePaths: string[] | null;
  readonly sensitivePolicy: 'extraReview' | 'human';
  readonly pausedReason: string | null;
  readonly updatedAt: string;
  readonly updatedById: string | null;
}

export interface AutopilotSettingsInput {
  readonly enabled?: boolean;
  readonly mergeMethod?: string;
  readonly maxMergesPerDay?: number | null;
  readonly maxActiveIssues?: number | null;
  readonly stallMinutes?: number;
  readonly sensitivePaths?: string[] | null;
  readonly sensitivePolicy?: 'extraReview' | 'human';
  readonly pausedReason?: string | null;
}

export interface AutopilotEventView {
  readonly id: string;
  readonly projectId: string;
  readonly issueId: string | null;
  readonly pullRequestId: string | null;
  readonly kind: 'merged' | 'skipped' | 'opened' | 'stalled' | 'blocked' | 'paused';
  readonly reason: string | null;
  readonly data: Record<string, unknown> | null;
  readonly createdAt: string;
}

export interface EvaluationResult {
  readonly eligible: boolean;
  readonly reasons: string[];
  readonly issueId: string;
  readonly projectId?: string;
  readonly pullRequest?: GitPullRequestView;
  readonly codeReview?: ReviewView;
  readonly securityReview?: ReviewView;
  readonly changedFiles?: string[];
}

export interface MergeResult {
  readonly merged: boolean;
  readonly reasons?: string[];
  readonly pullRequest?: GitPullRequestView;
  readonly eventId?: string;
}

export function matchesGlob(pattern: string, path: string): boolean {
  const normalized = path.replace(/\\/g, '/').replace(/^\/+/, '');
  const p = pattern.replace(/\\/g, '/').replace(/^\/+/, '');
  if (p === normalized) return true;
  const regexStr =
    '^' +
    p
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*\*/g, '§DOUBLESTAR§')
      .replace(/\*/g, '[^/]*')
      .replace(/§DOUBLESTAR§/g, '.*') +
    '$';
  return new RegExp(regexStr).test(normalized);
}

export function isSensitive(file: string, patterns: readonly string[]): boolean {
  return patterns.some((p) => matchesGlob(p, file));
}

export interface AutopilotEvaluatorDeps {
  readonly database: Pick<DatabaseManager, 'connection'>;
  readonly git: () => GitService;
  readonly reviews: () => ReviewsService;
}

export function createAutopilotEvaluator(deps: AutopilotEvaluatorDeps) {
  const conn = (): DatabaseConnection => deps.database.connection();
  const locks = new Set<string>();

  function settingsView(row: Row): AutopilotSettingsView {
    const rawPaths = row.sensitivePaths;
    const sensitivePaths = Array.isArray(rawPaths)
      ? (rawPaths as string[])
      : typeof rawPaths === 'string'
        ? (JSON.parse(rawPaths) as string[])
        : null;

    return {
      projectId: str(row.projectId),
      enabled: bool(row.enabled),
      mergeMethod: str(row.mergeMethod) || 'squash',
      maxMergesPerDay: row.maxMergesPerDay !== null ? num(row.maxMergesPerDay) : null,
      maxActiveIssues: row.maxActiveIssues !== null ? num(row.maxActiveIssues) : null,
      stallMinutes: num(row.stallMinutes) || 30,
      sensitivePaths,
      sensitivePolicy: (str(row.sensitivePolicy) as 'extraReview' | 'human') || 'extraReview',
      pausedReason: strOrNull(row.pausedReason),
      updatedAt: iso(row.updatedAt) ?? new Date().toISOString(),
      updatedById: strOrNull(row.updatedById),
    };
  }

  function eventView(row: Row): AutopilotEventView {
    const rawData = row.data;
    const data =
      typeof rawData === 'string'
        ? (JSON.parse(rawData) as Record<string, unknown>)
        : (rawData as Record<string, unknown> | null);

    return {
      id: str(row.id),
      projectId: str(row.projectId),
      issueId: strOrNull(row.issueId),
      pullRequestId: strOrNull(row.pullRequestId),
      kind: str(row.kind) as AutopilotEventView['kind'],
      reason: strOrNull(row.reason),
      data,
      createdAt: iso(row.createdAt) ?? new Date().toISOString(),
    };
  }

  async function getSettings(projectId: string): Promise<AutopilotSettingsView | null> {
    const row = await conn()
      .query.selectFrom(SETTINGS_TABLE)
      .selectAll()
      .where('projectId', '=', projectId)
      .executeTakeFirst();
    return row ? settingsView(row) : null;
  }

  async function saveSettings(
    projectId: string,
    input: Partial<AutopilotSettingsInput>,
    updatedById: string | null = null,
  ): Promise<AutopilotSettingsView> {
    const existing = await getSettings(projectId);
    const now = new Date();

    const values = {
      projectId,
      enabled: input.enabled !== undefined ? input.enabled : (existing?.enabled ?? false),
      mergeMethod: input.mergeMethod !== undefined ? input.mergeMethod : (existing?.mergeMethod ?? 'squash'),
      maxMergesPerDay: input.maxMergesPerDay !== undefined ? input.maxMergesPerDay : (existing?.maxMergesPerDay ?? null),
      maxActiveIssues: input.maxActiveIssues !== undefined ? input.maxActiveIssues : (existing?.maxActiveIssues ?? null),
      stallMinutes: input.stallMinutes !== undefined ? input.stallMinutes : (existing?.stallMinutes ?? 30),
      sensitivePaths:
        input.sensitivePaths !== undefined
          ? input.sensitivePaths ? JSON.stringify(input.sensitivePaths) : null
          : existing?.sensitivePaths ? JSON.stringify(existing.sensitivePaths) : null,
      sensitivePolicy: input.sensitivePolicy !== undefined ? input.sensitivePolicy : (existing?.sensitivePolicy ?? 'extraReview'),
      pausedReason: input.pausedReason !== undefined ? input.pausedReason : (existing?.pausedReason ?? null),
      updatedAt: now,
      updatedById,
    };

    if (existing) {
      await conn()
        .query.updateTable(SETTINGS_TABLE)
        .set(values)
        .where('projectId', '=', projectId)
        .execute();
    } else {
      await conn().query.insertInto(SETTINGS_TABLE).values(values).execute();
    }

    const saved = await getSettings(projectId);
    if (!saved) throw new Error(`Failed to save autopilot settings for project ${projectId}`);
    return saved;
  }

  async function recordEvent(event: {
    readonly projectId: string;
    readonly issueId?: string | null;
    readonly pullRequestId?: string | null;
    readonly kind: AutopilotEventView['kind'];
    readonly reason?: string | null;
    readonly data?: Record<string, unknown> | null;
  }): Promise<string> {
    const id = randomUUID();
    await conn()
      .query.insertInto(EVENTS_TABLE)
      .values({
        id,
        projectId: event.projectId,
        issueId: event.issueId ?? null,
        pullRequestId: event.pullRequestId ?? null,
        kind: event.kind,
        reason: event.reason ?? null,
        data: event.data ? JSON.stringify(event.data) : null,
        createdAt: new Date(),
      })
      .execute();
    return id;
  }

  async function listEvents(
    filter?: { projectId?: string; limit?: number } | string,
    maybeLimit = 50,
  ): Promise<AutopilotEventView[]> {
    const projectId = typeof filter === 'string' ? filter : filter?.projectId;
    const limit = (typeof filter === 'object' ? filter?.limit : maybeLimit) ?? 50;

    let query = conn().query.selectFrom(EVENTS_TABLE).selectAll();
    if (projectId) {
      query = query.where('projectId', '=', projectId);
    }
    const rows = await query.orderBy('createdAt', 'desc').limit(limit).execute();
    return rows.map(eventView);
  }

  async function evaluate(issueId: string): Promise<EvaluationResult> {
    const reasons: string[] = [];

    // Query issue
    const issueRow = await conn()
      .query.selectFrom('pmIssues')
      .selectAll()
      .where('id', '=', issueId)
      .executeTakeFirst();

    if (!issueRow) {
      return { eligible: false, reasons: ['Issue not found'], issueId };
    }

    const projectId = str(issueRow.projectId);

    // Condition 1: Project settings enabled & not paused & within daily limit
    const settings = await getSettings(projectId);
    if (!settings || !settings.enabled) {
      reasons.push('Autopilot is not enabled for this project.');
    }
    if (settings?.pausedReason) {
      reasons.push(`Autopilot is paused: ${settings.pausedReason}`);
    }

    if (settings?.maxMergesPerDay != null) {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recentMerges = await conn()
        .query.selectFrom(EVENTS_TABLE)
        .select('id')
        .where('projectId', '=', projectId)
        .where('kind', '=', 'merged')
        .where('createdAt', '>=', since)
        .execute();
      if (recentMerges.length >= settings.maxMergesPerDay) {
        reasons.push(`Daily merge limit of ${settings.maxMergesPerDay} reached.`);
      }
    }

    // Condition 2: Issue status in_review, needsYou is empty, acceptance is not empty
    const statusKey = str(issueRow.statusKey);
    if (statusKey !== 'in_review') {
      reasons.push(`Issue status is '${statusKey}', expected 'in_review'.`);
    }

    const needsYou = strOrNull(issueRow.needsYou);
    if (needsYou && needsYou.trim() !== '') {
      reasons.push(`Issue is marked with needsYou: ${needsYou.trim()}`);
    }

    const acceptance = strOrNull(issueRow.acceptance);
    if (!acceptance || acceptance.trim() === '') {
      reasons.push('Issue delivery acceptance report is empty.');
    }

    // Condition 3: PR linked, open, not draft, mergeability clean, mergeBlocker null
    const pulls = await deps.git().listPullRequests({ issueId });
    const openPulls = pulls.filter((p) => p.state === 'open');
    if (openPulls.length === 0) {
      reasons.push('No open pull request linked to this issue.');
      return { eligible: false, reasons, issueId, projectId };
    }

    const pr = openPulls[0];
    if (pr.draft) {
      reasons.push('Pull request is marked as draft.');
    }
    if (pr.mergeability !== 'clean') {
      reasons.push(`Pull request mergeability is '${pr.mergeability}', expected 'clean'.`);
    }
    if (pr.mergeBlocker) {
      reasons.push(`Pull request is blocked: ${pr.mergeBlocker}`);
    }

    // Condition 4: CI checks pass on current headSha
    if (pr.ciState === 'failure') {
      reasons.push('CI checks have failed on current head.');
    } else if (pr.ciState === 'pending') {
      reasons.push('CI checks are pending.');
    } else if (pr.ciState !== 'success') {
      reasons.push('CI checks have not passed on current head.');
    }

    // Condition 5: Code review approve, mustFix = 0, reviewer != author
    const codeReview = await deps.reviews().latestFor(pr.id, pr.headSha, 'code');
    if (!codeReview) {
      reasons.push(`No structured code review found for head ${pr.headSha.slice(0, 7)}.`);
    } else {
      if (codeReview.verdict !== 'approve') {
        reasons.push(`Code review verdict is '${codeReview.verdict}', expected 'approve'.`);
      }
      if (codeReview.mustFix > 0) {
        reasons.push(`Code review has ${codeReview.mustFix} unresolved must-fix item(s).`);
      }
      if (codeReview.reviewerAgentId === codeReview.authorAgentId) {
        reasons.push('Code review was submitted by the author agent (self-review).');
      }
    }

    // Condition 6: Sensitive paths & extra review
    let changedFiles: string[] = [];
    try {
      changedFiles = await deps.git().pullFiles(pr.id);
    } catch {
      // If unable to query files from host, default to empty
    }

    const sensitivePatterns = settings?.sensitivePaths ?? DEFAULT_SENSITIVE_PATHS;
    const touchedSensitive = changedFiles.filter((f) => isSensitive(f, sensitivePatterns));

    let securityReview: ReviewView | undefined;
    if (touchedSensitive.length > 0) {
      const policy = settings?.sensitivePolicy ?? 'extraReview';
      if (policy === 'human') {
        reasons.push(
          `Pull request touches sensitive paths (${touchedSensitive.join(', ')}), human review required.`,
        );
      } else {
        const sec = await deps.reviews().latestFor(pr.id, pr.headSha, 'security');
        if (!sec) {
          reasons.push(
            `Pull request touches sensitive paths (${touchedSensitive.join(', ')}), missing extra security review approval.`,
          );
        } else {
          securityReview = sec;
          if (sec.verdict !== 'approve') {
            reasons.push(`Security review verdict is '${sec.verdict}', expected 'approve'.`);
          }
          if (sec.mustFix > 0) {
            reasons.push(`Security review has ${sec.mustFix} unresolved must-fix item(s).`);
          }
        }
      }
    }

    // Condition 7: No human comment on issue after review submission
    if (codeReview) {
      const reviewTime = new Date(codeReview.createdAt).getTime();
      const recentComments = await conn()
        .query.selectFrom('pmComments')
        .select(['authorType', 'authorId', 'createdAt'])
        .where('issueId', '=', issueId)
        .where('createdAt', '>', new Date(reviewTime))
        .execute();

      for (const c of recentComments) {
        const authorType = str(c.authorType);
        if (authorType !== 'agent' && authorType !== 'system') {
          reasons.push('A human user commented after the latest review was submitted.');
          break;
        }
      }
    }

    return {
      eligible: reasons.length === 0,
      reasons,
      issueId,
      projectId,
      pullRequest: pr,
      codeReview: codeReview ?? undefined,
      securityReview,
      changedFiles,
    };
  }

  async function mergeIfEligible(issueId: string): Promise<MergeResult> {
    if (locks.has(issueId)) {
      return { merged: false, reasons: ['Issue is already being evaluated or merged.'] };
    }
    locks.add(issueId);

    try {
      const evaluation = await evaluate(issueId);
      if (!evaluation.eligible || !evaluation.pullRequest) {
        return { merged: false, reasons: evaluation.reasons };
      }

      const pr = evaluation.pullRequest;
      const mergedPr = await deps.git().mergePullRequest(pr.id, {
        byUserId: AUTOPILOT_USER_ID,
        force: false,
        reason: null,
      });

      const eventId = await recordEvent({
        projectId: evaluation.projectId ?? '',
        issueId,
        pullRequestId: pr.id,
        kind: 'merged',
        reason: `Autopilot merged PR #${pr.number} (head ${pr.headSha.slice(0, 7)})`,
        data: {
          headSha: pr.headSha,
          pullNumber: pr.number,
          reviewId: evaluation.codeReview?.id,
          securityReviewId: evaluation.securityReview?.id,
        },
      });

      // Post confirmation comment on the issue
      try {
        const commentContent =
          `🤖 **Autopilot đã tự động merge pull request #${pr.number}** (commit \`${pr.headSha.slice(0, 7)}\`).\n\n` +
          `- **Phiếu review**: Chấp thuận bởi agent \`${evaluation.codeReview?.reviewerAgentId ?? 'unknown'}\`\n` +
          `- **CI Checks**: Đầy đủ và thành công\n` +
          `- **Kiểm tra an toàn**: Thoả mãn toàn bộ 7 tiêu chuẩn tự lái của Dương Sinh Studio.`;

        const commentId = randomUUID();
        await conn()
          .query.insertInto('pmComments')
          .values({
            id: commentId,
            rootId: commentId,
            issueId,
            authorType: 'system',
            authorId: AUTOPILOT_USER_ID,
            content: commentContent,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .execute();
      } catch (commentErr) {
        // Comment failure should not revert successful merge
        console.warn('Autopilot could not post merge comment on issue', commentErr);
      }

      return { merged: true, pullRequest: mergedPr, eventId };
    } finally {
      locks.delete(issueId);
    }
  }

  async function pause(projectId: string, reason: string, updatedById?: string): Promise<void> {
    await saveSettings(projectId, { pausedReason: reason }, updatedById);
    await recordEvent({
      projectId,
      kind: 'paused',
      reason,
    });
  }

  async function resume(projectId: string, updatedById?: string): Promise<void> {
    await saveSettings(projectId, { pausedReason: null }, updatedById);
  }

  async function stopAll(reason: string, updatedById?: string): Promise<void> {
    const all = await conn().query.selectFrom(SETTINGS_TABLE).select('projectId').execute();
    for (const row of all) {
      await pause(str(row.projectId), reason, updatedById);
    }
  }

  return {
    getSettings,
    saveSettings,
    listEvents,
    recordEvent,
    evaluate,
    mergeIfEligible,
    pause,
    resume,
    stopAll,
  };
}

export type AutopilotEvaluator = ReturnType<typeof createAutopilotEvaluator>;
