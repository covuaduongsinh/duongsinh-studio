import { randomUUID } from 'node:crypto';
import type { DatabaseConnection, DatabaseManager } from '@nocobase/db';
import { str, strOrNull, num, type Row } from '../git/rows.js';
import type { AutopilotEvaluator } from './evaluator.js';
import { AUTOPILOT_USER_ID } from '../../database/main/seeds/2026110803_ds_autopilot_user.js';
import { PROJECT_MANAGER_AGENT_ID } from './scheduler.js';

export interface QuotaFailureInput {
  readonly runId?: string;
  readonly failureReason?: string;
  readonly message?: string;
}

export interface QuotaThrottleState {
  readonly activeUntil: Date;
  readonly retryDelayMs: number;
  readonly effectiveConcurrency: number;
}

export interface StallScanResult {
  readonly stalledCount: number;
  readonly blockedCount: number;
  readonly stalledIssueIds: string[];
  readonly blockedIssueIds: string[];
}

export interface AutopilotStallDetectorDeps {
  readonly database: Pick<DatabaseManager, 'connection'>;
  readonly evaluator: AutopilotEvaluator;
  readonly agents?: {
    readonly runs?: {
      readonly enqueue?: (params: Record<string, unknown>) => Promise<unknown>;
      readonly retry?: (runId: string) => Promise<unknown>;
    };
  };
  readonly notify?: (notice: {
    readonly to: string[];
    readonly key: string;
    readonly title: string;
    readonly body: string;
    readonly path: string;
  }) => Promise<void>;
  readonly owners?: () => Promise<string[]>;
  readonly now?: () => Date;
}

export interface AutopilotStallDetector {
  detectAndHandleStalls(projectId?: string): Promise<StallScanResult>;
  handleQuotaFailure(
    projectId: string,
    issueId: string,
    failure: QuotaFailureInput,
  ): Promise<{
    throttled: boolean;
    retryDelayMs: number;
    effectiveConcurrency: number;
  }>;
  getQuotaThrottle(projectId: string): QuotaThrottleState | null;
}

const DEFAULT_STALL_MINUTES = 30;
const INITIAL_QUOTA_BACKOFF_MS = 30 * 60 * 1000; // 30 minutes
const MAX_QUOTA_BACKOFF_MS = 2 * 60 * 60 * 1000; // 2 hours

