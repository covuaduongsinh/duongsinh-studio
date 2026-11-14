import { randomUUID } from 'node:crypto';
import type { Application } from '@nocobase/app-server/application';
import { databaseManagerToken } from '@nocobase/db';
import type { Run } from '@nocobase/app-plugin-agents/shared/runs';
import { authorizationToken } from '@nocobase/app-plugin-authorization';
import { notificationServiceToken } from '@nocobase/app-plugin-notification/server';
import {
  projectsStatusEventsToken,
  projectsToken,
} from '@nocobase/app-plugin-projects/server/tokens';
import {
  ServiceProvider,
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';
import { ROOT_SET_KEY } from '../access/roles.js';
import { AUTOPILOT_USER_ID } from '../../database/main/seeds/2026110803_ds_autopilot_user.js';
import { EVENTS_TABLE } from '../autopilot/evaluator.js';
import { str } from '../git/rows.js';
import {
  createDatabaseReactionStore,
  createReactionService,
  type ReactionEvent,
  type ReactionService,
} from '../reactions/service.js';
import { skippedData, SKIPPED_KIND } from '../reactions/retry.js';
import { agentWakerToken } from './agent-executor.js';
import { outboundToken } from './outbound.js';
import { autopilotServiceToken } from './autopilot.js';
import { gitServiceToken } from './git.js';
import {
  createReviewBatcher,
  reviewFromPayload,
  reviewHasContent,
  reviewKey,
  reviewsReactionText,
} from '../reactions/review-comments.js';

export const reactionServiceToken: ServiceToken<ReactionService> =
  createServiceToken<ReactionService>('app/reactions');

// The channel name `server/config/notification.ts` configures.
const INBOX_CHANNEL = 'inbox';

/** Moves an issue Studio woke from `in_review` back to work, so autopilot cannot merge it midway (S1a). */
export const REACTION_RESUME_EVENT = 'ds.reaction.resume';
/** Reviews of one person within this window wake the author once. */
const REVIEW_BATCH_MS = 90_000;

type Container = Application['container'];

/** The project an issue belongs to, or null for an issue outside every project. */
async function projectOf(
  container: Container,
  issueId: string,
): Promise<string | null> {
  const row = await container
    .resolve(databaseManagerToken)
    .connection()
    .query.selectFrom('pmIssues')
    .select('projectId')
    .where('id', '=', issueId)
    .executeTakeFirst();
  return row?.projectId ? str(row.projectId) : null;
}

/** A failed run of an issue's own agent calls for a reaction; a reviewer's failed run does not. */
export async function onRunFailedReaction(
  container: Container,
  run: Run,
): Promise<void> {
  const conn = container.resolve(databaseManagerToken).connection();
  const issue = await conn.query
    .selectFrom('pmIssues')
    .select(['id', 'projectId', 'executorType', 'executorId'])
    .where('id', '=', run.subject.id)
    .executeTakeFirst();
  if (!issue || str(issue.executorId) !== run.agentId) return;
  await container.resolve(reactionServiceToken).react('runFailed', {
    issueId: run.subject.id,
    projectId: issue.projectId ? str(issue.projectId) : null,
    headSha: run.id,
    text: `Lượt chạy trước của bạn kết thúc lỗi (${run.failureReason ?? 'không rõ lý do'}). Đọc lý do, sửa nguyên nhân rồi làm tiếp.`,
  });
}

/** Tells a review's result to the reaction rules: changes wake the author; an approval lets autopilot merge at once. */
export async function onReviewedReaction(
  container: Container,
  input: {
    readonly issueId: string;
    readonly pullRequestId: string;
    readonly headSha: string;
    readonly verdict: string;
    readonly summary: string;
  },
): Promise<void> {
  if (input.verdict === 'approve') {
    if (container.has(autopilotServiceToken))
      await container
        .resolve(autopilotServiceToken)
        .mergeIfEligible(input.issueId);
    return;
  }
  await container.resolve(reactionServiceToken).react('reviewChanges', {
    issueId: input.issueId,
    projectId: await projectOf(container, input.issueId),
    pullRequestId: input.pullRequestId,
    headSha: input.headSha,
    text: `Review xin sửa: ${input.summary}\nĐọc các điểm cần sửa, sửa, rồi đẩy lại.`,
  });
}

/**
 * Studio's own reactions (plan T, T1): what it does without being asked when CI turns red, a branch conflicts, a review
 * asks for changes or a run fails. The rules and their limits are in `server/reactions/service.ts`.
 */
export default class ReactionsProvider extends ServiceProvider<Application> {
  readonly name = 'app/reactions';
  private releaseReview?: () => void;
  private releaseEvent?: () => void;

  private async ownerIds(): Promise<string[]> {
    return (
      await this.app.container
        .resolve(authorizationToken)
        .permissionSets.listAssignments(ROOT_SET_KEY)
    )
      .filter((assignment) => assignment.subject.type === 'user')
      .map((assignment) => assignment.subject.id);
  }

  override register(): void {
    const { container } = this.app;
    container.singleton(reactionServiceToken, () => {
      const database = container.resolve(databaseManagerToken);
      const conn = () => database.connection();
      const record = async (
        input: Parameters<
          Parameters<typeof createDatabaseReactionStore>[0]['escalate']
        >[0],
      ) => {
        const now = new Date();
        const text =
          `🤖 **Tự phản ứng đã dừng: việc chuyển sang Đang vướng.**\n\n- **Lý do**: ${input.reason}\n` +
          '- Cần người xem và quyết định (đã gắn **Cần bạn**).';
        await conn()
          .query.updateTable('pmIssues')
          .set({
            statusKey: 'blocked',
            needsYou: `Tự phản ứng: ${input.reason}`,
            updatedAt: now,
          })
          .where('id', '=', input.issueId)
          .execute();
        const commentId = randomUUID();
        await conn()
          .query.insertInto('pmComments')
          .values({
            id: commentId,
            rootId: commentId,
            issueId: input.issueId,
            authorType: 'system',
            authorId: AUTOPILOT_USER_ID,
            content: text,
            createdAt: now,
            updatedAt: now,
          })
          .execute();
        if (input.projectId)
          await conn()
            .query.insertInto(EVENTS_TABLE)
            .values({
              id: randomUUID(),
              projectId: input.projectId,
              issueId: input.issueId,
              pullRequestId: input.pullRequestId ?? null,
              kind: 'blocked',
              reason: input.reason,
              data: JSON.stringify({ reaction: input.event }),
              createdAt: now,
            })
            .execute();
        // Each escalation is its own notice: the same pair of issue and event can be escalated again after a person
        // sent the issue back to work, and the second must not be swallowed as a repeat (S1e).
        const times = (
          await conn()
            .query.selectFrom(EVENTS_TABLE)
            .select('data')
            .where('issueId', '=', input.issueId)
            .where('kind', '=', 'blocked')
            .execute()
        ).filter((row) =>
          (typeof row.data === 'string'
            ? row.data
            : JSON.stringify(row.data ?? '')
          ).includes('"reaction"'),
        ).length;
        if (container.has(outboundToken))
          for (const userId of await this.ownerIds())
            await container
              .resolve(outboundToken)
              .deliver(userId, {
                key: `ds-reaction-blocked-${input.issueId}-${input.event}-${times}`,
                kind: 'decision',
                title: 'Cần tôi quyết định: tự sửa chưa xong',
                body: input.reason,
                path: `/issues/${input.issueId}`,
              })
              .catch((error: unknown) =>
                console.warn('Reactions could not push to the owners', error),
              );
        if (container.has(notificationServiceToken)) {
          const to = await this.ownerIds();
          if (to.length > 0)
            await container
              .resolve(notificationServiceToken)
              .send({
                idempotencyKey: `ds-reaction-blocked-${input.issueId}-${input.event}-${times}`,
                source: {
                  type: 'duongsinh-studio/reactions',
                  referenceId: input.issueId,
                },
                messages: {
                  [INBOX_CHANNEL]: {
                    to,
                    title: 'Cần tôi quyết định: tự sửa chưa xong',
                    body: input.reason,
                    target: {
                      type: 'route',
                      path: `/issues/${input.issueId}`,
                    },
                  },
                },
              })
              .catch((error: unknown) =>
                console.warn('Reactions could not notify the owners', error),
              );
        }
      };
      return createReactionService({
        store: createDatabaseReactionStore({
          conn,
          escalate: record,
          resume: async (issueId) => {
            await container.resolve(projectsToken).statusEvents.fire({
              event: REACTION_RESUME_EVENT,
              issueIds: [issueId],
              note: 'Tự phản ứng',
              needsYou: null,
            });
          },
        }),
        onSkipped: async (event, context, reason) => {
          if (!context.projectId) return;
          await conn()
            .query.insertInto(EVENTS_TABLE)
            .values({
              id: randomUUID(),
              projectId: context.projectId,
              issueId: context.issueId,
              pullRequestId: context.pullRequestId ?? null,
              kind: SKIPPED_KIND,
              reason,
              data: JSON.stringify(skippedData(event, context, reason)),
              createdAt: new Date(),
            })
            .execute();
        },
        waker: {
          wakeIssue: (input) =>
            container.resolve(agentWakerToken).wakeIssue(input),
        },
        onWoke: async (event, context, attempt) => {
          if (!context.projectId) return;
          await conn()
            .query.insertInto(EVENTS_TABLE)
            .values({
              id: randomUUID(),
              projectId: context.projectId,
              issueId: context.issueId,
              pullRequestId: context.pullRequestId ?? null,
              kind: 'reacted',
              reason: null,
              data: JSON.stringify({ reaction: event, attempt }),
              createdAt: new Date(),
            })
            .execute();
        },
      });
    });
  }

  override async boot(): Promise<void> {
    const { container } = this.app;
    if (container.has(projectsStatusEventsToken))
      this.releaseEvent = container.resolve(projectsStatusEventsToken).add({
        key: REACTION_RESUME_EVENT,
        from: ['in_review'],
        to: 'in_progress',
      });
    if (!container.has(gitServiceToken)) return;
    const react = (
      event: ReactionEvent,
      issueId: string,
      headSha: string,
      pullRequestId: string,
      text: string,
      dedupeKeys?: readonly string[],
    ) =>
      projectOf(container, issueId).then((projectId) =>
        container.resolve(reactionServiceToken).react(event, {
          issueId,
          projectId,
          pullRequestId,
          headSha,
          text,
          ...(dedupeKeys ? { dedupeKeys } : {}),
        }),
      );
    const git = container.resolve(gitServiceToken);
    const batcher = createReviewBatcher({
      windowMs: REVIEW_BATCH_MS,
      flush: async (batch) => {
        const keys = batch.reviews.map((review) => reviewKey(review.reviewId));
        await react(
          'prLineComment',
          batch.issueId,
          keys[0],
          batch.pullRequestId,
          reviewsReactionText({
            number: batch.number,
            reviewer: batch.reviewer,
            reviews: batch.reviews,
          }),
          keys.slice(1),
        );
      },
    });
    this.releaseReview = git.onReviewEvent(
      async (repositoryId, _event, payload) => {
        const review = reviewFromPayload(payload);
        if (!review.accept) return;
        const conn = container.resolve(databaseManagerToken).connection();
        const pull = await conn.query
          .selectFrom('dsPullRequests')
          .select(['id', 'issueId', 'state'])
          .where('repositoryId', '=', repositoryId)
          .where('number', '=', review.number)
          .executeTakeFirst();
        if (!pull?.issueId || str(pull.state) !== 'open') return;
        const comments = await git.pullReviewComments(
          str(pull.id),
          review.reviewId,
        );
        if (!reviewHasContent(review.body, comments)) return;
        batcher.add({
          issueId: str(pull.issueId),
          pullRequestId: str(pull.id),
          number: review.number,
          reviewer: review.reviewer,
          review: { reviewId: review.reviewId, body: review.body, comments },
        });
      },
    );
    git.setPullObserver({
      ciFailed: async (input) => {
        await react(
          'ciFailed',
          input.issueId,
          input.headSha,
          input.pullRequestId,
          `CI đỏ trên pull request của bạn. Check lỗi: ${input.failedChecks
            .map((check) =>
              check.url ? `${check.name} (${check.url})` : check.name,
            )
            .join(
              ', ',
            )}. Đọc log, sửa nguyên nhân, chạy lại kiểm chứng rồi đẩy.`,
        );
      },
      conflicts: async (input) => {
        await react(
          'conflicts',
          input.issueId,
          input.headSha,
          input.pullRequestId,
          `Nhánh của bạn xung đột với ${input.baseBranch}. Cập nhật nhánh theo ${input.baseBranch}, giải quyết xung đột, chạy lại kiểm chứng rồi đẩy.`,
        );
      },
    });
  }

  override async shutdown(): Promise<void> {
    this.releaseReview?.();
    this.releaseReview = undefined;
    this.releaseEvent?.();
    this.releaseEvent = undefined;
  }
}
