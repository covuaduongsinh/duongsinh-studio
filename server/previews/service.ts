import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import bcrypt from 'bcryptjs';
import { readFile } from 'node:fs/promises';
import type { SecretsService } from '@nocobase/app-server/secrets';
import type { DatabaseConnection, DatabaseManager } from '@nocobase/db';
import type { GitService } from '../git/service.js';
import { iso, num, str, strOrNull, type Row } from '../git/rows.js';
import { composeEnv, composeFile, type PreviewSlot } from './compose.js';
import {
  DokployRefused,
  type DokployClient,
  type PreviewComposeName,
} from './dokploy.js';

export const PREVIEWS = 'dsPreviews';
export const PREVIEW_SLOTS = 'dsPreviewSlots';
const PULL_REQUESTS = 'dsPullRequests';
const REPOSITORIES = 'dsRepositories';

/** The workflow of duongsinh-nocobase that builds the plugins a preview installs (`.github/workflows/preview.yml`). */
export const PREVIEW_WORKFLOW = 'preview';
/** The artifact that workflow uploads: the `@duongsinh/*` plugin tarballs. */
export const PLUGIN_ARTIFACT = 'duongsinh-plugins';
/** The pull request label that asks for a preview. */
export const PREVIEW_LABEL = 'preview';
/** A ready preview nobody opened for this long is stopped. */
export const IDLE_STOP_MS = 30 * 60 * 1000;
/** Below this much available memory on the VPS a preview is not started. */
export const MIN_AVAILABLE_MB = 1200;
/** Production answering slower than this stops the preview. */
export const MAX_PRODUCTION_MS = 3000;
const CREDENTIALS_PURPOSE = 'duongsinh-studio/preview-credentials';

export type PreviewStatus =
  | 'waiting'
  | 'deploying'
  | 'ready'
  | 'stopped'
  | 'blocked'
  | 'failed'
  | 'destroyed';
const LIVE: readonly PreviewStatus[] = ['deploying', 'ready', 'stopped'];

export class PreviewError extends Error {
  override name = 'PreviewError';
  constructor(
    readonly status:
      'INVALID_ARGUMENT' | 'FAILED_PRECONDITION' | 'NOT_FOUND' | 'UNAVAILABLE',
    readonly reason: string,
    message: string,
  ) {
    super(message);
  }
}

export interface PreviewView {
  readonly id: string;
  readonly slot: PreviewSlot;
  readonly repositoryId: string;
  readonly pullNumber: number | null;
  readonly pullRequestId: string | null;
  readonly issueId: string | null;
  readonly branch: string;
  readonly sha: string;
  readonly runId: number | null;
  readonly logsUrl: string | null;
  readonly status: PreviewStatus;
  readonly reason: string | null;
  readonly url: string | null;
  readonly readyAt: string | null;
  readonly lastUsedAt: string | null;
  readonly stoppedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PreviewCredentials {
  readonly url: string;
  /** The basic auth in front of the pages (Traefik). */
  readonly basicUser: string;
  readonly basicPassword: string;
  /** The generated root account of the sample NocoBase. */
  readonly account: string;
  readonly password: string;
}

/** A ready preview still `deploying` after this long failed (the setup container died or hangs). */
export const SETUP_TIMEOUT_MS = 3 * 60 * 60 * 1000;

export interface ResourceProbe {
  /** Memory available on the host (MiB), null when unknown. */
  availableMb(): Promise<number | null>;
  /** How long production takes to answer (ms), null when it did not answer. */
  productionMs(): Promise<number | null>;
}

export interface PreviewServiceDeps {
  readonly database: Pick<DatabaseManager, 'connection'>;
  readonly secrets: () => SecretsService;
  readonly git: () => GitService;
  /** Null when Studio has no Dokploy configured: previews are then refused, never faked. */
  readonly dokploy: () => DokployClient | null;
  /** Studio's own public base (`https://studio.example.com/main`), for the setup container's report. */
  readonly publicBase: () => string | null;
  readonly hosts: Readonly<Record<PreviewSlot, string>>;
  readonly probe: ResourceProbe;
  readonly now?: () => Date;
  readonly random?: (bytes: number) => string;
  readonly onError?: (message: string, error: unknown) => void;
}

export type PreviewService = ReturnType<typeof createPreviewService>;

const COMPOSE_OF: Readonly<Record<PreviewSlot, PreviewComposeName>> = {
  preview: 'nocobase-preview',
  staging: 'nocobase-staging',
};

const statusOf = (value: unknown): PreviewStatus => {
  const known: readonly PreviewStatus[] = [
    'waiting',
    'deploying',
    'ready',
    'stopped',
    'blocked',
    'failed',
    'destroyed',
  ];
  return (known as readonly unknown[]).includes(value)
    ? (value as PreviewStatus)
    : 'failed';
};

const hashOf = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

const viewOf = (row: Row): PreviewView => ({
  id: str(row.id),
  slot: str(row.slot) === 'staging' ? 'staging' : 'preview',
  repositoryId: str(row.repositoryId),
  pullNumber: row.pullNumber == null ? null : num(row.pullNumber),
  pullRequestId: strOrNull(row.pullRequestId),
  issueId: strOrNull(row.issueId),
  branch: str(row.branch),
  sha: str(row.sha),
  runId: row.runId == null ? null : num(row.runId),
  logsUrl: strOrNull(row.logsUrl),
  status: statusOf(row.status),
  reason: strOrNull(row.reason),
  url: strOrNull(row.url),
  readyAt: iso(row.readyAt),
  lastUsedAt: iso(row.lastUsedAt),
  stoppedAt: iso(row.stoppedAt),
  createdAt: iso(row.createdAt) ?? '',
  updatedAt: iso(row.updatedAt) ?? '',
});

type Json = Record<string, unknown>;
const record = (value: unknown): Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Json)
    : {};

