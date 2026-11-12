import type { Application } from '@nocobase/app-server/application';
import { jobExecutorServiceToken } from '@nocobase/app-server/jobs';
import { secretsServiceToken } from '@nocobase/app-server/secrets';
import {
  releasesDriversToken,
  releasesToken,
} from '@nocobase/app-plugin-releases/server/tokens';
import { databaseManagerToken, type DatabaseConnection } from '@nocobase/db';
import type { ScheduleExecutor } from '@nocobase/jobs';
import { ServiceProvider } from '@nocobase/service-provider';
import { iso, str, strOrNull, num, type Row } from '../git/rows.js';
import {
  createDokployClient,
  isNb3ComposeName,
  type DokployClient,
} from '../previews/dokploy.js';
import {
  createDokployDriver,
  sweepIdle,
  type Nb3Row,
  type Nb3Store,
} from '../releases/dokploy-driver.js';
import { extractArchive } from '../releases/extract.js';
import { channelFromEnv } from '../nb3-jobs/channel.js';
import { createNb3PreviewHooks } from '../releases/nb3-preview.js';
import { gitServiceToken } from './git.js';
import { releaseServiceToken } from './releases.js';

const TABLE = 'dsNb3Apps';
const PURPOSE = 'duongsinh-studio/nb3-app-database';
const SWEEP_EVERY_MS = 60_000;

const rowOf = (row: Row): Nb3Row => {
  const started = iso(row.startedAt);
  return {
    appId: str(row.appId),
    composeId: str(row.composeId),
    composeName: str(row.composeName),
    desiredState: str(row.desiredState) === 'running' ? 'running' : 'stopped',
    version: strOrNull(row.version),
    deploymentId: strOrNull(row.deploymentId),
    dbPasswordSealed: strOrNull(row.dbPasswordSealed),
    idleStopMinutes:
      row.idleStopMinutes == null ? null : num(row.idleStopMinutes),
    lastError: strOrNull(row.lastError),
    startedAt: started ? new Date(started) : null,
  };
};

/** The Apps' composes recorded in `dsNb3Apps`: all the NocoBase 3 Dokploy client may touch. */
export function createNb3Store(conn: () => DatabaseConnection): Nb3Store {
  return {
    async get(appId) {
      const row: Row | undefined = await conn()
        .query.selectFrom(TABLE)
        .selectAll()
        .where('appId', '=', appId)
        .executeTakeFirst();
      return row ? rowOf(row) : null;
    },
    async list() {
      const rows: Row[] = await conn()
        .query.selectFrom(TABLE)
        .selectAll()
        .execute();
      return rows.map(rowOf);
    },
    async save(row) {
      const at = new Date();
      const values = {
        composeId: row.composeId,
        composeName: row.composeName,
        desiredState: row.desiredState,
        version: row.version,
        deploymentId: row.deploymentId,
        dbPasswordSealed: row.dbPasswordSealed,
        idleStopMinutes: row.idleStopMinutes,
        lastError: row.lastError,
        startedAt: row.startedAt,
        updatedAt: at,
      };
      const present: Row | undefined = await conn()
        .query.selectFrom(TABLE)
        .select(['appId'])
        .where('appId', '=', row.appId)
        .executeTakeFirst();
      if (present) {
        await conn()
          .query.updateTable(TABLE)
          .set(values)
          .where('appId', '=', row.appId)
          .execute();
        return;
      }
      await conn()
        .query.insertInto(TABLE)
        .values({ appId: row.appId, ...values, createdAt: at })
        .execute();
    },
    async remove(appId) {
      await conn().query.deleteFrom(TABLE).where('appId', '=', appId).execute();
    },
  };
}

/**
 * Registers the `dokploy` deployment driver, which runs NocoBase 3 Apps as composes in Studio's own Dokploy project
 * (M4.2). It registers a driver only: an environment that uses it is created by an administrator in Release
 * environments, so nothing reaches Dokploy until someone chooses to. Dokploy is reached only when `DOKPLOY_URL`,
 * `DOKPLOY_API_KEY` and `DOKPLOY_PROJECT_ID` are set, and then only for composes named `nb3-…` that Studio recorded.
 */
export default class Nb3AppsProvider extends ServiceProvider<Application> {
  readonly name = 'app/nb3-apps';
  private executor?: ScheduleExecutor;
  private unsubscribe?: (() => void) | undefined;

  private deps(): Parameters<typeof createDokployDriver>[0] {
    const { container } = this.app;
    const env = process.env;
    const store = createNb3Store(() =>
      container.resolve(databaseManagerToken).connection(),
    );
    let client: DokployClient | null | undefined;
    return {
      channel: () => channelFromEnv(),
      dokploy: () => {
        if (client !== undefined) return client;
        const {
          DOKPLOY_URL: url,
          DOKPLOY_API_KEY: apiKey,
          DOKPLOY_PROJECT_ID: projectId,
        } = env;
        client =
          url && apiKey && projectId
            ? createDokployClient(
                { url, apiKey, projectId },
                async () =>
                  new Set((await store.list()).map((row) => row.composeId)),
                isNb3ComposeName,
              )
            : null;
        return client;
      },
      store,
      seal: (plain) =>
        container
          .resolve(secretsServiceToken)
          .seal(plain, { purpose: PURPOSE }),
      open: (sealed) =>
        container
          .resolve(secretsServiceToken)
          .open(sealed, { purpose: PURPOSE }),
      extract: extractArchive,
    };
  }

  override async boot(): Promise<void> {
    const { container } = this.app;
    if (!container.has(releasesDriversToken) || !container.has(releasesToken))
      return;
    container
      .resolve(releasesDriversToken)
      .register(createDokployDriver(this.deps()));
    // M4.3: a closed pull request (or one that lost its `preview` label) stops its preview App.
    const hooks = createNb3PreviewHooks({
      previewAppId: async (repositoryId) =>
        (
          await container
            .resolve(releaseServiceToken)
            .repositoryApps(repositoryId)
        ).find((item) => item.environmentKey === 'preview')?.appId ?? null,
      currentLabels: async (appId) => {
        const rel = container.resolve(releasesToken);
        const system = rel.system;
        const summary = await rel.releases
          .getApp(system, appId)
          .catch(() => null);
        if (!summary?.currentVersion) return null;
        const releases = await rel.releases.listReleases(system, appId);
        return (
          releases.find((item) => item.version === summary.currentVersion)
            ?.labels ?? null
        );
      },
      stop: async (appId) => {
        const rel = container.resolve(releasesToken);
        await rel.releases.stop(rel.system, appId);
      },
    });
    this.unsubscribe = container
      .resolve(gitServiceToken)
      .onWebhookEvent(async (repositoryId, event, payload) => {
        await hooks.onWebhook(repositoryId, event, payload);
      });
  }

  override async start(): Promise<void> {
    if (this.app.consoleLogStream === 'stderr') return;
    const { container } = this.app;
    const deps = this.deps();
    if (!deps.dokploy()) return;
    const database = container.resolve(databaseManagerToken);
    this.executor = container
      .resolve(jobExecutorServiceToken)
      .getScheduleExecutor('duongsinh-studio-nb3-apps');
    await this.executor.addJob({
      name: 'nb3-idle-sweep',
      options: { every: SWEEP_EVERY_MS },
      payload: {},
      execute: async () => {
        if (await database.collections().getPhysical(TABLE))
          await sweepIdle(deps, (message, error) =>
            console.error(message, error),
          );
      },
    });
    await this.executor.setup();
  }

  override async shutdown(): Promise<void> {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    await this.executor?.shutdown();
  }
}