export function createAutopilotStallDetector(
  deps: AutopilotStallDetectorDeps,
): AutopilotStallDetector {
  const conn = (): DatabaseConnection => deps.database.connection();
  const getNow = (): Date => (deps.now ? deps.now() : new Date());

  const quotaThrottles = new Map<string, QuotaThrottleState>();

  function getQuotaThrottle(projectId: string): QuotaThrottleState | null {
    const existing = quotaThrottles.get(projectId);
    if (!existing) return null;
    if (getNow() > existing.activeUntil) {
      quotaThrottles.delete(projectId);
      return null;
    }
    return existing;
  }

  async function handleQuotaFailure(
    projectId: string,
    issueId: string,
    failure: QuotaFailureInput,
  ) {
    const now = getNow();
    const existing = getQuotaThrottle(projectId);
    const delay = existing
      ? Math.min(existing.retryDelayMs * 2, MAX_QUOTA_BACKOFF_MS)
      : INITIAL_QUOTA_BACKOFF_MS;

    const state: QuotaThrottleState = {
      activeUntil: new Date(now.getTime() + delay),
      retryDelayMs: delay,
      effectiveConcurrency: 1,
    };
    quotaThrottles.set(projectId, state);

    // Record audit event for quota limitation
    await deps.evaluator.recordEvent({
      projectId,
      issueId,
      kind: 'stalled',
      reason: `toolQuota rate limit encountered: ${failure.message ?? failure.failureReason ?? 'rate limited'}. Backing off for ${Math.round(delay / 60000)} minutes and throttling concurrency to 1.`,
      data: {
        runId: failure.runId,
        retryDelayMs: delay,
        effectiveConcurrency: 1,
      },
    });

    return {
      throttled: true,
      retryDelayMs: delay,
      effectiveConcurrency: 1,
    };
  }

  async function detectAndHandleStalls(
    targetProjectId?: string,
  ): Promise<StallScanResult> {
    const now = getNow();
    const stalledIssueIds: string[] = [];
    const blockedIssueIds: string[] = [];

    // 1. Determine which projects to scan
    let projectIds: string[] = [];
    if (targetProjectId) {
      const settings = await deps.evaluator.getSettings(targetProjectId);
      if (settings?.enabled && !settings.pausedReason) {
        projectIds = [targetProjectId];
      }
    } else {
      const activeProjects = await conn()
        .query.selectFrom('dsAutopilotSettings')
        .select(['projectId'])
        .where('enabled', '=', true)
        .where('pausedReason', 'is', null)
        .execute();
      projectIds = activeProjects.map((p: Row) => str(p.projectId));
    }

    for (const projectId of projectIds) {
      const settings = await deps.evaluator.getSettings(projectId);
      const stallMinutes = settings?.stallMinutes ?? DEFAULT_STALL_MINUTES;
      const stallThresholdMs = stallMinutes * 60 * 1000;

      // Find in_progress issues for this project
      const inProgressIssues = await conn()
        .query.selectFrom('pmIssues')
        .selectAll()
        .where('projectId', '=', projectId)
        .where('statusKey', '=', 'in_progress')
        .execute();

      for (const issue of inProgressIssues) {
        const issueId = str(issue.id);

        // Check if there is an active run for this issue
        const activeRuns = await conn()
          .query.selectFrom('agRuns')
          .select(['id'])
          .where('subjectKind', '=', 'issue')
          .where('subjectId', '=', issueId)
          .where('status', 'in', ['queued', 'dispatched', 'running'])
          .execute();

        if (activeRuns.length > 0) {
          // Task currently has active execution
          continue;
        }

        // Determine effective last activity time
        let lastActivity = issue.lastActivityAt
          ? new Date(str(issue.lastActivityAt))
          : issue.updatedAt
            ? new Date(str(issue.updatedAt))
            : new Date(0);

        // Check latest run finish time
        const latestRun: Row | undefined = await conn()
          .query.selectFrom('agRuns')
          .select(['finishedAt', 'updatedAt'])
          .where('subjectKind', '=', 'issue')
          .where('subjectId', '=', issueId)
          .orderBy('updatedAt', 'desc')
          .executeTakeFirst();

        if (latestRun) {
          const runTime = latestRun.finishedAt
            ? new Date(str(latestRun.finishedAt))
            : latestRun.updatedAt
              ? new Date(str(latestRun.updatedAt))
              : null;
          if (runTime && runTime > lastActivity) {
            lastActivity = runTime;
          }
        }

        // Check latest human or agent comment time (ignore autopilot system notifications)
        const latestComment: Row | undefined = await conn()
          .query.selectFrom('pmComments')
          .select(['createdAt'])
          .where('issueId', '=', issueId)
          .where('authorId', '!=', AUTOPILOT_USER_ID)
          .orderBy('createdAt', 'desc')
          .executeTakeFirst();

        if (latestComment?.createdAt) {
          const commentTime = new Date(str(latestComment.createdAt));
          if (commentTime > lastActivity) {
            lastActivity = commentTime;
          }
        }

        const idleDurationMs = now.getTime() - lastActivity.getTime();
        if (idleDurationMs < stallThresholdMs) {
          // Still within acceptable idle window
          continue;
        }

        // ISSUE IS STALLED: Determine if this is 1st or 2nd consecutive stall
        const recentEvents = await conn()
          .query.selectFrom('dsAutopilotEvents')
          .selectAll()
          .where('issueId', '=', issueId)
          .where('kind', 'in', ['stalled', 'opened'])
          .orderBy('createdAt', 'desc')
          .limit(2)
          .execute();

        const latestEvent = recentEvents[0] as Row | undefined;
        const isSecondConsecutiveStall = latestEvent && str(latestEvent.kind) === 'stalled';

        if (isSecondConsecutiveStall) {
          // ESCALATE TO BLOCKED: 2nd consecutive stall
          await conn()
            .query.updateTable('pmIssues')
            .set({
              statusKey: 'blocked',
              needsYou:
                'Tự lái: Phát hiện việc bị đứng 2 lần liên tiếp (không có lượt chạy, không có tiến độ mới). Cần người quyết định.',
              updatedAt: now,
            })
            .where('id', '=', issueId)
            .execute();

          blockedIssueIds.push(issueId);

          // Post comment on issue
          try {
            const commentId = randomUUID();
            const commentContent =
              `🤖 **Tự lái: Công việc đã bị chuyển sang Đang vướng (Blocked)** do bị đứng 2 lần liên tiếp không có tiến triển mới.\n\n` +
              `- **Lý do**: Không có lượt chạy hoặc hoạt động mới trong hơn ${stallMinutes * 2} phút.\n` +
              `- **Trạng thái**: Đã gắn nhãn **Cần bạn (needsYou)** để yêu cầu người can thiệp.`;

            await conn()
              .query.insertInto('pmComments')
              .values({
                id: commentId,
                rootId: commentId,
                issueId,
                authorType: 'system',
                authorId: AUTOPILOT_USER_ID,
                content: commentContent,
                createdAt: now,
                updatedAt: now,
              })
              .execute();
          } catch (commentErr) {
            console.warn('Autopilot could not post blocked comment', commentErr);
          }

          // Record audit event
          await deps.evaluator.recordEvent({
            projectId,
            issueId,
            kind: 'blocked',
            reason: `Đứng việc 2 lần liên tiếp không có hoạt động trong ${stallMinutes * 2} phút`,
            data: {
              stallCount: 2,
              idleDurationMs,
              lastActivityAt: lastActivity.toISOString(),
            },
          });

          // Send Inbox notification to project owners
          if (deps.notify && deps.owners) {
            try {
              const owners = await deps.owners();
              if (owners.length > 0) {
                const issueIdentifier = str(issue.identifier) || issueId;
                const issueTitle = str(issue.title) || issueId;
                await deps.notify({
                  to: owners,
                  key: `ds-autopilot-blocked-${issueId}`,
                  title: `Cần tôi quyết định: Công việc ${issueIdentifier} bị đứng 2 lần liên tiếp`,
                  body: `Công việc "${issueTitle}" không có tiến triển sau 2 chu kỳ kiểm tra và đã được chuyển sang Đang vướng.`,
                  path: `/projects/${projectId}/issues/${issueId}`,
                });
              }
            } catch (notifyErr) {
              console.warn('Autopilot could not send blocked notification', notifyErr);
            }
          }
        } else {
          // FIRST STALL: Wake Project Manager Agent
          stalledIssueIds.push(issueId);

          // Find runners with unpushed workspaces
          const unpushedOn: string[] = [];
          try {
            const runners = await conn()
              .query.selectFrom('agRunners')
              .selectAll()
              .where('status', '=', 'online')
              .execute();

            for (const runner of runners) {
              const rawUsage = runner.workspaceUsage;
              if (rawUsage) {
                const usage =
                  typeof rawUsage === 'string'
                    ? (JSON.parse(rawUsage) as Record<string, unknown>)
                    : (rawUsage as Record<string, unknown>);
                if (num(usage.unpushedCount) > 0) {
                  unpushedOn.push(str(runner.name) || str(runner.hostname) || str(runner.id));
                }
              }
            }
          } catch (runnerErr) {
            console.warn('Autopilot could not check runner unpushed workspaces', runnerErr);
          }

          // Post warning comment on issue
          try {
            const commentId = randomUUID();
            const commentContent =
              `🤖 **Tự lái: Phát hiện công việc có dấu hiệu bị đứng** (không có lượt chạy active trong hơn ${stallMinutes} phút).\n\n` +
              `- **Xử lý**: Đã gửi yêu cầu đánh thức Trưởng nhóm Agent (\`${PROJECT_MANAGER_AGENT_ID}\`) để kiểm tra và tiếp tục thực hiện.\n` +
              (unpushedOn.length > 0
                ? `- **Lưu ý runner**: Có workspace chưa push trên runner: \`${unpushedOn.join(', ')}\`. Cần yêu cầu agent push workspace trước khi đổi runner.`
                : '');

            await conn()
              .query.insertInto('pmComments')
              .values({
                id: commentId,
                rootId: commentId,
                issueId,
                authorType: 'system',
                authorId: AUTOPILOT_USER_ID,
                content: commentContent,
                createdAt: now,
                updatedAt: now,
              })
              .execute();
          } catch (commentErr) {
            console.warn('Autopilot could not post stall warning comment', commentErr);
          }

          // Enqueue wake-up run for ds-project-manager
          if (deps.agents?.runs?.enqueue) {
            try {
              const issueIdentifier = str(issue.identifier) || issueId;
              await deps.agents.runs.enqueue({
                agentId: PROJECT_MANAGER_AGENT_ID,
                subject: { kind: 'issue', id: issueId },
                input: {
                  type: 'prompt',
                  actor: { type: 'system', id: AUTOPILOT_USER_ID },
                  text: `Tự lái phát hiện công việc ${issueIdentifier} bị đứng hơn ${stallMinutes} phút. Vui lòng kiểm tra tiến độ, yêu cầu push workspace dở (nếu có: ${unpushedOn.join(', ') || 'không'}) và tiếp tục giao việc.`,
                  payload: {
                    trigger: 'autopilot.stalled',
                    issueId,
                    identifier: strOrNull(issue.identifier),
                    stallMinutes,
                    unpushedOn,
                  },
                },
              });
            } catch (runErr) {
              console.warn('Autopilot could not enqueue wake run for project manager', runErr);
            }
          }

          // Record audit event
          await deps.evaluator.recordEvent({
            projectId,
            issueId,
            kind: 'stalled',
            reason: `Không có hoạt động trong ${Math.round(idleDurationMs / 60000)} phút`,
            data: {
              stallCount: 1,
              idleDurationMs,
              lastActivityAt: lastActivity.toISOString(),
              unpushedOn,
            },
          });
        }
      }
    }

    return {
      stalledCount: stalledIssueIds.length,
      blockedCount: blockedIssueIds.length,
      stalledIssueIds,
      blockedIssueIds,
    };
  }

  return {
    detectAndHandleStalls,
    handleQuotaFailure,
    getQuotaThrottle,
  };
}