/** `/proc/meminfo` `MemAvailable` (a container reads the host's without lxcfs), in MiB. */
export async function hostAvailableMb(): Promise<number | null> {
  try {
    const match = /^MemAvailable:\s+(\d+)\s+kB/mu.exec(
      await readFile('/proc/meminfo', 'utf8'),
    );
    return match ? Math.round(Number(match[1]) / 1024) : null;
  } catch {
    return null;
  }
}

/** How long `url` takes to answer a GET, in ms; null when it fails or takes over 10 s. */
export async function answerMs(url: string): Promise<number | null> {
  const started = Date.now();
  try {
    const response = await globalThis.fetch(url, {
      signal: AbortSignal.timeout(10_000),
    });
    await response.arrayBuffer();
    return response.ok ? Date.now() - started : null;
  } catch {
    return null;
  }
}

/**
 * NocoBase 2 previews of duongsinh-nocobase pull requests and its staging (S5.6). One Dokploy compose per slot, created
 * and replaced by Studio only through the allowlisted client: a pull request labelled `preview` whose `preview` workflow
 * built the plugins takes the preview slot (another waits, `blocked`), a build of the default branch replaces staging.
 * Every deploy starts from empty volumes with sample data and new generated credentials. A ready preview nobody opened
 * for 30 minutes is stopped; a closed or unlabelled pull request's preview is removed with its volumes. Before a start
 * the host must have memory to spare, and production slower than 3 s stops the preview.
 */
