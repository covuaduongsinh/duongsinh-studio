import { randomUUID } from 'node:crypto';
import type { DatabaseConnection, DatabaseManager } from '@nocobase/db';
import { GitHubError, type GitHubClient } from '../git/github.js';
import { bool, iso, json, num, str, strOrNull, type Row } from '../git/rows.js';
import { PULL_REQUESTS, type GitService } from '../git/service.js';

/**
 * Releases for Dương Sinh (S5.4–S5.5). Every environment runs outside Studio, so Studio records rather than deploys:
 * tags of a repository's release line become versions, each version carries the issues whose merged pull requests it
 * brings, and people mark which version is on staging and on production (the owner, for production). From those marks
 * every issue knows where it is: merged, in a version, on staging, on production; what is merged and not on production
 * waits in "Pending release".
 */

export const ENVIRONMENTS = 'dsEnvironments';
export const REPOSITORY_APPS = 'dsRepositoryApps';
export const RELEASE_LINES = 'dsReleaseLines';
export const VERSIONS = 'dsVersions';
export const VERSION_TASKS = 'dsVersionTasks';
export const DEPLOYMENT_RECORDS = 'dsDeploymentRecords';
export const DEPLOYMENT_REQUESTS = 'dsDeploymentRequests';

/** The one release line Studio keeps per repository. */
export const STABLE_LINE = 'stable';
/** How often the poll reads a repository's tags when no webhook told it sooner. */
export const TAG_POLL_MS = 10 * 60 * 1000;
/** Issues merged longer ago than this and still not on production are worth a reminder. */
export const PENDING_REMINDER_MS = 3 * 24 * 60 * 60 * 1000;
/** The most pull requests whose ancestry is asked one by one for a repository's first version. */
const FIRST_VERSION_PULLS = 200;

export type EnvironmentKey = 'preview' | 'staging' | 'production';
export type DeploymentKind = 'deployed' | 'rolledBack';
export type RequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export type IssueWhere = 'merged' | 'released' | 'staging' | 'production';

export class ReleaseError extends Error {
  override name = 'ReleaseError';
  constructor(
    readonly status:
      | 'INVALID_ARGUMENT'
      | 'FAILED_PRECONDITION'
      | 'NOT_FOUND'
      | 'PERMISSION_DENIED'
      | 'UNAVAILABLE',
    readonly reason: string,
    message: string,
    readonly params: Readonly<Record<string, string>> = {},
  ) {
    super(message);
  }
}

export interface EnvironmentView {
  readonly key: string;
  readonly name: string;
  readonly purpose: string;
  readonly runsOn: string;
  readonly recordOnly: boolean;
  readonly protected: boolean;
  readonly approvers: string[];
  readonly maxApps: number | null;
  readonly idleStopMinutes: number | null;
  readonly removeOnClose: boolean;
  readonly publicUrlPattern: string | null;
  readonly description: string | null;
  readonly position: number;
}

export interface ReleaseLineView {
  readonly repositoryId: string;
  readonly lineKey: string;
  readonly branch: string;
  readonly pattern: string;
  readonly stripPrefix: string | null;
  readonly syncedAt: string | null;
  readonly syncError: string | null;
}

export interface RepositoryAppView {
  readonly environmentKey: string;
  readonly appId: string;
  readonly url: string | null;
}

export interface DeploymentRecordView {
  readonly id: string;
  readonly repositoryId: string;
  readonly versionId: string;
  readonly tag: string;
  readonly environmentKey: string;
  readonly kind: DeploymentKind;
  readonly note: string;
  readonly markedById: string;
  readonly requestId: string | null;
  readonly createdAt: string;
}

export interface VersionView {
  readonly id: string;
  readonly repositoryId: string;
  readonly repo: string;
  readonly lineKey: string;
  readonly tag: string;
  readonly version: string;
  readonly sha: string;
  readonly committedAt: string | null;
  readonly previousVersionId: string | null;
  readonly taskCount: number;
  readonly issueIds: string[];
  readonly discoveredAt: string;
  readonly deleted: boolean;
  /** Whether this version is what runs now on each environment, as people marked it. */
  readonly current: { readonly staging: boolean; readonly production: boolean };
  /** Whether this version or a later one was marked on each environment (what it brings is there). */
  readonly reached: { readonly staging: boolean; readonly production: boolean };
}

export interface IssueMark {
  readonly issueId: string;
  readonly where: IssueWhere;
  readonly repositoryId: string;
  readonly version: { readonly id: string; readonly tag: string } | null;
  readonly staging: { readonly tag: string; readonly at: string } | null;
  readonly production: { readonly tag: string; readonly at: string } | null;
  readonly mergedAt: string | null;
  readonly pullRequest: { readonly number: number; readonly url: string } | null;
}

export interface RequestView {
  readonly id: string;
  readonly repositoryId: string;
  readonly repo: string;
  readonly versionId: string;
  readonly tag: string;
  readonly environmentKey: string;
  readonly kind: DeploymentKind;
  readonly appId: string;
  readonly note: string;
  readonly requestedById: string;
  readonly status: RequestStatus;
  readonly decidedById: string | null;
  readonly decisionNote: string | null;
  readonly createdAt: string;
  readonly decidedAt: string | null;
}

export interface ReleaseNotice {
  readonly to: readonly string[];
  /** Stable per logical message, so a retry or a second poll does not send it twice. */
  readonly key: string;
  readonly title: string;
  readonly body: string;
  /** Where the item opens in Studio. */
  readonly path: string;
}

