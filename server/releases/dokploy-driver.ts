import { randomBytes } from 'node:crypto';
import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { resolve4 } from 'node:dns/promises';
import { join } from 'node:path';
import type {
  AppDeploymentSpec,
  AppObservedStatus,
  DeploymentDriver,
  DeploymentEvent,
  DriverSession,
} from '@nocobase/app-plugin-releases/server';
import type { Nb3Channel } from '../nb3-jobs/channel.js';
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
 * - `onDemand` is not offered: nothing wakes an App on a request. An App with `idleStopMinutes` is stopped when that many
 *   minutes have passed without a request to its host name, as the job daemon reads them from Traefik's access log
 *   (`sweepIdle`, V5.1b); where the daemon cannot say (channel off, no log configured) the old rule stands: that many
 *   minutes after it last started or deployed. It is started again by hand ("staging bật khi cần");
 * - removing an App with its data first dumps its PostgreSQL database through the daemon and refuses if that fails;
 * - only the running release and the newest other one stay under `dataDir` (a rollback is one click, older ones are
 *   extracted again from the archive when needed);
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
  /** The release environment the compose belongs to; null for a row made before V5.1 (it counts for every environment). */
  readonly environmentId?: string | null;
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
  /**
   * The ds-nb3-exec daemon, or null while the job channel is off. With it `status()` reports what the containers do and
   * `logs()` reads their log; without it both answer from Studio's own table as before.
   */
  readonly channel?: () => Nb3Channel | null;
  /** Host memory still available, in MiB; null when it cannot be read. The memory gate below needs it. */
  readonly availableMb?: () => Promise<number | null>;
  /** An App is not started while less than this is available (`NB3_MIN_AVAILABLE_MB`, 1200 by default). */
  readonly minAvailableMb?: number;
  /** IPv4 addresses of a host name, for `check()`. */
  readonly resolve?: (host: string) => Promise<readonly string[]>;
  readonly now?: () => Date;
  readonly sleep?: (ms: number) => Promise<void>;
  /** How long a deployment may take before it is reported failed. */
  readonly deployTimeoutMs?: number;
  /** Whether the App answers at this URL; the default asks over HTTPS with a 5 s limit. */
  readonly probe?: (url: string) => Promise<boolean>;
  /** How long the App may take to answer after Dokploy reports the deployment done. */
  readonly probeTimeoutMs?: number;
}

interface Nb3Settings {
  readonly dataDir: string;
  readonly hostDir: string;
  readonly hosts: Readonly<Record<string, string>>;
  readonly database: Nb3Database;
  readonly basePath: string;
  readonly maxApps: number;
}

/** Written after an archive is fully extracted; a version directory without it is incomplete and is extracted again. */
const EXTRACTED = '.extracted';
const PROBE_TIMEOUT_MS = 180_000;

const answers = (url: string): Promise<boolean> =>
  fetch(url, { signal: AbortSignal.timeout(5000) }).then(
    (response) => response.ok,
    () => false,
  );

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
    maxApps: { type: 'integer', minimum: 1, maximum: 10, default: 1 },
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
    maxApps > 10
  )
    throw new Error('maxApps must be between 1 and 10.');
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
  lastAccessedAt: string | null = null,
): AppObservedStatus => ({
  state,
  version: row?.version ?? null,
  deploymentId: row?.deploymentId ?? null,
  startedAt: row?.startedAt?.toISOString() ?? null,
  error,
  lastAccessedAt,
});

const POLL_MS = 3000;
const DEPLOY_TIMEOUT_MS = 5 * 60 * 1000;

const MIN_AVAILABLE_MB = 1200;
/** Without a readable memory gauge only this many Apps may run, whatever the environment says. */
const UNGAUGED_MAX_APPS = 2;

