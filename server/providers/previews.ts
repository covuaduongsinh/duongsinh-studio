import type { Application } from '@nocobase/app-server/application';
import { jobExecutorServiceToken } from '@nocobase/app-server/jobs';
import { secretsServiceToken } from '@nocobase/app-server/secrets';
import { databaseManagerToken } from '@nocobase/db';
import type { ScheduleExecutor } from '@nocobase/jobs';
import {
  ServiceProvider,
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';
import { createDokployClient, type DokployClient } from '../previews/dokploy.js';
import {
  PREVIEWS,
  answerMs,
  createPreviewService,
  hostAvailableMb,
  type PreviewService,
} from '../previews/service.js';
import { gitServiceToken, publicBaseUrlOf } from './git.js';

export const previewServiceToken: ServiceToken<PreviewService> =
  createServiceToken<PreviewService>('app/previews');

/** How often idle previews are looked for. */
const SWEEP_EVERY_MS = 60_000;
const PRODUCTION_URL = 'https://nocobase.dsc.edu.vn/';

/**
 * Previews and staging of duongsinh-nocobase (S5.6). Dokploy is reached only when `DOKPLOY_URL`, `DOKPLOY_API_KEY` and
 * `DOKPLOY_PROJECT_ID` are set (the VPS compose sets them; development does not), and then only through the allowlisted
 * client over the composes Studio recorded. Builds arrive as `workflow_run` deliveries of the GitHub App.
 */
export default class PreviewsProvider extends ServiceProvider<Application> {
  readonly name = 'app/previews';
  private releases: (() => void)[] = [];
  private executor?: ScheduleExecutor;

  override register(): void {
    const { container } = this.app;
    const env = process.env;
    let client: DokployClient | null | undefined;
    const service: PreviewService = createPreviewService({
      database: container.resolve(databaseManagerToken),
      secrets: () => container.resolve(secretsServiceToken),
      git: () => container.resolve(gitServiceToken),
      dokploy: () => {
        if (client !== undefined) return client;
        const url = env.DOKPLOY_URL;
        const apiKey = env.DOKPLOY_API_KEY;
        const projectId = env.DOKPLOY_PROJECT_ID;
        client =
          url && apiKey && projectId
            ? createDokployClient({ url, apiKey, projectId }, () => service.allowedComposeIds())
            : null;
        return client;
      },
      publicBase: () => publicBaseUrlOf(this.app),
      hosts: {
        preview: env.PREVIEW_HOST || 'preview.dsc.edu.vn',
        staging: env.STAGING_HOST || 'staging-nocobase.dsc.edu.vn',
      },
      probe: { availableMb: hostAvailableMb, productionMs: () => answerMs(PRODUCTION_URL) },
      onError: (message, error) => console.error(message, error),
    });
    container.singleton(previewServiceToken, () => service);
  }

  override async boot(): Promise<void> {
    const { container } = this.app;
    this.releases.push(
      container.resolve(gitServiceToken).onWebhookEvent(async (repositoryId, event, payload) => {
        await container.resolve(previewServiceToken).onWebhook(repositoryId, event, payload);
      }),
    );
  }

  override async start(): Promise<void> {
    if (this.app.consoleLogStream === 'stderr') return;
    const { container } = this.app;
    if (!container.resolve(previewServiceToken).configured()) return;
    const database = container.resolve(databaseManagerToken);
    this.executor = container.resolve(jobExecutorServiceToken).getScheduleExecutor('duongsinh-studio-previews');
    await this.executor.addJob({
      name: 'preview-idle-sweep',
      options: { every: SWEEP_EVERY_MS },
      payload: {},
      execute: async () => {
        if (await database.collections().getPhysical(PREVIEWS)) await container.resolve(previewServiceToken).sweep();
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