export interface ReleaseServiceDeps {
  readonly database: Pick<DatabaseManager, 'connection'>;
  readonly git: () => GitService;
  /** The users who decide production (the owner role). */
  readonly owners: () => Promise<string[]>;
  readonly notify: (notice: ReleaseNotice) => Promise<void>;
  /** A person's name for a message. */
  readonly nameOf?: (userId: string) => Promise<string | null>;
  /** The issue identifier (`DS-12`) for a message. */
  readonly issueLabels?: (issueIds: readonly string[]) => Promise<Map<string, string>>;
  readonly onError?: (message: string, error: unknown) => void;
  readonly now?: () => Date;
}

export type ReleaseService = ReturnType<typeof createReleaseService>;

/** A `v*`-style pattern as a regular expression: `*` any run of characters, `?` one. */
export function patternToRegExp(pattern: string): RegExp {
  const source = [...pattern]
    .map((char) =>
      char === '*'
        ? '.*'
        : char === '?'
          ? '.'
          : char.replace(/[.+^${}()|[\]\\]/gu, '\\$&'),
    )
    .join('');
  return new RegExp(`^${source}$`, 'u');
}

const environmentOf = (row: Row): EnvironmentView => {
  const approvers = json(row.approvers);
  return {
    key: str(row.key),
    name: str(row.name),
    purpose: str(row.purpose),
    runsOn: str(row.runsOn),
    recordOnly: bool(row.recordOnly),
    protected: bool(row.protected),
    approvers: Array.isArray(approvers)
      ? approvers.filter((item): item is string => typeof item === 'string')
      : [],
    maxApps: row.maxApps == null ? null : num(row.maxApps),
    idleStopMinutes: row.idleStopMinutes == null ? null : num(row.idleStopMinutes),
    removeOnClose: bool(row.removeOnClose),
    publicUrlPattern: strOrNull(row.publicUrlPattern),
    description: strOrNull(row.description),
    position: num(row.position),
  };
};

interface VersionRecord {
  readonly id: string;
  readonly repositoryId: string;
  readonly lineKey: string;
  readonly tag: string;
  readonly sha: string;
  readonly committedAt: string | null;
  readonly previousVersionId: string | null;
  readonly taskCount: number;
  readonly discoveredAt: string;
  readonly deletedAt: string | null;
}

const versionOf = (row: Row): VersionRecord => ({
  id: str(row.id),
  repositoryId: str(row.repositoryId),
  lineKey: str(row.lineKey),
  tag: str(row.tag),
  sha: str(row.sha),
  committedAt: iso(row.committedAt),
  previousVersionId: strOrNull(row.previousVersionId),
  taskCount: num(row.taskCount),
  discoveredAt: iso(row.discoveredAt) ?? '',
  deletedAt: iso(row.deletedAt),
});

/** Oldest first: by commit time, then by tag. */
const byOrder = (a: VersionRecord, b: VersionRecord): number => {
  const time = (a.committedAt ?? a.discoveredAt).localeCompare(
    b.committedAt ?? b.discoveredAt,
  );
  return time !== 0 ? time : a.tag.localeCompare(b.tag, 'en', { numeric: true });
};

const recordOf = (row: Row, tag: string): DeploymentRecordView => ({
  id: str(row.id),
  repositoryId: str(row.repositoryId),
  versionId: str(row.versionId),
  tag,
  environmentKey: str(row.environmentKey),
  kind: row.kind === 'rolledBack' ? 'rolledBack' : 'deployed',
  note: str(row.note),
  markedById: str(row.markedById),
  requestId: strOrNull(row.requestId),
  createdAt: iso(row.createdAt) ?? '',
});

const requestStatusOf = (value: unknown): RequestStatus =>
  value === 'approved' || value === 'rejected' || value === 'cancelled'
    ? value
    : 'pending';

const shortName = (fullName: string): string =>
  fullName.split('/').pop() ?? fullName;