export function createPreviewService(deps: PreviewServiceDeps) {
  const conn = (): DatabaseConnection => deps.database.connection();
  const now = deps.now ?? (() => new Date());
  const random =
    deps.random ?? ((bytes: number) => randomBytes(bytes).toString('hex'));
  const report =
    deps.onError ??
    ((message: string, error: unknown) => console.error(message, error));

  const dokploy = (): DokployClient => {
    const client = deps.dokploy();
    if (!client)
      throw new PreviewError(
        'FAILED_PRECONDITION',
        'PREVIEWS_NOT_CONFIGURED',
        'Dokploy is not configured for previews.',
      );
    return client;
  };

  /** The compose ids Studio recorded: all the Dokploy client may touch. */
  async function allowedComposeIds(): Promise<ReadonlySet<string>> {
    const rows: Row[] = await conn()
      .query.selectFrom(PREVIEW_SLOTS)
      .select(['composeId'])
      .execute();
    return new Set(rows.map((row) => str(row.composeId)).filter(Boolean));
  }

  async function slotRow(slot: PreviewSlot): Promise<Row | undefined> {
    return conn()
      .query.selectFrom(PREVIEW_SLOTS)
      .selectAll()
      .where('slot', '=', slot)
      .executeTakeFirst();
  }

  async function previewRow(id: string): Promise<Row> {
    const row: Row | undefined = await conn()
      .query.selectFrom(PREVIEWS)
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (!row)
      throw new PreviewError(
        'NOT_FOUND',
        'PREVIEW_NOT_FOUND',
        `Preview ${id} does not exist.`,
      );
    return row;
  }

  async function write(id: string, values: Row): Promise<void> {
    await conn()
      .query.updateTable(PREVIEWS)
      .set({ ...values, updatedAt: now() })
      .where('id', '=', id)
      .execute();
  }

  async function list(filter: {
    readonly repositoryIds: readonly string[];
    readonly issueId?: string;
  }): Promise<PreviewView[]> {
    if (filter.repositoryIds.length === 0) return [];
    let query = conn()
      .query.selectFrom(PREVIEWS)
      .selectAll()
      .where('repositoryId', 'in', [...filter.repositoryIds]);
    if (filter.issueId) query = query.where('issueId', '=', filter.issueId);
    const rows: Row[] = await query
      .orderBy('createdAt', 'desc')
      .limit(200)
      .execute();
    return rows.map(viewOf);
  }

  async function get(id: string): Promise<PreviewView> {
    return viewOf(await previewRow(id));
  }

  /** The preview occupying `slot` (its compose runs, or is stopped with its data), if any. */
  async function occupant(slot: PreviewSlot): Promise<PreviewView | null> {
    const slotRecord = await slotRow(slot);
    const id = slotRecord ? strOrNull(slotRecord.previewId) : null;
    if (!id) return null;
    const row: Row | undefined = await conn()
      .query.selectFrom(PREVIEWS)
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    const view = row ? viewOf(row) : null;
    return view && LIVE.includes(view.status) ? view : null;
  }

  async function issueOfPull(
    repositoryId: string,
    number: number,
  ): Promise<{ id: string | null; issueId: string | null }> {
    const row: Row | undefined = await conn()
      .query.selectFrom(PULL_REQUESTS)
      .select(['id', 'issueId'])
      .where('repositoryId', '=', repositoryId)
      .where('number', '=', number)
      .executeTakeFirst();
    return {
      id: row ? strOrNull(row.id) : null,
      issueId: row ? strOrNull(row.issueId) : null,
    };
  }

  /** Removes the slot's compose with its volumes, and forgets it. */
  async function clearSlot(slot: PreviewSlot): Promise<void> {
    const slotRecord = await slotRow(slot);
    if (!slotRecord) return;
    const composeId = str(slotRecord.composeId);
    try {
      await dokploy().remove(composeId);
    } catch (error) {
      // A compose removed by hand in Dokploy is gone already; anything else is reported and the row still forgotten,
      // since a compose Studio no longer records is one it can never touch again (the allowlist).
      if (!(error instanceof DokployRefused))
        report(`Removing the ${slot} compose ${composeId} failed`, error);
    }
    await conn()
      .query.deleteFrom(PREVIEW_SLOTS)
      .where('slot', '=', slot)
      .execute();
  }

  /**
   * Forgets which preview holds the slot but keeps its compose recorded (stopped, logs kept), so the next build may still
   * remove it: the compose id stays in `dsPreviewSlots`.
   */
  async function clearSlotRecordOnly(slot: PreviewSlot): Promise<void> {
    await conn()
      .query.updateTable(PREVIEW_SLOTS)
      .set({ previewId: null, updatedAt: now() })
      .where('slot', '=', slot)
      .execute();
  }

  async function resourcesProblem(): Promise<string | null> {
    const available = await deps.probe.availableMb();
    if (available !== null && available < MIN_AVAILABLE_MB)
      return `resources: only ${available} MiB available on the VPS (needs ${MIN_AVAILABLE_MB})`;
    const production = await deps.probe.productionMs();
    if (production !== null && production > MAX_PRODUCTION_MS)
      return `resources: production answered in ${production} ms`;
    return null;
  }

  /** Puts `id` up in its slot: fresh compose, fresh volumes, new credentials; the setup container reports back. */
  async function deploy(id: string): Promise<PreviewView> {
    const client = dokploy();
    const preview = viewOf(await previewRow(id));
    const problem = await resourcesProblem();
    if (problem) {
      await write(id, { status: 'blocked', reason: problem });
      return get(id);
    }
    const base = deps.publicBase();
    if (!base)
      throw new PreviewError(
        'FAILED_PRECONDITION',
        'PREVIEWS_NOT_CONFIGURED',
        'APP_PUBLIC_ORIGIN is not set.',
      );
    if (preview.runId === null)
      throw new PreviewError(
        'FAILED_PRECONDITION',
        'PREVIEW_NO_BUILD',
        'The preview has no workflow run to install.',
      );
    const git = deps.git();
    const repository = await git.getRepository(preview.repositoryId);
    const artifact = (
      await (
        await git.clientForRepository(preview.repositoryId)
      ).runArtifacts(repository.repo, preview.runId)
    ).find((item) => item.name === PLUGIN_ARTIFACT && !item.expired);
    if (!artifact) {
      await write(id, {
        status: 'failed',
        reason: `The workflow run has no ${PLUGIN_ARTIFACT} artifact (expired?).`,
      });
      return get(id);
    }
    const token = await git.repositoryToken(preview.repositoryId);
    await clearSlot(preview.slot);
    const created = await client.create(COMPOSE_OF[preview.slot]);
    const at = now();
    await conn()
      .query.insertInto(PREVIEW_SLOTS)
      .values({
        slot: preview.slot,
        composeId: created.composeId,
        appName: created.appName,
        previewId: id,
        createdAt: at,
        updatedAt: at,
      })
      .execute();
    const host = deps.hosts[preview.slot];
    const credentials: PreviewCredentials = {
      url: `https://${host}`,
      basicUser: preview.slot,
      basicPassword: '',
      account: `${preview.slot}-root@example.com`,
      password: random(12),
    };
    const callbackToken = random(24);
    const basicPassword = random(12);
    const sealedCredentials = { ...credentials, basicPassword };
    await client.update(created.composeId, {
      composeFile: composeFile({
        slot: preview.slot,
        host,
        basicAuthUsers: `${credentials.basicUser}:${bcrypt.hashSync(basicPassword, 10)}`,
      }),
      env: composeEnv({
        APP_KEY: random(32),
        DB_PASSWORD: random(16),
        NB_ACCOUNT: credentials.account,
        NB_PASSWORD: credentials.password,
        DSC_SEPAY_API_KEY: random(16),
        GH_TOKEN: token.token,
        REPO: token.fullName,
        SHA: preview.sha,
        ARTIFACT_URL: artifact.downloadUrl,
        CALLBACK_URL: `${base.replace(/\/+$/u, '')}/api/previews/${id}/report`,
        CALLBACK_TOKEN: callbackToken,
      }),
    });
    await write(id, {
      status: 'deploying',
      reason: null,
      url: credentials.url,
      credentialsSealed: deps
        .secrets()
        .seal(JSON.stringify(sealedCredentials), {
          purpose: CREDENTIALS_PURPOSE,
          aad: [id],
        }),
      callbackHash: hashOf(callbackToken),
      readyAt: null,
      stoppedAt: null,
      lastUsedAt: at,
    });
    await client.deploy(
      created.composeId,
      preview.pullNumber === null
        ? `staging ${preview.sha.slice(0, 7)}`
        : `PR #${preview.pullNumber} ${preview.sha.slice(0, 7)}`,
    );
    return get(id);
  }

  /** Takes `slot` for `id`, or leaves it waiting behind the preview of another pull request. */
  async function place(id: string): Promise<PreviewView> {
    const preview = viewOf(await previewRow(id));
    const current = await occupant(preview.slot);
    const sameSubject =
      current !== null &&
      current.repositoryId === preview.repositoryId &&
      current.pullNumber === preview.pullNumber;
    if (
      current &&
      !sameSubject &&
      current.status !== 'stopped' &&
      preview.slot === 'preview'
    ) {
      await write(id, {
        status: 'blocked',
        reason: `slotBusy: the preview slot runs pull request #${current.pullNumber ?? '?'}; this one waits.`,
      });
      return get(id);
    }
    if (current && current.id !== id)
      await write(current.id, {
        status: 'destroyed',
        reason: 'replaced',
        stoppedAt: now(),
      });
    return deploy(id);
  }

  /** A new build of a pull request (preview) or of the default branch (staging): recorded, then placed. */
  async function requestBuild(input: {
    readonly slot: PreviewSlot;
    readonly repositoryId: string;
    readonly pullNumber: number | null;
    readonly branch: string;
    readonly sha: string;
    readonly runId: number;
    readonly logsUrl: string | null;
    readonly requestedById?: string | null;
  }): Promise<PreviewView> {
    dokploy();
    const pull =
      input.pullNumber === null
        ? { id: null, issueId: null }
        : await issueOfPull(input.repositoryId, input.pullNumber);
    // Older waiting or blocked builds of the same subject are superseded by this one.
    let superseded = conn()
      .query.updateTable(PREVIEWS)
      .set({ status: 'destroyed', reason: 'superseded', updatedAt: now() })
      .where('slot', '=', input.slot)
      .where('repositoryId', '=', input.repositoryId)
      .where('status', 'in', ['waiting', 'blocked', 'failed']);
    superseded =
      input.pullNumber === null
        ? superseded.where('pullNumber', 'is', null)
        : superseded.where('pullNumber', '=', input.pullNumber);
    await superseded.execute();
    const id = randomUUID();
    const at = now();
    await conn()
      .query.insertInto(PREVIEWS)
      .values({
        id,
        slot: input.slot,
        repositoryId: input.repositoryId,
        pullNumber: input.pullNumber,
        pullRequestId: pull.id,
        issueId: pull.issueId,
        branch: input.branch,
        sha: input.sha,
        runId: input.runId,
        logsUrl: input.logsUrl,
        status: 'waiting',
        reason: null,
        url: null,
        credentialsSealed: null,
        callbackHash: null,
        requestedById: input.requestedById ?? null,
        readyAt: null,
        lastUsedAt: null,
        stoppedAt: null,
        createdAt: at,
        updatedAt: at,
      })
      .execute();
    try {
      return await place(id);
    } catch (error) {
      await write(id, {
        status: 'failed',
        reason:
          error instanceof Error ? error.message.slice(0, 500) : String(error),
      });
      throw error;
    }
  }

  /** The next pull request waiting for the preview slot, if the slot is free. */
  async function promote(): Promise<void> {
    const current = await occupant('preview');
    if (current && current.status !== 'stopped') return;
    const next: Row | undefined = await conn()
      .query.selectFrom(PREVIEWS)
      .selectAll()
      .where('slot', '=', 'preview')
      .where('status', '=', 'blocked')
      .where('reason', 'like', 'slotBusy:%')
      .orderBy('createdAt', 'asc')
      .executeTakeFirst();
    if (!next) return;
    if (current)
      await write(current.id, {
        status: 'destroyed',
        reason: 'gave the slot to a waiting pull request',
        stoppedAt: now(),
      });
    try {
      await deploy(str(next.id));
    } catch (error) {
      report('Promoting a waiting preview failed', error);
      await write(str(next.id), {
        status: 'failed',
        reason:
          error instanceof Error ? error.message.slice(0, 500) : String(error),
      });
    }
  }

  /** Removes a preview: its compose and volumes when it holds the slot; then a waiting one may take the slot. */
  async function destroy(id: string, reason: string): Promise<PreviewView> {
    dokploy();
    const preview = viewOf(await previewRow(id));
    const current = await occupant(preview.slot);
    const slotRecord = await slotRow(preview.slot);
    // The slot's compose goes with the preview holding it, or with a failed one that left it stopped and unclaimed.
    if (
      current?.id === id ||
      (slotRecord &&
        strOrNull(slotRecord.previewId) === null &&
        preview.status === 'failed')
    )
      await clearSlot(preview.slot);
    if (preview.status !== 'destroyed')
      await write(id, { status: 'destroyed', reason, stoppedAt: now() });
    if (preview.slot === 'preview') await promote();
    return get(id);
  }

  /** The same build again, from empty volumes. */
  async function retry(id: string): Promise<PreviewView> {
    dokploy();
    const preview = viewOf(await previewRow(id));
    if (preview.status === 'destroyed' && preview.reason === 'superseded')
      throw new PreviewError(
        'FAILED_PRECONDITION',
        'PREVIEW_SUPERSEDED',
        'A newer build of this pull request exists.',
      );
    await write(id, { status: 'waiting', reason: null });
    return place(id);
  }

  /** The setup container's report: `ready` or `failed`, with the token it was given. */
  async function report_(input: {
    readonly id: string;
    readonly token: string;
    readonly status: string;
    readonly reason: string | null;
  }): Promise<boolean> {
    const row: Row | undefined = await conn()
      .query.selectFrom(PREVIEWS)
      .selectAll()
      .where('id', '=', input.id)
      .executeTakeFirst();
    const expected = row ? strOrNull(row.callbackHash) : null;
    if (!row || !expected) return false;
    const given = Buffer.from(hashOf(input.token));
    if (
      given.length !== Buffer.from(expected).length ||
      !timingSafeEqual(given, Buffer.from(expected))
    )
      return false;
    const preview = viewOf(row);
    if (preview.status !== 'deploying') return true;
    if (input.status === 'ready') {
      const at = now();
      await write(input.id, {
        status: 'ready',
        reason: null,
        readyAt: at,
        lastUsedAt: at,
        callbackHash: null,
      });
      const production = await deps.probe.productionMs();
      if (production !== null && production > MAX_PRODUCTION_MS)
        await stop(
          input.id,
          `resources: production answered in ${production} ms`,
        );
    } else {
      await write(input.id, {
        status: 'failed',
        reason: (input.reason ?? 'The setup failed.').slice(0, 1000),
        callbackHash: null,
      });
      // A failed setup leaves NocoBase and its database running for nothing: stop them (the containers and their logs
      // stay until the next build or the pull request closes), and let a waiting pull request in.
      const slotRecord = await slotRow(preview.slot);
      if (slotRecord && strOrNull(slotRecord.previewId) === input.id) {
        try {
          await dokploy().stop(str(slotRecord.composeId));
        } catch (error) {
          report(`Stopping the failed preview ${input.id} failed`, error);
        }
        await clearSlotRecordOnly(preview.slot);
        if (preview.slot === 'preview') await promote();
      }
    }
    return true;
  }

  async function stop(id: string, reason: string): Promise<void> {
    const preview = viewOf(await previewRow(id));
    const slotRecord = await slotRow(preview.slot);
    if (slotRecord && strOrNull(slotRecord.previewId) === id)
      await dokploy().stop(str(slotRecord.composeId));
    await write(id, {
      status: reason.startsWith('resources') ? 'blocked' : 'stopped',
      reason,
      stoppedAt: now(),
    });
    if (preview.slot === 'preview') await promote();
  }

  /** Someone opens the preview: it counts as use; a stopped preview starts again (its data kept). */
  async function open(id: string): Promise<PreviewView> {
    const preview = viewOf(await previewRow(id));
    if (preview.status === 'stopped') {
      const current = await occupant(preview.slot);
      const slotRecord = await slotRow(preview.slot);
      if (current?.id !== id || !slotRecord)
        throw new PreviewError(
          'FAILED_PRECONDITION',
          'PREVIEW_GONE',
          'The preview was removed; retry it to build it again.',
        );
      const problem = await resourcesProblem();
      if (problem)
        throw new PreviewError('UNAVAILABLE', 'PREVIEW_RESOURCES', problem);
      await dokploy().start(str(slotRecord.composeId));
      await write(id, {
        status: 'ready',
        reason: null,
        stoppedAt: null,
        lastUsedAt: now(),
      });
    } else if (preview.status === 'ready')
      await write(id, { lastUsedAt: now() });
    return get(id);
  }

  async function credentials(id: string): Promise<PreviewCredentials | null> {
    const row = await previewRow(id);
    const sealed = strOrNull(row.credentialsSealed);
    if (!sealed) return null;
    const value = record(
      JSON.parse(
        deps
          .secrets()
          .open(sealed, { purpose: CREDENTIALS_PURPOSE, aad: [id] }),
      ),
    );
    return {
      url: str(value.url),
      basicUser: str(value.basicUser),
      basicPassword: str(value.basicPassword),
      account: str(value.account),
      password: str(value.password),
    };
  }

  /**
   * Stops ready previews nobody used for 30 minutes (staging stays; a preview still being set up is not idle), fails
   * one whose setup never reported within three hours, and lets a waiting pull request into a freed slot.
   */
  async function sweep(): Promise<number> {
    const stuck: Row[] = await conn()
      .query.selectFrom(PREVIEWS)
      .selectAll()
      .where('status', '=', 'deploying')
      .where('updatedAt', '<', new Date(now().getTime() - SETUP_TIMEOUT_MS))
      .execute();
    for (const row of stuck) {
      try {
        await stop(str(row.id), 'setup timed out: no report within 3 hours');
        await write(str(row.id), { status: 'failed' });
      } catch (error) {
        report(`Stopping the stuck preview ${str(row.id)} failed`, error);
      }
    }
    const before = new Date(now().getTime() - IDLE_STOP_MS);
    const rows: Row[] = await conn()
      .query.selectFrom(PREVIEWS)
      .selectAll()
      .where('slot', '=', 'preview')
      .where('status', '=', 'ready')
      .where('lastUsedAt', '<', before)
      .execute();
    for (const row of rows) {
      try {
        await stop(str(row.id), 'idle: nobody opened it for 30 minutes');
      } catch (error) {
        report(`Stopping the idle preview ${str(row.id)} failed`, error);
      }
    }
    await promote();
    return rows.length;
  }

  /** A `pull_request` or `workflow_run` delivery of a linked repository. */
  async function onWebhook(
    repositoryId: string,
    event: string,
    payload: Row,
  ): Promise<string> {
    if (!deps.dokploy()) return 'notConfigured';
    if (event === 'pull_request') {
      const action = str(payload.action);
      const pull = record(payload.pull_request);
      const number = num(pull.number, num(payload.number));
      const label = str(record(payload.label).name);
      const closing =
        action === 'closed' ||
        (action === 'unlabeled' && label === PREVIEW_LABEL);
      if (!closing || number <= 0) return 'ignored';
      const rows: Row[] = await conn()
        .query.selectFrom(PREVIEWS)
        .selectAll()
        .where('slot', '=', 'preview')
        .where('repositoryId', '=', repositoryId)
        .where('pullNumber', '=', number)
        .where('status', '!=', 'destroyed')
        .execute();
      for (const row of rows)
        await destroy(
          str(row.id),
          action === 'closed' ? 'pull request closed' : 'preview label removed',
        );
      return rows.length > 0 ? 'destroyed' : 'nothing';
    }
    if (event !== 'workflow_run') return 'ignored';
    const run = record(payload.workflow_run);
    if (
      str(payload.action) !== 'completed' ||
      str(run.name) !== PREVIEW_WORKFLOW
    )
      return 'ignored';
    if (str(run.conclusion) !== 'success') return 'buildFailed';
    const runId = num(run.id);
    const sha = str(run.head_sha);
    const branch = str(run.head_branch);
    const logsUrl = strOrNull(run.html_url);
    const runEvent = str(run.event);
    if (runEvent === 'push') {
      const repository = await deps.git().getRepository(repositoryId);
      if (branch !== repository.defaultBranch) return 'ignored';
      await requestBuild({
        slot: 'staging',
        repositoryId,
        pullNumber: null,
        branch,
        sha,
        runId,
        logsUrl,
      });
      return 'staging';
    }
    if (runEvent !== 'pull_request') return 'ignored';
    const pulls = Array.isArray(run.pull_requests)
      ? run.pull_requests.map(record)
      : [];
    const number = pulls.length > 0 ? num(pulls[0].number) : 0;
    if (number <= 0) return 'noPullRequest';
    await requestBuild({
      slot: 'preview',
      repositoryId,
      pullNumber: number,
      branch,
      sha,
      runId,
      logsUrl,
    });
    return 'preview';
  }

  /** Staging from the newest successful build of the default branch, on an administrator's request. */
  async function deployStaging(
    repositoryId: string,
    requestedById: string,
  ): Promise<PreviewView> {
    const latest: Row | undefined = await conn()
      .query.selectFrom(PREVIEWS)
      .selectAll()
      .where('slot', '=', 'staging')
      .where('repositoryId', '=', repositoryId)
      .where('runId', 'is not', null)
      .orderBy('createdAt', 'desc')
      .executeTakeFirst();
    if (!latest)
      throw new PreviewError(
        'FAILED_PRECONDITION',
        'STAGING_NO_BUILD',
        'No build of the default branch yet: push to main (the preview workflow builds the plugins), then try again.',
      );
    const view = viewOf(latest);
    return requestBuild({
      slot: 'staging',
      repositoryId,
      pullNumber: null,
      branch: view.branch,
      sha: view.sha,
      runId: view.runId ?? 0,
      logsUrl: view.logsUrl,
      requestedById,
    });
  }

  async function repositoryOfName(fullName: string): Promise<string | null> {
    const row: Row | undefined = await conn()
      .query.selectFrom(REPOSITORIES)
      .select(['id'])
      .where('fullName', '=', fullName)
      .executeTakeFirst();
    return row ? str(row.id) : null;
  }

  return {
    allowedComposeIds,
    list,
    get,
    occupant,
    requestBuild,
    destroy,
    retry,
    report: report_,
    open,
    credentials,
    sweep,
    onWebhook,
    deployStaging,
    repositoryOfName,
    isLive: (status: PreviewStatus) => LIVE.includes(status),
    configured: () => deps.dokploy() !== null,
  };
}
