import { randomBytes } from 'node:crypto';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  AppDeploymentSpec,
  AppObservedStatus,
  DeploymentDriver,
  DeploymentEvent,
  DriverSession,
} from '@nocobase/app-plugin-releases/server';
import { appText } from '../agents/ids.js';
import type { DokployClient } from '../previews/dokploy.js';
import { DokployError, DokployRefused } from '../previews/dokploy.js';
import {
  assertAppHost,
  composeNameOf,
  nb3ComposeEnv,
  nb3ComposeFile,
  type Nb3Database,
} from './nb3-compose.js';

/**
 * The deployment driver that runs NocoBase 3 Apps as composes in Studio's own Dokploy project (M4.2). Studio's
 * container writes each release's `dist/` under `dataDir` (a directory of its `storage` mount); the compose mounts the
 * same directory from the host (`hostDir`), so no SSH or Docker socket is needed. Only the allowlisted Dokploy client
 * (`createDokployClient` with `isNb3ComposeName`) touches Dokploy, over the composes recorded in `dsNb3Apps`.
 *
 * Deviations from the plugin's driver contract, all recorded in docs/chenh-lech-upstream.md:
 * - `onDemand` is not offered: nothing sees requests. An App with `idleStopMinutes` is stopped that many minutes after
 *   it last started or deployed (`sweepIdle`), and is started again by hand ("staging bật khi cần");
 * - at most `maxApps` Apps run at once; a further deployment or start is refused with an explanation, not queued;
 * - a failed deployment leaves the compose as Docker left it (the previous container usually still runs) and the App
 *   is reported `failed`.
 */

export const DOKPLOY_DRIVER = 'dokploy';

export interface Nb3Row {
  readonly appId: string;
  readonly composeId: string;
  readonly composeName: string;
  readonly desiredState: 'running' | 'stopped';
  readonly version: string | null;
  readonly deploymentId: string | null;
  readonly dbPasswordSealed: string | null;
  readonly idleStopMinutes: number | null;
  readonly lastError: string | null;
  readonly startedAt: Date | null;
}

export interface Nb3Store {
  get(appId: string): Promise<Nb3Row | null>;
  list(): Promise<readonly Nb3Row[]>;
  save(row: Nb3Row): Promise<void>;
  remove(appId: string): Promise<void>;
}

export interface Nb3Deps {
  /** Null when `DOKPLOY_*` is not set: every operation then reports why. */
  readonly dokploy: () => DokployClient | null;
  readonly store: Nb3Store;
  readonly seal: (plain: string) => string;
  readonly open: (sealed: string) => string;
  readonly extract: (
    source: NodeJS.ReadableStream,
    directory: string,
  ) => Promise<void>;
  readonly now?: () => Date;
  readonly sleep?: (ms: number) => Promise<void>;
  /** How long a deployment may take before it is reported failed. */
  readonly deployTimeoutMs?: number;
}

interface Nb3Settings {
  readonly dataDir: string;
  readonly hostDir: string;
  readonly hosts: Readonly<Record<string, string>>;
  readonly database: Nb3Database;
  readonly basePath: string;
  readonly maxApps: number;
}

const VERSION = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/u;
const absolute = (path: unknown): path is string =>
  typeof path === 'string' &&
  /^\/[A-Za-z0-9._\-/]*$/u.test(path) &&
  !path.split('/').includes('..');

export const CONFIG_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['dataDir', 'hostDir', 'hosts'],
  properties: {
    dataDir: {
      type: 'string',
      description: 'Directory the Studio container writes releases to.',
    },
    hostDir: {
      type: 'string',
      description:
        'The same directory as the VPS sees it (for the bind mount).',
    },
    hosts: {
      type: 'object',
      description: 'App id to its fixed host name, one DNS record per App.',
      additionalProperties: { type: 'string' },
    },
    database: { enum: ['sqlite', 'postgres'], default: 'sqlite' },
    basePath: { type: 'string', default: '/' },
    maxApps: { type: 'integer', minimum: 1, maximum: 2, default: 1 },
  },
} as const;