export function createReleaseService(deps: ReleaseServiceDeps) {
  const conn = (): DatabaseConnection => deps.database.connection();
  const now = deps.now ?? (() => new Date());
  const report =
    deps.onError ??
    ((message: string, error: unknown) => console.error(message, error));

  // Environments.

  async function listEnvironments(): Promise<EnvironmentView[]> {
    const rows: Row[] = await conn()
      .query.selectFrom(ENVIRONMENTS)
      .selectAll()
      .orderBy('position', 'asc')
      .execute();
    return rows.map(environmentOf);
  }

  async function environment(key: string): Promise<EnvironmentView> {
    const row: Row | undefined = await conn()
      .query.selectFrom(ENVIRONMENTS)
      .selectAll()
      .where('key', '=', key)
      .executeTakeFirst();
    if (!row)
      throw new ReleaseError(
        'NOT_FOUND',
        'ENVIRONMENT_NOT_FOUND',
        `Environment ${key} does not exist.`,
        { key },
      );
    return environmentOf(row);
  }

  // Repositories: their App ids per environment and their release line.

  async function repositoryApps(repositoryId: string): Promise<RepositoryAppView[]> {
    const repository = await deps.git().getRepository(repositoryId);
    const rows: Row[] = await conn()
      .query.selectFrom(REPOSITORY_APPS)
      .selectAll()
      .where('repositoryId', '=', repositoryId)
      .execute();
    return (await listEnvironments()).map((env) => {
      const row = rows.find((item) => str(item.environmentKey) === env.key);
      return {
        environmentKey: env.key,
        appId: row ? str(row.appId) : `${shortName(repository.repo)}-${env.key}`,
        url: row ? strOrNull(row.url) : env.key === 'preview' ? null : env.publicUrlPattern,
      };
    });
  }

  async function setRepositoryApp(
    repositoryId: string,
    input: { readonly environmentKey: string; readonly appId: string; readonly url?: string | null },
  ): Promise<RepositoryAppView[]> {
    await deps.git().getRepository(repositoryId);
    await environment(input.environmentKey);
    const existing: Row | undefined = await conn()
      .query.selectFrom(REPOSITORY_APPS)
      .select(['id'])
      .where('repositoryId', '=', repositoryId)
      .where('environmentKey', '=', input.environmentKey)
      .executeTakeFirst();
    const at = now();
    if (existing)
      await conn()
        .query.updateTable(REPOSITORY_APPS)
        .set({ appId: input.appId, url: input.url ?? null, updatedAt: at })
        .where('id', '=', str(existing.id))
        .execute();
    else
      await conn()
        .query.insertInto(REPOSITORY_APPS)
        .values({
          id: randomUUID(),
          repositoryId,
          environmentKey: input.environmentKey,
          appId: input.appId,
          url: input.url ?? null,
          createdAt: at,
          updatedAt: at,
        })
        .execute();
    return repositoryApps(repositoryId);
  }

  async function releaseLine(repositoryId: string): Promise<ReleaseLineView> {
    const row: Row | undefined = await conn()
      .query.selectFrom(RELEASE_LINES)
      .selectAll()
      .where('repositoryId', '=', repositoryId)
      .where('lineKey', '=', STABLE_LINE)
      .executeTakeFirst();
    if (row)
      return {
        repositoryId,
        lineKey: STABLE_LINE,
        branch: str(row.branch),
        pattern: str(row.pattern),
        stripPrefix: strOrNull(row.stripPrefix),
        syncedAt: iso(row.syncedAt),
        syncError: strOrNull(row.syncError),
      };
    const repository = await deps.git().getRepository(repositoryId);
    return {
      repositoryId,
      lineKey: STABLE_LINE,
      branch: repository.defaultBranch || 'main',
      pattern: 'v*',
      stripPrefix: 'v',
      syncedAt: null,
      syncError: null,
    };
  }

  async function writeLine(
    repositoryId: string,
    values: Partial<{
      branch: string;
      pattern: string;
      stripPrefix: string | null;
      syncedAt: Date;
      syncError: string | null;
    }>,
  ): Promise<void> {
    const current = await releaseLine(repositoryId);
    const existing: Row | undefined = await conn()
      .query.selectFrom(RELEASE_LINES)
      .select(['id'])
      .where('repositoryId', '=', repositoryId)
      .where('lineKey', '=', STABLE_LINE)
      .executeTakeFirst();
    const at = now();
    if (existing) {
      await conn()
        .query.updateTable(RELEASE_LINES)
        .set({ ...values, updatedAt: at })
        .where('id', '=', str(existing.id))
        .execute();
      return;
    }
    await conn()
      .query.insertInto(RELEASE_LINES)
      .values({
        id: randomUUID(),
        repositoryId,
        lineKey: STABLE_LINE,
        branch: current.branch,
        pattern: current.pattern,
        stripPrefix: current.stripPrefix,
        syncedAt: null,
        syncError: null,
        ...values,
        createdAt: at,
        updatedAt: at,
      })
      .execute();
  }

  async function setReleaseLine(
    repositoryId: string,
    input: { readonly branch?: string; readonly pattern?: string; readonly stripPrefix?: string | null },
  ): Promise<ReleaseLineView> {
    await deps.git().getRepository(repositoryId);
    await writeLine(repositoryId, {
      ...(input.branch !== undefined ? { branch: input.branch } : {}),
      ...(input.pattern !== undefined ? { pattern: input.pattern } : {}),
      ...(input.stripPrefix !== undefined ? { stripPrefix: input.stripPrefix } : {}),
    });
    return releaseLine(repositoryId);
  }

  // Versions.

  const versionsOf = async (repositoryId: string): Promise<VersionRecord[]> => {
    const rows: Row[] = await conn()
      .query.selectFrom(VERSIONS)
      .selectAll()
      .where('repositoryId', '=', repositoryId)
      .execute();
    return rows.map(versionOf).sort(byOrder);
  };

  /** The merged pull requests of a repository that name an issue, by merge commit. */
  const mergedPulls = async (
    repositoryId: string,
  ): Promise<
    {
      id: string;
      issueId: string;
      number: number;
      url: string;
      baseBranch: string;
      mergeCommitSha: string;
      mergedAt: string | null;
    }[]
  > => {
    const rows: Row[] = await conn()
      .query.selectFrom(PULL_REQUESTS)
      .select([
        'id',
        'issueId',
        'number',
        'url',
        'baseBranch',
        'mergeCommitSha',
        'mergedAt',
      ])
      .where('repositoryId', '=', repositoryId)
      .where('state', '=', 'merged')
      .execute();
    return rows
      .filter((row) => strOrNull(row.issueId) && strOrNull(row.mergeCommitSha))
      .map((row) => ({
        id: str(row.id),
        issueId: str(row.issueId),
        number: num(row.number),
        url: str(row.url),
        baseBranch: str(row.baseBranch),
        mergeCommitSha: str(row.mergeCommitSha),
        mergedAt: iso(row.mergedAt),
      }));
  };

  /** The merged pull requests `version` brings that `previous` did not, from the commits between them. */
  async function tasksOf(
    client: GitHubClient,
    fullName: string,
    version: VersionRecord,
    previous: VersionRecord | null,
    pulls: Awaited<ReturnType<typeof mergedPulls>>,
  ): Promise<{ issueId: string; pullRequestId: string }[]> {
    const found = new Map<string, string>();
    if (previous) {
      const comparison = await client.compare(fullName, previous.sha, version.sha);
      const commits = new Set(comparison.commits);
      for (const pull of pulls)
        if (commits.has(pull.mergeCommitSha) && !found.has(pull.issueId))
          found.set(pull.issueId, pull.id);
    } else {
      // The first version brings every merged pull request its tag reaches.
      for (const pull of pulls.slice(0, FIRST_VERSION_PULLS)) {
        if (found.has(pull.issueId)) continue;
        const comparison = await client.compare(fullName, pull.mergeCommitSha, version.sha);
        if (comparison.status === 'ahead' || comparison.status === 'identical')
          found.set(pull.issueId, pull.id);
      }
    }
    return [...found].map(([issueId, pullRequestId]) => ({ issueId, pullRequestId }));
  }

  async function writeTasks(
    versionId: string,
    tasks: readonly { issueId: string; pullRequestId: string }[],
  ): Promise<void> {
    await conn().query.deleteFrom(VERSION_TASKS).where('versionId', '=', versionId).execute();
    if (tasks.length > 0)
      await conn()
        .query.insertInto(VERSION_TASKS)
        .values(tasks.map((task) => ({ versionId, ...task })))
        .execute();
  }

  /**
   * Reads the repository's tags and records what changed: a new tag of the line becomes a version with the issues it
   * brings, a tag gone from GitHub marks its version deleted (kept, with its marks), a tag back clears that. Versions
   * whose previous version changed are counted again.
   */
  async function syncRepository(
    repositoryId: string,
    options: { readonly recountAll?: boolean } = {},
  ): Promise<{
    readonly added: string[];
    readonly deleted: string[];
  }> {
    const line = await releaseLine(repositoryId);
    const repository = await deps.git().getRepository(repositoryId);
    try {
      const client = await deps.git().clientForRepository(repositoryId);
      const matcher = patternToRegExp(line.pattern);
      const listed = await client.tags(repository.repo, 100);
      const tags = listed.filter((tag) => matcher.test(tag.name));
      const complete = listed.length < 100;
      const before = await versionsOf(repositoryId);
      const known = new Map(before.map((version) => [version.tag, version]));
      const added: string[] = [];
      const addedIds = new Set<string>();
      const deleted: string[] = [];
      for (const tag of tags) {
        const existing = known.get(tag.name);
        if (existing) {
          if (existing.deletedAt || existing.sha !== tag.sha)
            await conn()
              .query.updateTable(VERSIONS)
              .set({ deletedAt: null, sha: tag.sha })
              .where('id', '=', existing.id)
              .execute();
          continue;
        }
        let committedAt: string | null = null;
        try {
          committedAt = await client.commitDate(repository.repo, tag.sha);
        } catch (error) {
          if (!(error instanceof GitHubError)) throw error;
        }
        const id = randomUUID();
        addedIds.add(id);
        await conn()
          .query.insertInto(VERSIONS)
          .values({
            id,
            repositoryId,
            lineKey: STABLE_LINE,
            tag: tag.name,
            sha: tag.sha,
            committedAt: committedAt ? new Date(committedAt) : null,
            previousVersionId: null,
            taskCount: 0,
            discoveredAt: now(),
            deletedAt: null,
          })
          .execute();
        added.push(tag.name);
      }
      if (complete) {
        const present = new Set(tags.map((tag) => tag.name));
        for (const version of before)
          if (!version.deletedAt && !present.has(version.tag)) {
            await conn()
              .query.updateTable(VERSIONS)
              .set({ deletedAt: now() })
              .where('id', '=', version.id)
              .execute();
            deleted.push(version.tag);
          }
      }
      if (options.recountAll)
        for (const version of before) addedIds.add(version.id);
      if (added.length > 0 || deleted.length > 0 || options.recountAll)
        await recount(repositoryId, client, repository.repo, addedIds);
      await writeLine(repositoryId, { syncedAt: now(), syncError: null });
      return { added, deleted };
    } catch (error) {
      await writeLine(repositoryId, {
        syncedAt: now(),
        syncError: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /** Orders the live versions and counts again every one whose previous version is not the one it was counted with. */
  async function recount(
    repositoryId: string,
    client: GitHubClient,
    fullName: string,
    fresh: ReadonlySet<string>,
  ): Promise<void> {
    const live = (await versionsOf(repositoryId)).filter((version) => !version.deletedAt);
    const pulls = await mergedPulls(repositoryId);
    let previous: VersionRecord | null = null;
    for (const version of live) {
      const previousId = previous?.id ?? null;
      if (version.previousVersionId !== previousId || fresh.has(version.id)) {
        const tasks = await tasksOf(client, fullName, version, previous, pulls);
        await writeTasks(version.id, tasks);
        await conn()
          .query.updateTable(VERSIONS)
          .set({ previousVersionId: previousId, taskCount: tasks.length })
          .where('id', '=', version.id)
          .execute();
      }
      previous = version;
    }
  }

  /** Reads the tags of repositories not read for `TAG_POLL_MS`; a failure is kept on the line and reported. */
  async function syncDue(): Promise<void> {
    for (const repository of await deps.git().listRepositories()) {
      const line = await releaseLine(repository.id);
      if (
        line.syncedAt &&
        now().getTime() - new Date(line.syncedAt).getTime() < TAG_POLL_MS
      )
        continue;
      try {
        await syncRepository(repository.id);
      } catch (error) {
        report(`Dương Sinh Studio could not read the tags of ${repository.repo}.`, error);
      }
    }
  }

  // Deployment records: what runs where.

  const recordsOf = async (repositoryIds: readonly string[]): Promise<Row[]> =>
    repositoryIds.length === 0
      ? []
      : conn()
          .query.selectFrom(DEPLOYMENT_RECORDS)
          .selectAll()
          .where('repositoryId', 'in', [...repositoryIds])
          .orderBy('createdAt', 'asc')
          .execute();

  /** The version each environment runs now, per repository: its latest record (a rollback is a record too). */
  const currentOf = (rows: readonly Row[]): Map<string, Map<string, Row>> => {
    const current = new Map<string, Map<string, Row>>();
    for (const row of rows) {
      const byEnv = current.get(str(row.repositoryId)) ?? new Map<string, Row>();
      byEnv.set(str(row.environmentKey), row);
      current.set(str(row.repositoryId), byEnv);
    }
    return current;
  };

  async function listVersions(repositoryIds: readonly string[]): Promise<VersionView[]> {
    const views: VersionView[] = [];
    const repositories = new Map(
      (await deps.git().listRepositories()).map((repository) => [repository.id, repository]),
    );
    const current = currentOf(await recordsOf(repositoryIds));
    for (const repositoryId of repositoryIds) {
      const repository = repositories.get(repositoryId);
      if (!repository) continue;
      const line = await releaseLine(repositoryId);
      const versions = await versionsOf(repositoryId);
      const live = versions.filter((version) => !version.deletedAt);
      const position = new Map(live.map((version, index) => [version.id, index]));
      const reachedIndex = (env: string): number => {
        const row = current.get(repositoryId)?.get(env);
        return row ? (position.get(str(row.versionId)) ?? -1) : -1;
      };
      const taskRows: Row[] =
        versions.length === 0
          ? []
          : await conn()
              .query.selectFrom(VERSION_TASKS)
              .select(['versionId', 'issueId'])
              .where('versionId', 'in', versions.map((version) => version.id))
              .execute();
      for (const version of [...versions].reverse()) {
        const index = position.get(version.id) ?? -1;
        const currentRow = (env: string) => current.get(repositoryId)?.get(env);
        views.push({
          id: version.id,
          repositoryId,
          repo: repository.repo,
          lineKey: version.lineKey,
          tag: version.tag,
          version:
            line.stripPrefix && version.tag.startsWith(line.stripPrefix)
              ? version.tag.slice(line.stripPrefix.length)
              : version.tag,
          sha: version.sha,
          committedAt: version.committedAt,
          previousVersionId: version.previousVersionId,
          taskCount: version.taskCount,
          issueIds: taskRows
            .filter((row) => str(row.versionId) === version.id)
            .map((row) => str(row.issueId)),
          discoveredAt: version.discoveredAt,
          deleted: version.deletedAt !== null,
          current: {
            staging: str(currentRow('staging')?.versionId) === version.id,
            production: str(currentRow('production')?.versionId) === version.id,
          },
          reached: {
            staging: index >= 0 && index <= reachedIndex('staging'),
            production: index >= 0 && index <= reachedIndex('production'),
          },
        });
      }
    }
    return views;
  }

  async function versionRecord(versionId: string): Promise<VersionRecord> {
    const row: Row | undefined = await conn()
      .query.selectFrom(VERSIONS)
      .selectAll()
      .where('id', '=', versionId)
      .executeTakeFirst();
    if (!row)
      throw new ReleaseError('NOT_FOUND', 'VERSION_NOT_FOUND', `Version ${versionId} does not exist.`, {
        versionId,
      });
    return versionOf(row);
  }

  async function listRecords(repositoryIds: readonly string[]): Promise<DeploymentRecordView[]> {
    const rows = await recordsOf(repositoryIds);
    const tags = new Map<string, string>();
    for (const row of rows) {
      const id = str(row.versionId);
      if (!tags.has(id)) tags.set(id, (await versionRecord(id)).tag);
    }
    return rows.map((row) => recordOf(row, tags.get(str(row.versionId)) ?? '')).reverse();
  }

  // Where each issue is.

  async function issueMarks(
    issueIds: readonly string[],
    repositoryIds?: readonly string[],
  ): Promise<IssueMark[]> {
    if (issueIds.length === 0) return [];
    const pullRows: Row[] = await conn()
      .query.selectFrom(PULL_REQUESTS)
      .select(['id', 'repositoryId', 'issueId', 'number', 'url', 'mergedAt', 'baseBranch'])
      .where('issueId', 'in', [...issueIds])
      .where('state', '=', 'merged')
      .execute();
    const byIssue = new Map<string, Row>();
    for (const row of pullRows) {
      if (repositoryIds && !repositoryIds.includes(str(row.repositoryId))) continue;
      const known = byIssue.get(str(row.issueId));
      if (!known || (iso(row.mergedAt) ?? '') > (iso(known.mergedAt) ?? ''))
        byIssue.set(str(row.issueId), row);
    }
    const repos = [...new Set([...byIssue.values()].map((row) => str(row.repositoryId)))];
    const current = currentOf(await recordsOf(repos));
    const marks: IssueMark[] = [];
    for (const repositoryId of repos) {
      const line = await releaseLine(repositoryId);
      const live = (await versionsOf(repositoryId)).filter((version) => !version.deletedAt);
      const position = new Map(live.map((version, index) => [version.id, index]));
      const liveIds = live.map((version) => version.id);
      const taskRows: Row[] =
        liveIds.length === 0
          ? []
          : await conn()
              .query.selectFrom(VERSION_TASKS)
              .select(['versionId', 'issueId'])
              .where('versionId', 'in', liveIds)
              .execute();
      const at = (env: string) => {
        const row = current.get(repositoryId)?.get(env);
        if (!row) return null;
        const index = position.get(str(row.versionId));
        return index === undefined
          ? null
          : { index, tag: live[index].tag, at: iso(row.createdAt) ?? '' };
      };
      const staging = at('staging');
      const production = at('production');
      for (const [issueId, pull] of byIssue) {
        if (str(pull.repositoryId) !== repositoryId) continue;
        if (str(pull.baseBranch) !== line.branch) continue;
        const versionIndexes = taskRows
          .filter((row) => str(row.issueId) === issueId)
          .map((row) => position.get(str(row.versionId)) ?? Number.MAX_SAFE_INTEGER)
          .sort((a, b) => a - b);
        const index = versionIndexes.length > 0 ? versionIndexes[0] : null;
        const version = index !== null && index < live.length ? live[index] : null;
        const on = (env: typeof staging) =>
          env && index !== null && index <= env.index ? { tag: env.tag, at: env.at } : null;
        const inProduction = on(production);
        const inStaging = on(staging);
        marks.push({
          issueId,
          repositoryId,
          where: inProduction
            ? 'production'
            : inStaging
              ? 'staging'
              : version
                ? 'released'
                : 'merged',
          version: version ? { id: version.id, tag: version.tag } : null,
          staging: inStaging,
          production: inProduction,
          mergedAt: iso(pull.mergedAt),
          pullRequest: { number: num(pull.number), url: str(pull.url) },
        });
      }
    }
    return marks;
  }

  /** Merged issues of these repositories not on production, oldest merge first. */
  async function pendingRelease(repositoryIds: readonly string[]): Promise<IssueMark[]> {
    const issueIds = new Set<string>();
    for (const repositoryId of repositoryIds)
      for (const pull of await mergedPulls(repositoryId)) issueIds.add(pull.issueId);
    return (await issueMarks([...issueIds], repositoryIds))
      .filter((mark) => mark.where !== 'production')
      .sort((a, b) => (a.mergedAt ?? '').localeCompare(b.mergedAt ?? ''));
  }

  // Marking a version on an environment, and requests the owner decides.

  async function appIdOf(repositoryId: string, environmentKey: string): Promise<string> {
    const app = (await repositoryApps(repositoryId)).find(
      (item) => item.environmentKey === environmentKey,
    );
    return app?.appId ?? environmentKey;
  }

  /**
   * Records that `versionId` runs on an environment now: deployed, or rolled back to. Moving production back answers
   * the issues of the versions now off it, for someone to consider reopening. Who may do it is the routes' to check.
   */
  async function mark(input: {
    readonly versionId: string;
    readonly environmentKey: EnvironmentKey;
    readonly kind: DeploymentKind;
    readonly note: string;
    readonly markedById: string;
    readonly requestId?: string | null;
  }): Promise<{ record: DeploymentRecordView; reopenSuggestions: string[] }> {
    if (!input.note.trim())
      throw new ReleaseError('INVALID_ARGUMENT', 'NOTE_REQUIRED', 'Say what was deployed, and how.');
    if (input.environmentKey === 'preview')
      throw new ReleaseError(
        'INVALID_ARGUMENT',
        'ENVIRONMENT_NOT_MARKABLE',
        'Previews belong to pull requests, not versions.',
      );
    await environment(input.environmentKey);
    const version = await versionRecord(input.versionId);
    if (version.deletedAt)
      throw new ReleaseError(
        'FAILED_PRECONDITION',
        'VERSION_DELETED',
        `The tag ${version.tag} is gone from the repository.`,
        { tag: version.tag },
      );
    const live = (await versionsOf(version.repositoryId)).filter((item) => !item.deletedAt);
    const position = new Map(live.map((item, index) => [item.id, index]));
    const before = currentOf(await recordsOf([version.repositoryId]))
      .get(version.repositoryId)
      ?.get(input.environmentKey);
    const beforeIndex = before ? (position.get(str(before.versionId)) ?? -1) : -1;
    const targetIndex = position.get(version.id) ?? -1;
    const id = randomUUID();
    const at = now();
    await conn()
      .query.insertInto(DEPLOYMENT_RECORDS)
      .values({
        id,
        repositoryId: version.repositoryId,
        versionId: version.id,
        environmentKey: input.environmentKey,
        kind: input.kind,
        note: input.note.trim(),
        markedById: input.markedById,
        requestId: input.requestId ?? null,
        createdAt: at,
      })
      .execute();
    let reopenSuggestions: string[] = [];
    if (input.environmentKey === 'production' && targetIndex < beforeIndex) {
      const offIds = live.slice(targetIndex + 1, beforeIndex + 1).map((item) => item.id);
      const rows: Row[] =
        offIds.length === 0
          ? []
          : await conn()
              .query.selectFrom(VERSION_TASKS)
              .select(['issueId'])
              .where('versionId', 'in', offIds)
              .execute();
      reopenSuggestions = [...new Set(rows.map((row) => str(row.issueId)))];
      const repository = await deps.git().getRepository(version.repositoryId);
      const labels = (await deps.issueLabels?.(reopenSuggestions)) ?? new Map<string, string>();
      try {
        await deps.notify({
          to: await deps.owners(),
          key: `ds-release-rollback-${id}`,
          title: `Production của ${repository.repo} đã quay lui về ${version.tag}`,
          body:
            reopenSuggestions.length > 0
              ? `Các issue có thể cần mở lại: ${reopenSuggestions.map((issueId) => labels.get(issueId) ?? issueId).join(', ')}.`
              : 'Không có issue nào rời khỏi production.',
          path: '/releases?tab=releases',
        });
      } catch (error) {
        report('Dương Sinh Studio could not send the rollback notice.', error);
      }
    }
    return {
      record: recordOf(
        {
          id,
          repositoryId: version.repositoryId,
          versionId: version.id,
          environmentKey: input.environmentKey,
          kind: input.kind,
          note: input.note.trim(),
          markedById: input.markedById,
          requestId: input.requestId ?? null,
          createdAt: at,
        },
        version.tag,
      ),
      reopenSuggestions,
    };
  }

  async function requestView(row: Row): Promise<RequestView> {
    const version = await versionRecord(str(row.versionId));
    const repository = await deps.git().getRepository(str(row.repositoryId));
    return {
      id: str(row.id),
      repositoryId: str(row.repositoryId),
      repo: repository.repo,
      versionId: version.id,
      tag: version.tag,
      environmentKey: str(row.environmentKey),
      kind: row.kind === 'rolledBack' ? 'rolledBack' : 'deployed',
      appId: await appIdOf(repository.id, str(row.environmentKey)),
      note: str(row.note),
      requestedById: str(row.requestedById),
      status: requestStatusOf(row.status),
      decidedById: strOrNull(row.decidedById),
      decisionNote: strOrNull(row.decisionNote),
      createdAt: iso(row.createdAt) ?? '',
      decidedAt: iso(row.decidedAt),
    };
  }

  async function getRequest(requestId: string): Promise<RequestView> {
    const row: Row | undefined = await conn()
      .query.selectFrom(DEPLOYMENT_REQUESTS)
      .selectAll()
      .where('id', '=', requestId)
      .executeTakeFirst();
    if (!row)
      throw new ReleaseError('NOT_FOUND', 'REQUEST_NOT_FOUND', `Request ${requestId} does not exist.`, {
        requestId,
      });
    return requestView(row);
  }

  async function listRequests(filter: {
    readonly status?: RequestStatus;
    readonly repositoryIds?: readonly string[];
  }): Promise<RequestView[]> {
    let query = conn().query.selectFrom(DEPLOYMENT_REQUESTS).selectAll();
    if (filter.status) query = query.where('status', '=', filter.status);
    if (filter.repositoryIds) {
      if (filter.repositoryIds.length === 0) return [];
      query = query.where('repositoryId', 'in', [...filter.repositoryIds]);
    }
    const rows: Row[] = await query.orderBy('createdAt', 'desc').execute();
    return Promise.all(rows.map(requestView));
  }

  /** Asks the owner to mark a version on production; the owner decides in the inbox. */
  async function request(input: {
    readonly versionId: string;
    readonly environmentKey: EnvironmentKey;
    readonly kind: DeploymentKind;
    readonly note: string;
    readonly requestedById: string;
  }): Promise<RequestView> {
    if (!input.note.trim())
      throw new ReleaseError('INVALID_ARGUMENT', 'NOTE_REQUIRED', 'Say what was deployed, and how.');
    const env = await environment(input.environmentKey);
    if (!env.protected)
      throw new ReleaseError(
        'FAILED_PRECONDITION',
        'APPROVAL_NOT_NEEDED',
        `${env.name} needs no approval: mark it directly.`,
      );
    const version = await versionRecord(input.versionId);
    if (version.deletedAt)
      throw new ReleaseError(
        'FAILED_PRECONDITION',
        'VERSION_DELETED',
        `The tag ${version.tag} is gone from the repository.`,
        { tag: version.tag },
      );
    const waiting: Row | undefined = await conn()
      .query.selectFrom(DEPLOYMENT_REQUESTS)
      .select(['id'])
      .where('repositoryId', '=', version.repositoryId)
      .where('environmentKey', '=', input.environmentKey)
      .where('status', '=', 'pending')
      .executeTakeFirst();
    if (waiting)
      throw new ReleaseError(
        'FAILED_PRECONDITION',
        'REQUEST_PENDING',
        'A request for this repository and environment waits already.',
        { requestId: str(waiting.id) },
      );
    const id = randomUUID();
    await conn()
      .query.insertInto(DEPLOYMENT_REQUESTS)
      .values({
        id,
        repositoryId: version.repositoryId,
        versionId: version.id,
        environmentKey: input.environmentKey,
        kind: input.kind,
        note: input.note.trim(),
        requestedById: input.requestedById,
        status: 'pending',
        decidedById: null,
        decisionNote: null,
        createdAt: now(),
        decidedAt: null,
      })
      .execute();
    const view = await getRequest(id);
    try {
      const requester = (await deps.nameOf?.(input.requestedById)) ?? input.requestedById;
      const to = (await deps.owners()).filter((userId) => userId !== input.requestedById);
      if (to.length > 0)
        await deps.notify({
          to,
          key: `ds-release-request-${id}`,
          title: `Cần quyết định: ${view.repo} ${view.tag} lên ${env.name}`,
          body: `${requester} đề nghị đánh dấu ${view.tag} của ${view.repo} đã lên ${env.name}. Ghi chú: ${view.note}`,
          path: `/inbox?releaseRequest=${id}`,
        });
    } catch (error) {
      report('Dương Sinh Studio could not send the request notice.', error);
    }
    return view;
  }

  /**
   * Decides a waiting request. Approving names the App again (`confirmAppId`), as the releases plugin asks for a
   * protected environment, and records the mark as the approver; the requester never decides their own request.
   */
  async function decide(input: {
    readonly requestId: string;
    readonly approve: boolean;
    readonly deciderId: string;
    readonly confirmAppId?: string;
    readonly note?: string;
  }): Promise<{ request: RequestView; record: DeploymentRecordView | null }> {
    const current = await getRequest(input.requestId);
    if (current.status !== 'pending')
      throw new ReleaseError('FAILED_PRECONDITION', 'REQUEST_DECIDED', 'The request is decided already.');
    if (current.requestedById === input.deciderId)
      throw new ReleaseError(
        'PERMISSION_DENIED',
        'OWN_REQUEST',
        'Someone other than the requester decides a request.',
      );
    if (input.approve && input.confirmAppId !== current.appId)
      throw new ReleaseError(
        'INVALID_ARGUMENT',
        'CONFIRMATION_REQUIRED',
        `Type the App id ${current.appId} to approve.`,
        { appId: current.appId },
      );
    if (!input.approve && !input.note?.trim())
      throw new ReleaseError('INVALID_ARGUMENT', 'NOTE_REQUIRED', 'Say why the request is rejected.');
    let record: DeploymentRecordView | null = null;
    if (input.approve)
      record = (
        await mark({
          versionId: current.versionId,
          environmentKey: current.environmentKey as EnvironmentKey,
          kind: current.kind,
          note: input.note?.trim() ? `${current.note} — ${input.note.trim()}` : current.note,
          markedById: input.deciderId,
          requestId: current.id,
        })
      ).record;
    await conn()
      .query.updateTable(DEPLOYMENT_REQUESTS)
      .set({
        status: input.approve ? 'approved' : 'rejected',
        decidedById: input.deciderId,
        decisionNote: input.note?.trim() || null,
        decidedAt: now(),
      })
      .where('id', '=', current.id)
      .execute();
    const decided = await getRequest(current.id);
    try {
      await deps.notify({
        to: [current.requestedById],
        key: `ds-release-decided-${current.id}`,
        title: `Đề nghị ${decided.repo} ${decided.tag} đã được ${input.approve ? 'duyệt' : 'từ chối'}`,
        body: decided.decisionNote ?? (input.approve ? 'Đã ghi nhận lên production.' : ''),
        path: '/releases?tab=releases',
      });
    } catch (error) {
      report('Dương Sinh Studio could not send the decision notice.', error);
    }
    return { request: decided, record };
  }

  async function cancelRequest(requestId: string, userId: string): Promise<RequestView> {
    const current = await getRequest(requestId);
    if (current.status !== 'pending')
      throw new ReleaseError('FAILED_PRECONDITION', 'REQUEST_DECIDED', 'The request is decided already.');
    if (current.requestedById !== userId)
      throw new ReleaseError('PERMISSION_DENIED', 'NOT_REQUESTER', 'Only the requester cancels a request.');
    await conn()
      .query.updateTable(DEPLOYMENT_REQUESTS)
      .set({ status: 'cancelled', decidedAt: now() })
      .where('id', '=', requestId)
      .execute();
    return getRequest(requestId);
  }

  /** Once a day: tells the owners which issues were merged more than three days ago and are still not on production. */
  async function remindPending(): Promise<number> {
    const repositories = await deps.git().listRepositories();
    const old = (await pendingRelease(repositories.map((repository) => repository.id))).filter(
      (mark) =>
        mark.mergedAt &&
        now().getTime() - new Date(mark.mergedAt).getTime() > PENDING_REMINDER_MS,
    );
    if (old.length === 0) return 0;
    const owners = await deps.owners();
    if (owners.length === 0) return 0;
    const labels = (await deps.issueLabels?.(old.map((mark) => mark.issueId))) ?? new Map<string, string>();
    const day = now().toISOString().slice(0, 10);
    await deps.notify({
      to: owners,
      key: `ds-release-pending-${day}`,
      title: `${old.length} issue đã merge hơn 3 ngày mà chưa lên production`,
      body: `Cũ nhất: ${old
        .slice(0, 10)
        .map((mark) => labels.get(mark.issueId) ?? mark.issueId)
        .join(', ')}.`,
      path: '/releases?tab=pending',
    });
    return old.length;
  }

  return {
    listEnvironments,
    environment,
    repositoryApps,
    setRepositoryApp,
    releaseLine,
    setReleaseLine,
    syncRepository,
    syncDue,
    listVersions,
    listRecords,
    issueMarks,
    pendingRelease,
    mark,
    request,
    decide,
    cancelRequest,
    getRequest,
    listRequests,
    remindPending,
  };
}
