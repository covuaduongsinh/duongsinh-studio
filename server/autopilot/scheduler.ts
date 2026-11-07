import { randomUUID } from 'node:crypto';
import type { DatabaseConnection, DatabaseManager } from '@nocobase/db';
import { str, bool, num, iso, type Row } from '../git/rows.js';
import type { AutopilotEvaluator } from './evaluator.js';
import { AUTOPILOT_ISSUE_FLAGS_TABLE } from '../../database/main/migrations/2026110804_ds_autopilot_issue_flags.js';
import { AUTOPILOT_USER_ID } from '../../database/main/seeds/2026110803_ds_autopilot_user.js';

export const PROJECT_MANAGER_AGENT_ID = 'ds-project-manager';

export interface IssueFlagView {
  readonly issueId: string;
  readonly allowAutoStart: boolean;
  readonly inheritFromParent: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CandidateIssue {
  readonly id: string;
  readonly identifier?: string;
  readonly title?: string;
  readonly priorityRank: number;
  readonly parentIssueId?: string | null;
  readonly createdAt: Date;
}

export interface AutopilotSchedulerDeps {
  readonly database: Pick<DatabaseManager, 'connection'>;
  readonly evaluator: AutopilotEvaluator;
  readonly agents?: {
    readonly runs?: {
      readonly enqueue: (params: Record<string, unknown>) => Promise<unknown>;
    };
  };
  /** Whether a budget stops this work; nothing opens only to wait on it. */
  readonly budgetStops?: (issueId: string, agentId: string) => Promise<boolean>;
  /** While a project's runs wait on tool quota, it opens no more than this allows (`stall.ts`). */
  readonly quotaThrottle?: (
    projectId: string,
  ) => { readonly effectiveConcurrency: number } | null;
}

export interface AutopilotScheduler {
  setIssueFlag(
    issueId: string,
    input: { allowAutoStart?: boolean; inheritFromParent?: boolean },
  ): Promise<IssueFlagView>;
  getIssueFlag(issueId: string): Promise<IssueFlagView | null>;
  isIssueEligibleForAutoStart(issueId: string): Promise<boolean>;
  calculateCapacity(projectId: string): Promise<number>;
  listCandidates(projectId: string): Promise<CandidateIssue[]>;
  openNext(
    projectId: string,
  ): Promise<{ openedCount: number; openedIssueIds: string[] }>;
}

export function createAutopilotScheduler(
  deps: AutopilotSchedulerDeps,
): AutopilotScheduler {
  const conn = (): DatabaseConnection => deps.database.connection();

  async function setIssueFlag(
    issueId: string,
    input: { allowAutoStart?: boolean; inheritFromParent?: boolean },
  ): Promise<IssueFlagView> {
    const existing = await conn()
      .query.selectFrom(AUTOPILOT_ISSUE_FLAGS_TABLE)
      .selectAll()
      .where('issueId', '=', issueId)
      .executeTakeFirst();

    const now = new Date();
    const allowAutoStart =
      input.allowAutoStart !== undefined
        ? input.allowAutoStart
        : existing
          ? bool(existing.allowAutoStart)
          : true;
    const inheritFromParent =
      input.inheritFromParent !== undefined
        ? input.inheritFromParent
        : existing
          ? bool(existing.inheritFromParent)
          : true;

    if (existing) {
      await conn()
        .query.updateTable(AUTOPILOT_ISSUE_FLAGS_TABLE)
        .set({
          allowAutoStart,
          inheritFromParent,
          updatedAt: now,
        })
        .where('issueId', '=', issueId)
        .execute();
    } else {
      await conn()
        .query.insertInto(AUTOPILOT_ISSUE_FLAGS_TABLE)
        .values({
          issueId,
          allowAutoStart,
          inheritFromParent,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }

    return {
      issueId,
      allowAutoStart,
      inheritFromParent,
      createdAt: existing
        ? (iso(existing.createdAt) ?? now.toISOString())
        : now.toISOString(),
      updatedAt: now.toISOString(),
    };
  }

  async function getIssueFlag(issueId: string): Promise<IssueFlagView | null> {
    const row = await conn()
      .query.selectFrom(AUTOPILOT_ISSUE_FLAGS_TABLE)
      .selectAll()
      .where('issueId', '=', issueId)
      .executeTakeFirst();

    if (!row) return null;

    return {
      issueId: str(row.issueId),
      allowAutoStart: bool(row.allowAutoStart),
      inheritFromParent: bool(row.inheritFromParent),
      createdAt: iso(row.createdAt) ?? new Date().toISOString(),
      updatedAt: iso(row.updatedAt) ?? new Date().toISOString(),
    };
  }

  async function isIssueEligibleForAutoStart(
    issueId: string,
  ): Promise<boolean> {
    const visited = new Set<string>();
    let currentId: string | null = issueId;

    while (currentId) {
      if (visited.has(currentId)) break;
      visited.add(currentId);

      const flagRow = await conn()
        .query.selectFrom(AUTOPILOT_ISSUE_FLAGS_TABLE)
        .selectAll()
        .where('issueId', '=', currentId)
        .executeTakeFirst();

      if (flagRow) {
        const allow = bool(flagRow.allowAutoStart);
        const inherit = bool(flagRow.inheritFromParent);

        // If explicit rule without inheritance, return immediately
        if (!inherit) {
          return allow;
        }
        // If allowed explicitly on self or ancestor
        if (allow) {
          return true;
        }
      }

      // If no flag or inheritFromParent is true, look up parentIssueId
      const issueRow: Row | undefined = await conn()
        .query.selectFrom('pmIssues')
        .select(['parentIssueId'])
        .where('id', '=', currentId)
        .executeTakeFirst();

      currentId = issueRow?.parentIssueId ? str(issueRow.parentIssueId) : null;
    }

    return false;
  }

  async function calculateCapacity(projectId: string): Promise<number> {
    const capacity = await configuredCapacity(projectId);
    const throttle = deps.quotaThrottle?.(projectId);
    return throttle
      ? Math.min(capacity, throttle.effectiveConcurrency)
      : capacity;
  }

  async function configuredCapacity(projectId: string): Promise<number> {
    const settings = await deps.evaluator.getSettings(projectId);
    if (
      settings &&
      typeof settings.maxActiveIssues === 'number' &&
      settings.maxActiveIssues > 0
    ) {
      return settings.maxActiveIssues;
    }

    try {
      const runners = await conn()
        .query.selectFrom('agRunners')
        .select(['slots', 'status'])
        .where('status', '=', 'online')
        .execute();

      const totalSlots = runners.reduce(
        (sum, r: Row) => sum + (num(r.slots) || 1),
        0,
      );
      return Math.max(1, totalSlots);
    } catch {
      return 1;
    }
  }

  async function listCandidates(projectId: string): Promise<CandidateIssue[]> {
    const backlogIssues = await conn()
      .query.selectFrom('pmIssues')
      .selectAll()
      .where('projectId', '=', projectId)
      .where('statusKey', '=', 'backlog')
      .execute();

    const candidates: CandidateIssue[] = [];

    for (const issue of backlogIssues) {
      const issueId = str(issue.id);

      // Check auto-start eligibility (flag or inherited from parent)
      const eligible = await isIssueEligibleForAutoStart(issueId);
      if (!eligible) {
        continue;
      }

      // Check dependency blocking (type = 'blockedBy')
      const depsRows = await conn()
        .query.selectFrom('pmIssueDependencies')
        .select(['dependsOnIssueId', 'type'])
        .where('issueId', '=', issueId)
        .where('type', '=', 'blockedBy')
        .execute();

      if (depsRows.length > 0) {
        const blockerIds = depsRows.map((r: Row) => str(r.dependsOnIssueId));
        const blockers = await conn()
          .query.selectFrom('pmIssues')
          .select(['id', 'statusKey'])
          .where('id', 'in', blockerIds)
          .execute();

        const allDone =
          blockers.length === blockerIds.length &&
          blockers.every((b: Row) => str(b.statusKey) === 'done');

        if (!allDone) {
          continue;
        }
      }

      const priorityRank =
        issue.priorityRank != null ? num(issue.priorityRank) : 4;
      const createdAt = issue.createdAt
        ? new Date(str(issue.createdAt))
        : new Date();

      candidates.push({
        id: issueId,
        identifier: issue.identifier ? str(issue.identifier) : undefined,
        title: issue.title ? str(issue.title) : undefined,
        priorityRank,
        parentIssueId: issue.parentIssueId ? str(issue.parentIssueId) : null,
        createdAt,
      });
    }

    // Sort by priorityRank asc (0 = urgent .. 4 = none), then createdAt asc
    candidates.sort((a, b) => {
      if (a.priorityRank !== b.priorityRank) {
        return a.priorityRank - b.priorityRank;
      }
      return a.createdAt.getTime() - b.createdAt.getTime();
    });

    return candidates;
  }

  async function openNext(
    projectId: string,
  ): Promise<{ openedCount: number; openedIssueIds: string[] }> {
    const settings = await deps.evaluator.getSettings(projectId);
    if (!settings || !settings.enabled || settings.pausedReason) {
      return { openedCount: 0, openedIssueIds: [] };
    }

    const inProgressRows = await conn()
      .query.selectFrom('pmIssues')
      .select('id')
      .where('projectId', '=', projectId)
      .where('statusKey', '=', 'in_progress')
      .execute();

    const currentInProgress = inProgressRows.length;
    const capacity = await calculateCapacity(projectId);
    const availableSlots = capacity - currentInProgress;

    if (availableSlots <= 0) {
      return { openedCount: 0, openedIssueIds: [] };
    }

    const candidates = await listCandidates(projectId);
    const toOpen = candidates.slice(0, availableSlots);
    const openedIssueIds: string[] = [];

    for (const issue of toOpen) {
      if (await deps.budgetStops?.(issue.id, PROJECT_MANAGER_AGENT_ID))
        continue;
      const now = new Date();

      // Update issue to in_progress with project manager agent
      await conn()
        .query.updateTable('pmIssues')
        .set({
          statusKey: 'in_progress',
          executorType: 'agent',
          executorId: PROJECT_MANAGER_AGENT_ID,
          updatedAt: now,
        })
        .where('id', '=', issue.id)
        .execute();

      openedIssueIds.push(issue.id);

      // Post comment on issue
      try {
        const commentId = randomUUID();
        const commentContent =
          `🤖 **Tự lái đã tự động mở công việc này** (hết bị chặn, runner còn chỗ rảnh).\n\n` +
          `- **Điều phối**: Đã chuyển trạng thái sang \`Đang làm\` và giao cho Trưởng nhóm Agent (\`${PROJECT_MANAGER_AGENT_ID}\`).\n` +
          `- **Độ ưu tiên**: ${issue.priorityRank}\n` +
          `- **Chỗ runner khả dụng**: ${availableSlots}`;

        await conn()
          .query.insertInto('pmComments')
          .values({
            id: commentId,
            rootId: commentId,
            issueId: issue.id,
            authorType: 'system',
            authorId: AUTOPILOT_USER_ID,
            content: commentContent,
            createdAt: now,
            updatedAt: now,
          })
          .execute();
      } catch (commentErr) {
        console.warn(
          'Autopilot could not post open comment on issue',
          commentErr,
        );
      }

      // Record audit event
      await deps.evaluator.recordEvent({
        projectId,
        issueId: issue.id,
        kind: 'opened',
        reason: 'Đã mở việc do hết bị chặn và còn chỗ runner',
        data: {
          priorityRank: issue.priorityRank,
          availableSlots,
          identifier: issue.identifier,
        },
      });

      // Enqueue agent run if agents runner is available
      if (deps.agents?.runs?.enqueue) {
        try {
          await deps.agents.runs.enqueue({
            agentId: PROJECT_MANAGER_AGENT_ID,
            subject: { kind: 'issue', id: issue.id },
            input: {
              type: 'custom',
              actor: { type: 'system', id: AUTOPILOT_USER_ID },
              text: `Tự lái đã mở công việc ${issue.identifier ?? issue.id}. Hãy bắt đầu phân tích và thực hiện.`,
              payload: {
                trigger: 'autopilot.opened',
                issueId: issue.id,
                identifier: issue.identifier,
              },
            },
          });
        } catch (runErr) {
          console.warn(
            'Autopilot could not enqueue run for project manager',
            runErr,
          );
        }
      }
    }

    return { openedCount: openedIssueIds.length, openedIssueIds };
  }

  return {
    setIssueFlag,
    getIssueFlag,
    isIssueEligibleForAutoStart,
    calculateCapacity,
    listCandidates,
    openNext,
  };
}