/** The environment's settings, or the reason they cannot be used. */
export function settingsOf(
  config: Readonly<Record<string, unknown>>,
): Nb3Settings {
  if (!absolute(config.dataDir))
    throw new Error('dataDir must be an absolute path without "..".');
  if (!absolute(config.hostDir))
    throw new Error('hostDir must be an absolute path without "..".');
  const hostsInput =
    typeof config.hosts === 'object' && config.hosts !== null
      ? (config.hosts as Record<string, unknown>)
      : {};
  const hosts: Record<string, string> = {};
  const seen = new Set<string>();
  for (const [appId, host] of Object.entries(hostsInput)) {
    if (typeof host !== 'string')
      throw new Error(`The host of ${appId} must be text.`);
    assertAppHost(host);
    composeNameOf(appId);
    if (seen.has(host))
      throw new Error(`The host ${host} is used by two Apps.`);
    seen.add(host);
    hosts[appId] = host;
  }
  const database = config.database ?? 'sqlite';
  if (database !== 'sqlite' && database !== 'postgres')
    throw new Error('database must be sqlite or postgres.');
  const maxApps = config.maxApps ?? 1;
  if (
    typeof maxApps !== 'number' ||
    !Number.isInteger(maxApps) ||
    maxApps < 1 ||
    maxApps > 2
  )
    throw new Error('maxApps must be 1 or 2.');
  const basePath = config.basePath ?? '/';
  if (typeof basePath !== 'string') throw new Error('basePath must be text.');
  return {
    dataDir: config.dataDir,
    hostDir: config.hostDir,
    hosts,
    database,
    basePath,
    maxApps,
  };
}

const status = (
  state: AppObservedStatus['state'],
  row: Nb3Row | null,
  error: string | null = null,
): AppObservedStatus => ({
  state,
  version: row?.version ?? null,
  deploymentId: row?.deploymentId ?? null,
  startedAt: row?.startedAt?.toISOString() ?? null,
  error,
  lastAccessedAt: null,
});

const POLL_MS = 3000;
const DEPLOY_TIMEOUT_MS = 5 * 60 * 1000;

