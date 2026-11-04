import type { Application } from '@nocobase/app-server/application';
import { jobExecutorServiceToken } from '@nocobase/app-server/jobs';
import { databaseManagerToken } from '@nocobase/db';
import type { ScheduleExecutor } from '@nocobase/jobs';
import { authorizationToken } from '@nocobase/app-plugin-authorization';
import { notificationServiceToken } from '@nocobase/app-plugin-notification/server';
import {
  ServiceProvider,
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';
import { ROOT_SET_KEY } from '../access/roles.js';
import { gitServiceToken } from './git.js';
import { reviewsServiceToken } from './reviews.js';
import {
  createAutopilotEvaluator,
  type AutopilotEvaluator,
  SETTINGS_TABLE,
} from '../autopilot/evaluator.js';
import {
  createAutopilotScheduler,
  type AutopilotScheduler,
} from '../autopilot/scheduler.js';
import {
  createAutopilotStallDetector,
  type AutopilotStallDetector,
} from '../autopilot/stall.js';
import {
  createAutopilotDigest,
  type AutopilotDigest,
} from '../autopilot/digest.js';
import { str, strOrNull } from '../git/rows.js';

export const autopilotServiceToken: ServiceToken<AutopilotEvaluator> =
  createServiceToken<AutopilotEvaluator>('app/autopilot');

export const autopilotSchedulerToken: ServiceToken<AutopilotScheduler> =
  createServiceToken<AutopilotScheduler>('app/autopilot/scheduler');

export const autopilotStallDetectorToken: ServiceToken<AutopilotStallDetector> =
  createServiceToken<AutopilotStallDetector>('app/autopilot/stall');

export const autopilotDigestToken: ServiceToken<AutopilotDigest> =
  createServiceToken<AutopilotDigest>('app/autopilot/digest');

const SWEEP_INTERVAL_MS = 120_000; // 2 minutes
const INBOX_CHANNEL = 'in-app';

export default class AutopilotProvider extends ServiceProvider<Application> {
  readonly name = 'app/autopilot';
  private executor?: ScheduleExecutor;
  private readonly releases: (() => void)[] = [];

  override register(): void {
    this.app.container.singleton(autopilotServiceToken, (resolver) =>
      createAutopilotEvaluator({
        database: resolver.resolve(databaseManagerToken),
        git: () => resolver.resolve(gitServiceToken),
        reviews: () => resolver.resolve(reviewsServiceToken),
      }),
    );

    this.app.container.singleton(autopilotSchedulerToken, (resolver) =>
      createAutopilotScheduler({
        database: resolver.resolve(databaseManagerToken),
        evaluator: resolver.resolve(autopilotServiceToken),
      }),
    );

    this.app.container.singleton(autopilotStallDetectorToken, (resolver) =>
      createAutopilotStallDetector({
        database: resolver.resolve(databaseManagerToken),
        evaluator: resolver.resolve(autopilotServiceToken),
      }),
    );

    this.app.container.singleton(autopilotDigestToken, (resolver) => {
      const authz = () => resolver.resolve(authorizationToken);
      const container = this.app.container;
      return createAutopilotDigest({
        database: resolver.resolve(databaseManagerToken),
        owners: async () =>
          (await authz().permissionSets.listAssignments(ROOT_SET_KEY))
            .filter((assignment) => assignment.subject.type === 'user')
            .map((assignment) => assignment.subject.id),
        notify: async (notice) => {
          if (
            !container.has(notificationServiceToken) ||
            notice.to.length === 0
          )
            return;
          try {
            await container.resolve(notificationServiceToken).send({
              idempotencyKey: notice.key,
              source: {
                type: 'duongsinh-studio/autopilot',
                referenceId: notice.key,
              },
              messages: {
                [INBOX_CHANNEL]: {
                  to: [...notice.to],
                  title: notice.title,
                  body: notice.body,
                  target: { type: 'route', path: notice.path },
                },
              },
            });
          } catch (notifyErr) {
            console.warn('Autopilot could not send notification', notifyErr);
          }
        },
      });
    });
  }

  override async boot(): Promise<void> {
    const { container } = this.app;
    if (!container.has(gitServiceToken)) return;

    const git = container.resolve(gitServiceToken);
    const evaluator = () => container.resolve(autopilotServiceToken);
    const scheduler = () => container.resolve(autopilotSchedulerToken);
    const db = container.resolve(databaseManagerToken);

    // Listen to git webhook events (PR sync / check updates)
    this.releases.push(
      git.onWebhookEvent(async (repositoryId, _event, payload) => {
        try {
          if (!payload.pull_request) return;
          const prNumber = (payload.pull_request as { number?: number }).number;
          if (!prNumber) return;

          const conn = db.connection();
          const prRow = await conn.query
            .selectFrom('dsPullRequests')
            .select(['issueId'])
            .where('repositoryId', '=', repositoryId)
            .where('number', '=', prNumber)
            .executeTakeFirst();

          const issueId = strOrNull(prRow?.issueId);
          if (issueId) {
            const mergeResult = await evaluator().mergeIfEligible(issueId);
            if (mergeResult.merged) {
              const issueRow = await conn.query
                .selectFrom('pmIssues')
                .select(['projectId'])
                .where('id', '=', issueId)
                .executeTakeFirst();
              if (issueRow?.projectId) {
                await scheduler().openNext(str(issueRow.projectId));
              }
            }
          }
        } catch (error) {
          console.warn('Autopilot webhook listener error:', error);
        }
      }),
    );
  }

  override async start(): Promise<void> {
    if (this.app.consoleLogStream === 'stderr') return;
    const { container } = this.app;
    const database = container.resolve(databaseManagerToken);

    this.executor = container
      .resolve(jobExecutorServiceToken)
      .getScheduleExecutor('duongsinh-studio');

    await this.executor.addJob({
      name: 'autopilot-sweep',
      options: { every: SWEEP_INTERVAL_MS },
      payload: {},
      execute: async () => {
        if (!(await database.collections().getPhysical(SETTINGS_TABLE))) return;
        const evaluator = container.resolve(autopilotServiceToken);
        const scheduler = container.resolve(autopilotSchedulerToken);
        const stallDetector = container.resolve(autopilotStallDetectorToken);
        const conn = database.connection();

        try {
          // Find active projects with autopilot enabled
          const activeSettings = await conn.query
            .selectFrom(SETTINGS_TABLE)
            .select('projectId')
            .where('enabled', '=', true)
            .where('pausedReason', 'is', null)
            .execute();

          for (const setting of activeSettings) {
            const projectId = str(setting.projectId);
            // 1. Quét và merge các issue đủ điều kiện
            const candidateIssues = await conn.query
              .selectFrom('pmIssues')
              .select('id')
              .where('projectId', '=', projectId)
              .where('statusKey', '=', 'in_review')
              .execute();

            for (const issue of candidateIssues) {
              await evaluator.mergeIfEligible(str(issue.id));
            }

            // 2. Lập lịch mở việc kế tiếp (AP3)
            await scheduler.openNext(projectId);
          }

          // 3. Quét phát hiện đứng việc trên tất cả project bật tự lái (AP4)
          await stallDetector.detectAndHandleStalls();
        } catch (error) {
          console.warn('Autopilot sweep error:', error);
        }
      },
    });

    await this.executor.addJob({
      name: 'autopilot-daily-digest',
      options: { cron: '0 21 * * *', tz: 'Asia/Ho_Chi_Minh' },
      payload: {},
      execute: async () => {
        if (!(await database.collections().getPhysical(SETTINGS_TABLE))) return;
        const digest = container.resolve(autopilotDigestToken);
        try {
          await digest.sendDailyDigest();
        } catch (error) {
          console.warn('Autopilot daily digest error:', error);
        }
      },
    });

    await this.executor.setup();
  }

  override async shutdown(): Promise<void> {
    await this.executor?.shutdown();
    this.executor = undefined;
    for (const release of this.releases.splice(0)) release();
  }
}
