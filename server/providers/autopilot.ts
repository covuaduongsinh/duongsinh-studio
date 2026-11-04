import type { Application } from '@nocobase/app-server/application';
import { jobExecutorServiceToken } from '@nocobase/app-server/jobs';
import { databaseManagerToken } from '@nocobase/db';
import type { ScheduleExecutor } from '@nocobase/jobs';
import {
  ServiceProvider,
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';
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
import { str, strOrNull } from '../git/rows.js';

export const autopilotServiceToken: ServiceToken<AutopilotEvaluator> =
  createServiceToken<AutopilotEvaluator>('app/autopilot');

export const autopilotSchedulerToken: ServiceToken<AutopilotScheduler> =
  createServiceToken<AutopilotScheduler>('app/autopilot/scheduler');

const SWEEP_INTERVAL_MS = 120_000; // 2 minutes

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
        } catch (error) {
          console.warn('Autopilot sweep error:', error);
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