export function createDokployDriver(deps: Nb3Deps): DeploymentDriver {
  const now = deps.now ?? (() => new Date());
  const sleep =
    deps.sleep ??
    ((ms: number) => new Promise<void>((done) => setTimeout(done, ms)));

  return {
    kind: DOKPLOY_DRIVER,
    title: appText('releaseDrivers.dokploy'),
    configSchema: CONFIG_SCHEMA,
    capabilities: { logs: false, urlModes: ['subdomain'] },
    validate: (config) => {
      settingsOf(config);
    },
    open(environment) {
      const settings = settingsOf(environment.config);
      return Promise.resolve(createSession(settings, environment.secret));
    },
  };

  function createSession(
    settings: Nb3Settings,
    _secret: Readonly<Record<string, unknown>> | null,
  ): DriverSession {
    const client = (): DokployClient => {
      const value = deps.dokploy();
      if (!value)
        throw new DokployRefused(
          'Studio has no Dokploy access here (DOKPLOY_URL, DOKPLOY_API_KEY and DOKPLOY_PROJECT_ID are not set).',
        );
      return value;
    };

    /** Runs `work`, turning a refusal or a Dokploy failure into a `failed` state rather than a throw. */
    async function guard(
      appId: string,
      work: () => Promise<AppObservedStatus>,
    ): Promise<AppObservedStatus> {
      try {
        return await work();
      } catch (error) {
        const message =
          error instanceof DokployRefused || error instanceof DokployError
            ? error.message
            : error instanceof Error
              ? error.message
              : String(error);
        const row = await deps.store.get(appId);
        if (row) await deps.store.save({ ...row, lastError: message });
        return status('failed', row, message);
      }
    }

    async function otherRunning(appId: string): Promise<readonly Nb3Row[]> {
      return (await deps.store.list()).filter(
        (row) => row.appId !== appId && row.desiredState === 'running',
      );
    }

    async function capacityProblem(appId: string): Promise<string | null> {
      const running = await otherRunning(appId);
      return running.length >= settings.maxApps
        ? `Only ${settings.maxApps} App(s) may run at once on this server and ${running
            .map((row) => row.appId)
            .join(', ')} is running: stop it first.`
        : null;
    }

    async function waitForDeploy(composeId: string): Promise<string | null> {
      const limit =
        now().getTime() + (deps.deployTimeoutMs ?? DEPLOY_TIMEOUT_MS);
      for (;;) {
        const compose = await client().get(composeId);
        if (compose.status === 'done') return null;
        if (compose.status === 'error')
          return 'Dokploy reported the deployment failed.';
        if (now().getTime() > limit)
          return 'Dokploy did not finish the deployment in time.';
        await sleep(POLL_MS);
      }
    }

    async function ensureRow(spec: AppDeploymentSpec): Promise<Nb3Row> {
      const existing = await deps.store.get(spec.appId);
      if (existing) return existing;
      const name = composeNameOf(spec.appId);
      const created = await client().create(
        name,
        `Created by Dương Sinh Studio for the NocoBase 3 App ${spec.appId}; Studio replaces and removes it.`,
      );
      const row: Nb3Row = {
        appId: spec.appId,
        composeId: created.composeId,
        composeName: name,
        desiredState: 'stopped',
        version: null,
        deploymentId: null,
        dbPasswordSealed:
          settings.database === 'postgres'
            ? deps.seal(randomBytes(18).toString('hex'))
            : null,
        idleStopMinutes: null,
        lastError: null,
        startedAt: null,
      };
      await deps.store.save(row);
      return row;
    }

    async function apply(
      spec: AppDeploymentSpec,
      onEvent?: (event: DeploymentEvent) => void,
    ): Promise<AppObservedStatus> {
      let sequence = 0;
      const emit = (phase: string, msg: string): void =>
        onEvent?.({
          time: now().toISOString(),
          phase,
          msg,
          sequence: ++sequence,
        });
      const host = settings.hosts[spec.appId];
      if (!host)
        return status(
          'failed',
          await deps.store.get(spec.appId),
          `No host name is set for ${spec.appId} in the environment settings.`,
        );
      const version = spec.release.version;
      if (!VERSION.test(version))
        return status(
          'failed',
          null,
          `The version ${version} cannot be used in a path.`,
        );
      if (spec.desiredState === 'running') {
        const problem = await capacityProblem(spec.appId);
        if (problem)
          return status('failed', await deps.store.get(spec.appId), problem);
      }
      let row = await ensureRow(spec);

      const name = row.composeName;
      const directory = join(settings.dataDir, name, version);
      const hostDirectory = join(settings.hostDir, name, version);
      emit('extracting', `Writing release ${version}.`);
      if (!spec.artifact)
        return status(
          'failed',
          row,
          'This driver runs release archives, not images.',
        );
      const present = await stat(join(directory, 'dist')).then(
        () => true,
        () => false,
      );
      if (!present) {
        await mkdir(directory, { recursive: true });
        try {
          await deps.extract(await spec.artifact.open(), directory);
        } catch (error) {
          await rm(directory, { recursive: true, force: true });
          throw error;
        }
      }
      if (spec.config.mode === 'file')
        await writeFile(join(directory, 'config.yml'), spec.config.content, {
          mode: 0o644,
        });

      emit('preparing', 'Updating the compose.');
      const composeFile = nb3ComposeFile({
        name,
        host,
        hostDir: hostDirectory,
        database: settings.database,
        basePath: settings.basePath,
        hasConfig: spec.config.mode === 'file',
      });
      const env = nb3ComposeEnv(
        spec.env ?? {},
        row.dbPasswordSealed ? deps.open(row.dbPasswordSealed) : null,
        { APP_PUBLIC_ORIGIN: `https://${host}` },
      );
      await client().update(row.composeId, { composeFile, env });

      if (spec.desiredState === 'stopped') {
        row = {
          ...row,
          desiredState: 'stopped',
          version,
          deploymentId: spec.deploymentId,
          idleStopMinutes: spec.idleStopMinutes,
          lastError: null,
        };
        await deps.store.save(row);
        emit('completed', 'The compose is ready; the App stays stopped.');
        return status('stopped', row);
      }

      emit('starting', 'Asking Dokploy to deploy.');
      await client().deploy(
        row.composeId,
        `${spec.kind} ${spec.appId} ${version}`,
      );
      emit('health_check', 'Waiting for Dokploy.');
      const problem = await waitForDeploy(row.composeId);
      row = {
        ...row,
        desiredState: 'running',
        version,
        deploymentId: spec.deploymentId,
        idleStopMinutes: spec.idleStopMinutes,
        lastError: problem,
        startedAt: problem ? row.startedAt : now(),
      };
      await deps.store.save(row);
      if (problem) return status('failed', row, problem);
      emit('completed', 'Running.');
      return status('running', row);
    }

    return {
      check: async () => {
        try {
          await client().environmentId();
          return {
            ok: true,
            details: { database: settings.database, maxApps: settings.maxApps },
          };
        } catch (error) {
          return {
            ok: false,
            message: error instanceof Error ? error.message : String(error),
          };
        }
      },
      apply: (spec, onEvent) => guard(spec.appId, () => apply(spec, onEvent)),
      start: (spec) =>
        guard(spec.appId, async () => {
          const row = await deps.store.get(spec.appId);
          if (!row) return apply(spec);
          const problem = await capacityProblem(spec.appId);
          if (problem) return status('failed', row, problem);
          await client().start(row.composeId);
          const started = {
            ...row,
            desiredState: 'running' as const,
            startedAt: now(),
            lastError: null,
          };
          await deps.store.save(started);
          return status('running', started);
        }),
      stop: (appId) =>
        guard(appId, async () => {
          const row = await deps.store.get(appId);
          if (!row) return status('stopped', null);
          await client().stop(row.composeId);
          const stopped = { ...row, desiredState: 'stopped' as const };
          await deps.store.save(stopped);
          return status('stopped', stopped);
        }),
      restart: (appId) =>
        guard(appId, async () => {
          const row = await deps.store.get(appId);
          if (!row) return status('unknown', null);
          const problem = await capacityProblem(appId);
          if (problem) return status('failed', row, problem);
          await client().stop(row.composeId);
          await client().start(row.composeId);
          const started = {
            ...row,
            desiredState: 'running' as const,
            startedAt: now(),
            lastError: null,
          };
          await deps.store.save(started);
          return status('running', started);
        }),
      remove: async (appId, options) => {
        const row = await deps.store.get(appId);
        if (!row) return;
        // Dokploy removes the compose with its volumes (the App's data); a kept-data removal only stops it.
        if (options.purgeData) {
          await client().remove(row.composeId);
          await deps.store.remove(appId);
          await rm(join(settings.dataDir, row.composeName), {
            recursive: true,
            force: true,
          });
        } else {
          await client().stop(row.composeId);
          await deps.store.save({ ...row, desiredState: 'stopped' });
        }
      },
      status: async (appIds) => {
        const rows = (await deps.store.list()).filter(
          (row) => !appIds || appIds.includes(row.appId),
        );
        const result = new Map<string, AppObservedStatus>();
        for (const row of rows)
          result.set(
            row.appId,
            status(
              row.lastError
                ? 'failed'
                : row.desiredState === 'running'
                  ? 'running'
                  : 'stopped',
              row,
              row.lastError,
            ),
          );
        return result;
      },
      // Dokploy keeps every compose across restarts of Studio: nothing to send again.
      restore: () => Promise.resolve(),
      logs: () =>
        Promise.resolve({
          entries: [],
          cursor: '',
          hasMore: false,
          available: false,
          reset: false,
        }),
      url: (appId) => {
        const host = settings.hosts[appId];
        return host ? `https://${host}` : null;
      },
      close: () => Promise.resolve(),
    };
  }
}

/**
 * Stops the Apps whose idle time is over (see the deviations above). Called every minute while Dokploy is configured;
 * a stop that fails is reported and tried again at the next sweep.
 */
export async function sweepIdle(
  deps: Pick<Nb3Deps, 'dokploy' | 'store' | 'now'>,
  report: (message: string, error: unknown) => void,
): Promise<number> {
  const client = deps.dokploy();
  if (!client) return 0;
  const at = (deps.now ?? (() => new Date()))().getTime();
  let stopped = 0;
  for (const row of await deps.store.list()) {
    if (
      row.desiredState !== 'running' ||
      row.idleStopMinutes === null ||
      !row.startedAt ||
      row.startedAt.getTime() + row.idleStopMinutes * 60_000 > at
    )
      continue;
    try {
      await client.stop(row.composeId);
      await deps.store.save({ ...row, desiredState: 'stopped' });
      stopped += 1;
    } catch (error) {
      report(`Could not stop the idle App ${row.appId}`, error);
    }
  }
  return stopped;
}