export function createDokployDriver(deps: Nb3Deps): DeploymentDriver {
  const now = deps.now ?? (() => new Date());
  const sleep =
    deps.sleep ??
    ((ms: number) => new Promise<void>((done) => setTimeout(done, ms)));

  return {
    kind: DOKPLOY_DRIVER,
    title: appText('releaseDrivers.dokploy'),
    configSchema: CONFIG_SCHEMA,
    capabilities: { logs: true, urlModes: ['subdomain'] },
    validate: (config) => {
      settingsOf(config);
    },
    open(environment) {
      const settings = settingsOf(environment.config);
      return Promise.resolve(
        createSession(settings, environment.secret, environment.id),
      );
    },
  };

  function createSession(
    settings: Nb3Settings,
    _secret: Readonly<Record<string, unknown>> | null,
    environmentId: string,
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

    /** The Apps running in this environment besides `appId`; a row from before V5.1 has no environment and counts for all. */
    async function otherRunning(appId: string): Promise<readonly Nb3Row[]> {
      return (await deps.store.list()).filter(
        (row) =>
          row.appId !== appId &&
          row.desiredState === 'running' &&
          (row.environmentId == null || row.environmentId === environmentId),
      );
    }

    /** Why `appId` may not start now: this environment's places are taken, or the server lacks memory. */
    async function capacityProblem(appId: string): Promise<string | null> {
      const running = await otherRunning(appId);
      if (running.length >= settings.maxApps)
        return `Only ${settings.maxApps} App(s) may run at once in this environment and ${running
          .map((row) => row.appId)
          .join(', ')} is running: stop it first.`;
      const available = deps.availableMb ? await deps.availableMb() : null;
      if (available === null) {
        // No gauge, no more than the old hard limit.
        return running.length >= UNGAUGED_MAX_APPS
          ? `The server's free memory cannot be read, so only ${UNGAUGED_MAX_APPS} Apps may run at once.`
          : null;
      }
      const minimum = deps.minAvailableMb ?? MIN_AVAILABLE_MB;
      return available < minimum
        ? `The server has ${available} MiB of memory available and a start needs at least ${minimum} MiB: stop an App or free memory first.`
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

    /**
     * Dokploy reports `done` when the compose is up, not when the App works: a container that crashes on start (a missing
     * module, a database it cannot open) still ends as `done`. The deployment succeeds only when the App answers.
     */
    async function waitForApp(host: string): Promise<string | null> {
      const url = `https://${host}${settings.basePath === '/' ? '' : settings.basePath}/api/healthz`;
      const probe = deps.probe ?? answers;
      const limit = now().getTime() + (deps.probeTimeoutMs ?? PROBE_TIMEOUT_MS);
      for (;;) {
        if (await probe(url)) return null;
        if (now().getTime() > limit)
          return `The App did not answer ${url} after the deployment; see its container logs in Dokploy.`;
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
        // The database password is made when a deployment needs it (`apply`), not here.
        dbPasswordSealed: null,
        idleStopMinutes: null,
        lastError: null,
        startedAt: null,
        environmentId,
      };
      await deps.store.save(row);
      return row;
    }

    /** Keeps the release now deployed and the newest other extracted one (the rollback); removes the rest (B#23). */
    async function pruneVersions(name: string, current: string): Promise<void> {
      const base = join(settings.dataDir, name);
      try {
        const others: { name: string; at: number }[] = [];
        for (const entry of await readdir(base, { withFileTypes: true })) {
          if (!entry.isDirectory() || entry.name === current) continue;
          const marker = await stat(join(base, entry.name, EXTRACTED)).then(
            (info) => info.mtimeMs,
            () => 0,
          );
          others.push({ name: entry.name, at: marker });
        }
        others.sort((a, b) => b.at - a.at);
        // The first is the rollback; an incomplete extraction (no marker) is never worth keeping.
        for (const [index, other] of others.entries())
          if (index > 0 || other.at === 0)
            await rm(join(base, other.name), { recursive: true, force: true });
      } catch {
        // Tidying is best effort: a release that stays is only disk space.
      }
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
      if (settings.database === 'postgres' && !row.dbPasswordSealed) {
        row = {
          ...row,
          dbPasswordSealed: deps.seal(randomBytes(18).toString('hex')),
        };
        await deps.store.save(row);
      }

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
      const present = await stat(join(directory, EXTRACTED)).then(
        () => true,
        () => false,
      );
      if (!present) {
        // A directory left by an interrupted or older extraction is not trusted.
        await rm(directory, { recursive: true, force: true });
        await mkdir(directory, { recursive: true });
        try {
          await deps.extract(await spec.artifact.open(), directory);
          await writeFile(join(directory, EXTRACTED), `${version}\n`);
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
        await pruneVersions(name, version);
        emit('completed', 'The compose is ready; the App stays stopped.');
        return status('stopped', row);
      }

      emit('starting', 'Asking Dokploy to deploy.');
      await client().deploy(
        row.composeId,
        `${spec.kind} ${spec.appId} ${version}`,
      );
      emit('health_check', 'Waiting for Dokploy and for the App to answer.');
      const problem =
        (await waitForDeploy(row.composeId)) ?? (await waitForApp(host));
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
      await pruneVersions(name, version);
      emit('completed', 'Running.');
      return status('running', row);
    }

    /** Dumps the App's database through the daemon; the reason it could not be done, or null when the dump exists. */
    async function dumpBeforePurge(row: Nb3Row): Promise<string | null> {
      if (settings.database !== 'postgres')
        return `${row.appId} uses SQLite, which Studio cannot dump before removing its data: back it up with backup-nb3.sh, or remove it keeping its data.`;
      const channel = deps.channel?.() ?? null;
      if (!channel)
        return `Studio cannot dump the database of ${row.appId} (the job channel is off), so its data is kept.`;
      const answer = await channel.call(
        { op: 'dump', app: row.composeName },
        20 * 60_000,
      );
      if (!answer.ok)
        return `The dump of ${row.appId} failed (${answer.error ?? 'no answer'}), so its data is kept.`;
      // Where the dump is on the server; the compose and the row are about to go, so this is the record of it.
      console.info(
        `Dumped ${row.appId} before removing its data: ${String(answer['file'])} (${String(answer['bytes'])} bytes, sha256 ${String(answer['sha256'])}).`,
      );
      return null;
    }

    return {
      check: async () => {
        try {
          await client().environmentId();
        } catch (error) {
          return {
            ok: false,
            message: error instanceof Error ? error.message : String(error),
          };
        }
        // The data directory must be writable by Studio, or no release can be written (B#21).
        try {
          await mkdir(settings.dataDir, { recursive: true });
          const probe = join(
            settings.dataDir,
            `.check-${randomBytes(4).toString('hex')}`,
          );
          await writeFile(probe, 'ok');
          await rm(probe);
        } catch (error) {
          const code = (error as NodeJS.ErrnoException).code ?? 'ERROR';
          return {
            ok: false,
            message: `Studio cannot write to ${settings.dataDir} (${code}).`,
          };
        }
        const resolve = deps.resolve ?? ((host) => resolve4(host));
        const dns: Record<string, string> = {};
        for (const host of Object.values(settings.hosts))
          dns[host] = await resolve(host).then(
            (addresses) => addresses.join(', ') || 'unresolved',
            () => 'unresolved',
          );
        return {
          ok: true,
          details: {
            database: settings.database,
            maxApps: settings.maxApps,
            dataDir: 'writable',
            dns,
          },
        };
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
          // Removing the compose removes its volumes: dump the database first, and keep everything if that cannot be done (V5.2b).
          const backup = await dumpBeforePurge(row);
          if (backup) throw new Error(backup);
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
        const channel = deps.channel?.() ?? null;
        const result = new Map<string, AppObservedStatus>();
        for (const row of rows) {
          const recorded = status(
            row.lastError
              ? 'failed'
              : row.desiredState === 'running'
                ? 'running'
                : 'stopped',
            row,
            row.lastError,
          );
          // Only an App meant to run is worth asking about; a stopped one has nothing to report.
          if (!channel || row.desiredState !== 'running') {
            result.set(row.appId, recorded);
            continue;
          }
          const seen = await channel.call(
            { op: 'inspect', app: row.composeName },
            10_000,
          );
          if (!seen.ok) {
            // The table says running, but nobody looked: do not claim it.
            result.set(row.appId, status('unknown', row, row.lastError));
            continue;
          }
          const state =
            typeof seen['state'] === 'string' ? seen['state'] : 'missing';
          if (state === 'running') {
            const access = await lastAccessOf(channel, row.composeName);
            result.set(
              row.appId,
              status(
                recorded.state,
                row,
                row.lastError,
                access?.lastAt ?? null,
              ),
            );
            continue;
          }
          const why =
            seen['oomKilled'] === true
              ? 'The container was killed for lack of memory.'
              : state === 'missing'
                ? 'The container is gone.'
                : `The container is ${state} (exit code ${typeof seen['exitCode'] === 'number' ? seen['exitCode'] : '?'}).`;
          // A dead container no longer holds one of the server's places: free it so another App may start.
          const freed = {
            ...row,
            desiredState: 'stopped' as const,
            lastError: why,
          };
          await deps.store.save(freed);
          result.set(row.appId, status('failed', freed, why));
        }
        return result;
      },
      // Dokploy keeps every compose across restarts of Studio: nothing to send again.
      restore: () => Promise.resolve(),
      logs: async (appId, query) => {
        const none = {
          entries: [],
          cursor: '',
          hasMore: false,
          available: false,
          reset: false,
        };
        const channel = deps.channel?.() ?? null;
        const row = await deps.store.get(appId);
        if (!channel || !row) return none;
        const since = query.since ? Date.parse(query.since) : Number.NaN;
        const minutes = Number.isFinite(since)
          ? Math.min(
              Math.max(Math.ceil((now().getTime() - since) / 60_000), 1),
              9999,
            )
          : 60;
        const answer = await channel.call(
          { op: 'logs', app: row.composeName, since: `${minutes}m`, tail: 500 },
          20_000,
        );
        if (!answer.ok || typeof answer['log'] !== 'string') return none;
        const time = now().toISOString();
        const search = query.search?.toLowerCase();
        const entries = answer['log']
          .split('\n')
          .filter((line) => line !== '')
          .filter((line) => !search || line.toLowerCase().includes(search))
          .map((msg) => ({ time, level: 'info', msg }));
        return {
          entries,
          cursor: '',
          hasMore: false,
          available: true,
          reset: false,
        };
      },
      url: (appId) => {
        const host = settings.hosts[appId];
        return host ? `https://${host}` : null;
      },
      close: () => Promise.resolve(),
    };
  }
}

/** What the daemon read from the access log for an App; null when it cannot say (channel off, no log, an error). */
interface AccessSeen {
  /** Time of the oldest line read: the window the answer covers starts here. */
  readonly from: number | null;
  readonly lastAt: string | null;
}

async function lastAccessOf(
  channel: Nb3Channel | null,
  composeName: string,
): Promise<AccessSeen | null> {
  if (!channel) return null;
  const answer = await channel.call(
    { op: 'lastAccess', app: composeName },
    10_000,
  );
  if (!answer.ok || answer['known'] !== true) return null;
  const from =
    typeof answer['from'] === 'string' ? Date.parse(answer['from']) : NaN;
  return {
    from: Number.isFinite(from) ? from : null,
    lastAt: typeof answer['lastAt'] === 'string' ? answer['lastAt'] : null,
  };
}

/**
 * Stops the Apps that have been idle for their `idleStopMinutes` (see the deviations above). Called every minute while
 * Dokploy is configured; a stop that fails is reported and tried again at the next sweep.
 *
 * "Idle" means no request to the App's host name since the later of its start and its last request in Traefik's access log.
 * When the daemon cannot say (no channel, no log) the App is idle that long after it started, as before. When it can but
 * the part of the log it read does not reach back as far as the idle time (the log was rotated, or is busy), nothing is
 * known and the App is left running: stopping one somebody uses is worse than stopping one late.
 */
export async function sweepIdle(
  deps: Pick<Nb3Deps, 'dokploy' | 'store' | 'now' | 'channel'>,
  report: (message: string, error: unknown) => void,
): Promise<number> {
  const client = deps.dokploy();
  if (!client) return 0;
  const at = (deps.now ?? (() => new Date()))().getTime();
  const channel = deps.channel?.() ?? null;
  let stopped = 0;
  for (const row of await deps.store.list()) {
    if (
      row.desiredState !== 'running' ||
      row.idleStopMinutes === null ||
      !row.startedAt
    )
      continue;
    const idleMs = row.idleStopMinutes * 60_000;
    let since = row.startedAt.getTime();
    if (since + idleMs > at) continue;
    const seen = await lastAccessOf(channel, row.composeName);
    if (seen) {
      if (seen.lastAt) since = Math.max(since, Date.parse(seen.lastAt));
      else if (seen.from === null || seen.from > at - idleMs) continue;
      if (since + idleMs > at) continue;
    }
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
