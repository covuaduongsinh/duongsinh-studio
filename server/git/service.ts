import { randomUUID } from 'node:crypto';
import type { SecretsService } from '@nocobase/app-server/secrets';
import type {
  Actor,
  Projects,
  Viewer,
} from '@nocobase/app-plugin-projects/server/tokens';
import type { DatabaseConnection, DatabaseManager } from '@nocobase/db';
import {
  GITHUB_API_URL,
  GitHubError,
  createGitHubClient,
  type GitHubCheck,
  type GitHubClient,
  type GitHubPull,
} from './github.js';
import {
  FORCEABLE_BLOCKERS,
  ciStateOf,
  issueKeysOf,
  mergeBlockerOf,
  mergeabilityOf,
  type ChecksSource,
  type CiState,
  type MergeBlocker,
  type Mergeability,
  type PullState,
} from './pull-state.js';
import {
  bool,
  iso,
  json,
  num,
  str,
  strOrNull,
  strings,
  type Row,
} from './rows.js';
import { ISSUE_BRANCH_PREFIX } from '../agents/ids.js';

/** The status event a linked pull request's merge fires (`projectsStatusEventsToken`). */
export const PR_MERGED_EVENT = 'ds.pr.merged';
/** Comment messages (`projects.comments.post` `message.type`) a reader's page may word in its own language. */
export const PR_MERGED_MESSAGE = 'ds.pr.merged';
export const PR_CLOSED_MESSAGE = 'ds.pr.closed';
/** What seals a connection's token; `aad` is the connection id. */
export const TOKEN_SECRET_PURPOSE = 'duongsinh-studio/git-connection-token';

export const CONNECTIONS = 'dsGitConnections';
export const REPOSITORIES = 'dsRepositories';
export const PROJECT_REPOSITORIES = 'dsProjectRepositories';
export const PULL_REQUESTS = 'dsPullRequests';

const OPEN_PULLS = 50;
const CLOSED_PULLS = 20;
/** How long a pushed credential is said to last; a token cannot be cut shorter (see `docs/chenh-lech-upstream.md`). */
const CREDENTIAL_TTL_MS = 60 * 60 * 1000;

/** A refusal the routes turn into an `ApiError`, with `reason` doubling as the `studioGit.errors.*` key. */
export class GitError extends Error {
  override name = 'GitError';
  constructor(
    readonly status:
      | 'INVALID_ARGUMENT'
      | 'FAILED_PRECONDITION'
      | 'NOT_FOUND'
      | 'ALREADY_EXISTS'
      | 'UNAVAILABLE',
    readonly reason: string,
    message: string,
    readonly params: Readonly<Record<string, string>> = {},
    readonly metadata: Readonly<Record<string, unknown>> = {},
  ) {
    super(message);
  }
}

export interface GitConnectionView {
  readonly id: string;
  readonly provider: 'github';
  readonly kind: 'token';
  readonly name: string;
  readonly account: string | null;
  readonly webUrl: string;
  readonly apiBaseUrl: string;
  readonly hasToken: boolean;
  readonly webhooks: boolean;
  readonly personalMethods: string[];
  readonly allowPersonalTokens: boolean;
  readonly problems: string[];
  readonly usedBy: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface GitRepositoryView {
  readonly id: string;
  readonly connectionId: string;
  readonly provider: 'github';
  readonly repo: string;
  readonly cloneUrl: string;
  readonly webUrl: string;
  readonly defaultBranch: string;
  readonly branchPrefix: string;
  readonly checksSource: ChecksSource;
  readonly requiredChecks: string[];
  readonly pollSeconds: number;
  readonly polledAt: string | null;
  readonly pollError: string | null;
  readonly projects: {
    readonly projectId: string;
    readonly isPrimary: boolean;
  }[];
}

export interface StoredCheck {
  readonly kind: 'checkRun' | 'status';
  readonly name: string;
  readonly status: string;
  readonly conclusion: string | null;
  readonly outcome: GitHubCheck['outcome'];
  readonly url: string | null;
}

export interface GitPullRequestView {
  readonly id: string;
  readonly repositoryId: string;
  readonly repo: string;
  readonly provider: 'github';
  readonly number: number;
  readonly url: string;
  readonly title: string;
  readonly state: PullState;
  readonly draft: boolean;
  readonly headRef: string;
  readonly baseRef: string;
  readonly headSha: string;
  readonly mergeCommitSha: string | null;
  readonly authorLogin: string | null;
  readonly mergeability: Mergeability;
  readonly hostMergeState: string | null;
  /** The Studio demo's words: `success`, `failure`, `pending`, or null when the head has no check. */
  readonly ciState: 'success' | 'failure' | 'pending' | null;
  readonly checks: StoredCheck[];
  readonly issueId: string | null;
  readonly linkedBy: string | null;
  readonly mergedAt: string | null;
  readonly mergedBy: { readonly id: string } | null;
  readonly mergeForcedReason: string | null;
  readonly closedAt: string | null;
  readonly snapshotAt: string | null;
  readonly mergeBlocker: MergeBlocker | null;
  readonly mergeInStudio: boolean;
  readonly checksSource: ChecksSource;
  readonly updatedAt: string;
}

interface ConnectionRecord {
  readonly id: string;
  readonly name: string;
  readonly account: string | null;
  readonly apiBaseUrl: string;
  readonly tokenSealed: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface RepositoryRecord {
  readonly id: string;
  readonly connectionId: string;
  readonly fullName: string;
  readonly cloneUrl: string;
  readonly webUrl: string;
  readonly defaultBranch: string;
  readonly branchPrefix: string;
  readonly checksSource: ChecksSource;
  readonly requiredChecks: string[];
  readonly pollSeconds: number;
  readonly polledAt: string | null;
  readonly pollError: string | null;
  readonly createdAt: string;
}

interface PullRecord {
  readonly id: string;
  readonly repositoryId: string;
  readonly number: number;
  readonly issueId: string | null;
  readonly linkedBy: string | null;
  readonly headBranch: string;
  readonly headSha: string;
  readonly baseBranch: string;
  readonly state: PullState;
  readonly draft: boolean;
  readonly title: string;
  readonly url: string;
  readonly authorLogin: string | null;
  readonly mergeability: Mergeability;
  readonly hostMergeState: string | null;
  readonly ciState: CiState;
  readonly checks: StoredCheck[];
  readonly mergeCommitSha: string | null;
  readonly mergedAt: string | null;
  readonly mergedById: string | null;
  readonly mergeForcedReason: string | null;
  readonly closedAt: string | null;
  readonly snapshotAt: string | null;
  readonly updatedAt: string;
}

const checksSourceOf = (value: unknown): ChecksSource =>
  value === 'external' || value === 'agent' ? value : 'host';
const pullStateOf = (value: unknown): PullState =>
  value === 'closed' || value === 'merged' ? value : 'open';
const mergeabilityValue = (value: unknown): Mergeability =>
  value === 'clean' || value === 'conflicts' || value === 'blocked'
    ? value
    : 'unknown';
const ciStateValue = (value: unknown): CiState =>
  value === 'passed' || value === 'failed' || value === 'pending'
    ? value
    : 'missing';

function checksOf(value: unknown): StoredCheck[] {
  const parsed = json(value);
  if (!Array.isArray(parsed)) return [];
  return parsed.map((item: unknown): StoredCheck => {
    const check: Row =
      typeof item === 'object' && item !== null ? (item as Row) : {};
    const outcome = check.outcome;
    return {
      kind: check.kind === 'status' ? 'status' : 'checkRun',
      name: str(check.name),
      status: str(check.status),
      conclusion: strOrNull(check.conclusion),
      outcome:
        outcome === 'success' || outcome === 'failure' ? outcome : 'pending',
      url: strOrNull(check.url),
    };
  });
}

const connectionOf = (row: Row): ConnectionRecord => ({
  id: str(row.id),
  name: str(row.name),
  account: strOrNull(row.account),
  apiBaseUrl: str(row.apiBaseUrl) || GITHUB_API_URL,
  tokenSealed: strOrNull(row.tokenSealed),
  createdAt: iso(row.createdAt) ?? '',
  updatedAt: iso(row.updatedAt) ?? '',
});

const repositoryOf = (row: Row): RepositoryRecord => ({
  id: str(row.id),
  connectionId: str(row.connectionId),
  fullName: str(row.fullName),
  cloneUrl: str(row.cloneUrl),
  webUrl: str(row.webUrl),
  defaultBranch: str(row.defaultBranch),
  branchPrefix: str(row.branchPrefix),
  checksSource: checksSourceOf(row.checksSource),
  requiredChecks: strings(row.requiredChecks),
  pollSeconds: num(row.pollSeconds, 60),
  polledAt: iso(row.polledAt),
  pollError: strOrNull(row.pollError),
  createdAt: iso(row.createdAt) ?? new Date(0).toISOString(),
});

const pullOf = (row: Row): PullRecord => ({
  id: str(row.id),
  repositoryId: str(row.repositoryId),
  number: num(row.number),
  issueId: strOrNull(row.issueId),
  linkedBy: strOrNull(row.linkedBy),
  headBranch: str(row.headBranch),
  headSha: str(row.headSha),
  baseBranch: str(row.baseBranch),
  state: pullStateOf(row.state),
  draft: bool(row.draft),
  title: str(row.title),
  url: str(row.url),
  authorLogin: strOrNull(row.authorLogin),
  mergeability: mergeabilityValue(row.mergeability),
  hostMergeState: strOrNull(row.hostMergeState),
  ciState: ciStateValue(row.ciState),
  checks: checksOf(row.checks),
  mergeCommitSha: strOrNull(row.mergeCommitSha),
  mergedAt: iso(row.mergedAt),
  mergedById: strOrNull(row.mergedById),
  mergeForcedReason: strOrNull(row.mergeForcedReason),
  closedAt: iso(row.closedAt),
  snapshotAt: iso(row.snapshotAt),
  updatedAt: iso(row.updatedAt) ?? '',
});

const webUrlOf = (apiBaseUrl: string): string =>
  apiBaseUrl.replace(/\/+$/, '') === GITHUB_API_URL
    ? 'https://github.com'
    : apiBaseUrl.replace(/\/api(\/v3)?\/?$/u, '');

const normalizeUrl = (url: string): string =>
  url
    .trim()
    .replace(/\/+$/, '')
    .replace(/\.git$/, '')
    .toLowerCase();

/** A `DS-12`-style comment in Vietnamese, the language the application writes in (`.agents/rules/duongsinh-studio.md`). */
function mergedComment(pull: PullRecord, repo: string): string {
  return `Pull request ${repo}#${pull.number} đã được merge: ${pull.url}`;
}
function closedComment(pull: PullRecord, repo: string): string {
  return `Pull request ${repo}#${pull.number} đã bị đóng mà không merge: ${pull.url}`;
}

export interface GitServiceDeps {
  readonly database: Pick<DatabaseManager, 'connection' | 'transaction'>;
  readonly secrets: () => SecretsService;
  /** Null when the projects plugin is not assembled. */
  readonly projects: () => Projects | null;
  readonly onError?: (message: string, error: unknown) => void;
}

export type GitService = ReturnType<typeof createGitService>;

/**
 * Git hosting for Studio (S3 part 1): token connections to GitHub, repositories linked through them and attached to
 * projects, pull requests read from GitHub by polling, merged from Studio, and the linked issue moved to done when its
 * pull request merges.
 */
export function createGitService(deps: GitServiceDeps) {
  const conn = (): DatabaseConnection => deps.database.connection();
  const report =
    deps.onError ??
    ((message: string, error: unknown) => console.error(message, error));

  // Connections.

  const connectionRecord = async (id: string): Promise<ConnectionRecord> => {
    const row: Row | undefined = await conn()
      .query.selectFrom(CONNECTIONS)
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (!row)
      throw new GitError(
        'NOT_FOUND',
        'GIT_CONNECTION_NOT_FOUND',
        `Git connection ${id} does not exist.`,
        { id },
      );
    return connectionOf(row);
  };

  const usage = async (): Promise<Map<string, number>> => {
    const counts = new Map<string, number>();
    const rows: Row[] = await conn()
      .query.selectFrom(REPOSITORIES)
      .select(['connectionId'])
      .execute();
    for (const row of rows) {
      const id = str(row.connectionId);
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return counts;
  };

  const connectionView = (
    record: ConnectionRecord,
    usedBy: number,
  ): GitConnectionView => ({
    id: record.id,
    provider: 'github',
    kind: 'token',
    name: record.name,
    account: record.account,
    webUrl: webUrlOf(record.apiBaseUrl),
    apiBaseUrl: record.apiBaseUrl,
    hasToken: record.tokenSealed !== null,
    webhooks: false,
    personalMethods: [],
    allowPersonalTokens: false,
    problems: [],
    usedBy,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });

  const tokenOf = (record: ConnectionRecord): string => {
    if (!record.tokenSealed)
      throw new GitError(
        'FAILED_PRECONDITION',
        'GIT_CONNECTION_NO_TOKEN',
        `Git connection ${record.id} has no token.`,
      );
    const secrets = deps.secrets();
    if (!secrets.ready)
      throw new GitError(
        'UNAVAILABLE',
        'SECRETS_NOT_CONFIGURED',
        'The secrets keys are not configured.',
      );
    return secrets.open(record.tokenSealed, {
      purpose: TOKEN_SECRET_PURPOSE,
      aad: [record.id],
    });
  };

  const clientOf = (record: ConnectionRecord): GitHubClient =>
    createGitHubClient({
      token: tokenOf(record),
      apiBaseUrl: record.apiBaseUrl,
    });

  /** GitHub refusing a token or a repository, as a refusal people can act on; anything else is the host being away. */
  const hostError = (error: unknown, params: Record<string, string>) => {
    if (error instanceof GitError) return error;
    if (error instanceof GitHubError) {
      if (error.status === 401)
        return new GitError(
          'FAILED_PRECONDITION',
          'GIT_TOKEN_REJECTED',
          error.message,
          params,
        );
      if (error.status === 403 || error.status === 404)
        return new GitError(
          'FAILED_PRECONDITION',
          'GIT_REPOSITORY_UNREACHABLE',
          error.message,
          params,
        );
      return new GitError(
        'UNAVAILABLE',
        'GIT_HOST_UNAVAILABLE',
        error.message,
        params,
      );
    }
    return error;
  };

  async function listConnections(): Promise<GitConnectionView[]> {
    const counts = await usage();
    const rows: Row[] = await conn()
      .query.selectFrom(CONNECTIONS)
      .selectAll()
      .orderBy('createdAt', 'asc')
      .execute();
    return rows
      .map(connectionOf)
      .map((record) => connectionView(record, counts.get(record.id) ?? 0));
  }

  async function getConnection(id: string): Promise<GitConnectionView> {
    const record = await connectionRecord(id);
    return connectionView(record, (await usage()).get(id) ?? 0);
  }

  async function createConnection(input: {
    readonly name: string;
    readonly token: string;
    readonly apiBaseUrl?: string;
    readonly createdById: string;
  }): Promise<GitConnectionView> {
    const secrets = deps.secrets();
    if (!secrets.ready)
      throw new GitError(
        'UNAVAILABLE',
        'SECRETS_NOT_CONFIGURED',
        'The secrets keys are not configured.',
      );
    const apiBaseUrl = (input.apiBaseUrl ?? GITHUB_API_URL).replace(/\/+$/, '');
    let account: string;
    try {
      account = (
        await createGitHubClient({ token: input.token, apiBaseUrl }).viewer()
      ).login;
    } catch (error) {
      throw hostError(error, { name: input.name });
    }
    const id = randomUUID();
    const now = new Date();
    await conn()
      .query.insertInto(CONNECTIONS)
      .values({
        id,
        provider: 'github',
        kind: 'token',
        name: input.name,
        account: account || null,
        apiBaseUrl,
        tokenSealed: secrets.seal(input.token, {
          purpose: TOKEN_SECRET_PURPOSE,
          aad: [id],
        }),
        createdById: input.createdById,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    return getConnection(id);
  }

  async function deleteConnection(id: string): Promise<void> {
    await connectionRecord(id);
    if ((await usage()).get(id))
      throw new GitError(
        'FAILED_PRECONDITION',
        'GIT_CONNECTION_IN_USE',
        `Git connection ${id} still links repositories.`,
        { id },
      );
    await conn().query.deleteFrom(CONNECTIONS).where('id', '=', id).execute();
  }

  // Repositories.

  const repositoryRecord = async (
    id: string,
    connection: DatabaseConnection = conn(),
  ): Promise<RepositoryRecord> => {
    const row: Row | undefined = await connection.query
      .selectFrom(REPOSITORIES)
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (!row)
      throw new GitError(
        'NOT_FOUND',
        'GIT_REPOSITORY_NOT_FOUND',
        `Repository ${id} is not linked.`,
        { id },
      );
    return repositoryOf(row);
  };

  const projectLinks = async (
    repositoryIds: readonly string[],
    connection: DatabaseConnection = conn(),
  ): Promise<Map<string, { projectId: string; isPrimary: boolean }[]>> => {
    const links = new Map<
      string,
      { projectId: string; isPrimary: boolean }[]
    >();
    if (repositoryIds.length === 0) return links;
    const rows: Row[] = await connection.query
      .selectFrom(PROJECT_REPOSITORIES)
      .select(['repositoryId', 'projectId', 'isPrimary'])
      .where('repositoryId', 'in', [...repositoryIds])
      .execute();
    for (const row of rows) {
      const list = links.get(str(row.repositoryId)) ?? [];
      list.push({
        projectId: str(row.projectId),
        isPrimary: bool(row.isPrimary),
      });
      links.set(str(row.repositoryId), list);
    }
    return links;
  };

  const repositoryView = (
    record: RepositoryRecord,
    projects: { projectId: string; isPrimary: boolean }[],
  ): GitRepositoryView => ({
    id: record.id,
    connectionId: record.connectionId,
    provider: 'github',
    repo: record.fullName,
    cloneUrl: record.cloneUrl,
    webUrl: record.webUrl,
    defaultBranch: record.defaultBranch,
    branchPrefix: record.branchPrefix,
    checksSource: record.checksSource,
    requiredChecks: record.requiredChecks,
    pollSeconds: record.pollSeconds,
    polledAt: record.polledAt,
    pollError: record.pollError,
    projects,
  });

  async function listRepositories(): Promise<GitRepositoryView[]> {
    const rows: Row[] = await conn()
      .query.selectFrom(REPOSITORIES)
      .selectAll()
      .orderBy('fullName', 'asc')
      .execute();
    const records = rows.map(repositoryOf);
    const links = await projectLinks(records.map((record) => record.id));
    return records.map((record) =>
      repositoryView(record, links.get(record.id) ?? []),
    );
  }

  async function getRepository(id: string): Promise<GitRepositoryView> {
    const record = await repositoryRecord(id);
    return repositoryView(record, (await projectLinks([id])).get(id) ?? []);
  }

  async function linkRepository(input: {
    readonly connectionId: string;
    readonly fullName: string;
    readonly branchPrefix?: string;
    readonly requiredChecks?: readonly string[];
    readonly checksSource?: ChecksSource;
    readonly pollSeconds?: number;
  }): Promise<GitRepositoryView> {
    const connection = await connectionRecord(input.connectionId);
    const existing: Row | undefined = await conn()
      .query.selectFrom(REPOSITORIES)
      .select(['id'])
      .where('connectionId', '=', input.connectionId)
      .where('fullName', '=', input.fullName)
      .executeTakeFirst();
    if (existing)
      throw new GitError(
        'ALREADY_EXISTS',
        'GIT_REPOSITORY_LINKED',
        `${input.fullName} is linked already.`,
        { repo: input.fullName },
      );
    let hosted;
    try {
      hosted = await clientOf(connection).repository(input.fullName);
    } catch (error) {
      throw hostError(error, { repo: input.fullName });
    }
    if (!hosted.canPush)
      throw new GitError(
        'FAILED_PRECONDITION',
        'GIT_REPOSITORY_READ_ONLY',
        `The connection's token may not push to ${input.fullName}.`,
        { repo: input.fullName },
      );
    const id = randomUUID();
    const now = new Date();
    await conn()
      .query.insertInto(REPOSITORIES)
      .values({
        id,
        connectionId: connection.id,
        fullName: hosted.fullName,
        hostRepoId: hosted.id || null,
        cloneUrl: hosted.cloneUrl,
        webUrl: hosted.webUrl,
        defaultBranch: hosted.defaultBranch,
        branchPrefix: input.branchPrefix ?? 'agent/',
        checksSource: input.checksSource ?? 'host',
        requiredChecks: JSON.stringify(input.requiredChecks ?? []),
        pollSeconds: input.pollSeconds ?? 60,
        polledAt: null,
        pollError: null,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    return getRepository(id);
  }

  /**
   * Makes `repositoryId` one of the project's working directories (a `gitRepo` resource of the projects plugin, bound to
   * the repository, so runs check it out on the issue's branch) and records the link; `primary` (or the project's first
   * repository) becomes its primary one.
   */
  async function attachToProject(
    viewer: Viewer,
    projectId: string,
    repositoryId: string,
    primary: boolean,
  ): Promise<GitRepositoryView> {
    const projects = deps.projects();
    if (!projects)
      throw new GitError(
        'UNAVAILABLE',
        'PROJECTS_UNAVAILABLE',
        'The projects plugin is not assembled.',
      );
    const repository = await repositoryRecord(repositoryId);
    const links = (await projectLinks([repositoryId])).get(repositoryId) ?? [];
    if (links.some((link) => link.projectId === projectId))
      throw new GitError(
        'ALREADY_EXISTS',
        'GIT_REPOSITORY_ATTACHED',
        `${repository.fullName} is attached to project ${projectId} already.`,
        { repo: repository.fullName },
      );
    const resource = await projects.projects.addResource(viewer, projectId, {
      type: 'gitRepo',
      url: repository.cloneUrl,
      defaultRef: repository.defaultBranch,
      label: repository.fullName,
      binding: {
        provider: 'github',
        connectionId: repository.connectionId,
        repoId: repository.id,
        fullName: repository.fullName,
      },
    });
    await deps.database.transaction(async (tx) => {
      const others: Row[] = await tx.query
        .selectFrom(PROJECT_REPOSITORIES)
        .select(['id'])
        .where('projectId', '=', projectId)
        .execute();
      const isPrimary = primary || others.length === 0;
      if (isPrimary)
        await tx.query
          .updateTable(PROJECT_REPOSITORIES)
          .set({ isPrimary: false })
          .where('projectId', '=', projectId)
          .execute();
      await tx.query
        .insertInto(PROJECT_REPOSITORIES)
        .values({
          id: randomUUID(),
          projectId,
          repositoryId,
          resourceId: resource.id,
          isPrimary,
          createdAt: new Date(),
        })
        .execute();
    });
    return getRepository(repositoryId);
  }

  // Pull requests.

  const pullRecord = async (id: string): Promise<PullRecord> => {
    const row: Row | undefined = await conn()
      .query.selectFrom(PULL_REQUESTS)
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (!row)
      throw new GitError(
        'NOT_FOUND',
        'PULL_REQUEST_NOT_FOUND',
        `Pull request ${id} does not exist.`,
        { id },
      );
    return pullOf(row);
  };

  const pullView = (
    pull: PullRecord,
    repository: RepositoryRecord,
  ): GitPullRequestView => ({
    id: pull.id,
    repositoryId: pull.repositoryId,
    repo: repository.fullName,
    provider: 'github',
    number: pull.number,
    url: pull.url,
    title: pull.title,
    state: pull.state,
    draft: pull.draft,
    headRef: pull.headBranch,
    baseRef: pull.baseBranch,
    headSha: pull.headSha,
    mergeCommitSha: pull.mergeCommitSha,
    authorLogin: pull.authorLogin,
    mergeability: pull.mergeability,
    hostMergeState: pull.hostMergeState,
    ciState:
      pull.ciState === 'passed'
        ? 'success'
        : pull.ciState === 'failed'
          ? 'failure'
          : pull.ciState === 'pending'
            ? 'pending'
            : null,
    checks: pull.checks,
    issueId: pull.issueId,
    linkedBy: pull.linkedBy,
    mergedAt: pull.mergedAt,
    mergedBy: pull.mergedById ? { id: pull.mergedById } : null,
    mergeForcedReason: pull.mergeForcedReason,
    closedAt: pull.closedAt,
    snapshotAt: pull.snapshotAt,
    mergeBlocker: mergeBlockerOf({
      ...pull,
      checksSource: repository.checksSource,
    }),
    mergeInStudio: true,
    checksSource: repository.checksSource,
    updatedAt: pull.updatedAt,
  });

  async function listPullRequests(filter: {
    readonly issueId?: string;
    readonly repositoryId?: string;
  }): Promise<GitPullRequestView[]> {
    let query = conn().query.selectFrom(PULL_REQUESTS).selectAll();
    if (filter.issueId) query = query.where('issueId', '=', filter.issueId);
    if (filter.repositoryId)
      query = query.where('repositoryId', '=', filter.repositoryId);
    const rows: Row[] = await query
      .orderBy('updatedAt', 'desc')
      .limit(200)
      .execute();
    const repositories = new Map<string, RepositoryRecord>();
    const views: GitPullRequestView[] = [];
    for (const pull of rows.map(pullOf)) {
      let repository = repositories.get(pull.repositoryId);
      if (!repository) {
        repository = await repositoryRecord(pull.repositoryId);
        repositories.set(repository.id, repository);
      }
      views.push(pullView(pull, repository));
    }
    return views;
  }

  async function getPullRequest(id: string): Promise<GitPullRequestView> {
    const pull = await pullRecord(id);
    return pullView(pull, await repositoryRecord(pull.repositoryId));
  }

  /** The projects the repository is attached to, for linking and for who may read its pull requests. */
  async function projectsOf(repositoryId: string): Promise<string[]> {
    return ((await projectLinks([repositoryId])).get(repositoryId) ?? []).map(
      (link) => link.projectId,
    );
  }

  /** The issue a pull request names, among the issues of the repository's projects. */
  async function issueFor(
    repository: RepositoryRecord,
    pull: GitHubPull,
  ): Promise<{ id: string; by: 'branch' | 'title' } | null> {
    const projects = deps.projects();
    if (!projects) return null;
    const projectIds = await projectsOf(repository.id);
    for (const { key, by } of issueKeysOf(pull, repository.branchPrefix)) {
      const issue = await projects.issueContext.contextFor(conn(), key);
      if (issue?.project && projectIds.includes(issue.project.id))
        return { id: issue.id, by };
    }
    return null;
  }

  async function onMerged(
    pull: PullRecord,
    repository: RepositoryRecord,
    actor: Actor | undefined,
  ): Promise<void> {
    const projects = deps.projects();
    if (!projects || !pull.issueId) return;
    try {
      await projects.statusEvents.fire({
        event: PR_MERGED_EVENT,
        issueIds: [pull.issueId],
        ...(actor ? { actor } : {}),
        note: `${repository.fullName}#${pull.number}`,
        details: { pullRequestId: pull.id, url: pull.url },
      });
    } catch (error) {
      report(
        `Dương Sinh Studio could not move issue ${pull.issueId} for the merge of ${repository.fullName}#${pull.number}.`,
        error,
      );
    }
    await comment(
      pull,
      mergedComment(pull, repository.fullName),
      PR_MERGED_MESSAGE,
      repository,
    );
  }

  async function comment(
    pull: PullRecord,
    content: string,
    type: string,
    repository: RepositoryRecord,
  ): Promise<void> {
    const projects = deps.projects();
    if (!projects || !pull.issueId) return;
    try {
      await projects.comments.post(
        { type: 'system', id: null },
        pull.issueId,
        { content },
        {
          trigger: false,
          message: {
            type,
            params: {
              repo: repository.fullName,
              number: pull.number,
              url: pull.url,
            },
          },
          origin: { pullRequestId: pull.id },
        },
      );
    } catch (error) {
      report(
        `Dương Sinh Studio could not comment ${repository.fullName}#${pull.number} on issue ${pull.issueId}.`,
        error,
      );
    }
  }

  /**
   * Writes what GitHub says of one pull request. `checks` undefined keeps the stored checks (a closed pull request's
   * head is not read again). A pull request that becomes merged fires `ds.pr.merged` once, whoever saw it first: the
   * write that moves it to `merged` is guarded on the stored state.
   */
  async function store(
    repository: RepositoryRecord,
    hosted: GitHubPull,
    checks: readonly GitHubCheck[] | undefined,
    merge?: {
      readonly byUserId: string;
      readonly forcedReason: string | null;
      readonly sha: string | null;
    },
    /** The issue Studio opened the pull request for; kept over what branch and title name. */
    opened?: { readonly id: string; readonly by: string },
  ): Promise<PullRecord> {
    const existingRow: Row | undefined = await conn()
      .query.selectFrom(PULL_REQUESTS)
      .selectAll()
      .where('repositoryId', '=', repository.id)
      .where('number', '=', hosted.number)
      .executeTakeFirst();
    const existing = existingRow ? pullOf(existingRow) : null;
    const link = existing?.issueId
      ? { id: existing.issueId, by: existing.linkedBy ?? 'branch' }
      : (opened ?? (await issueFor(repository, hosted)));
    const merged = hosted.merged || merge !== undefined;
    const state: PullState = merged ? 'merged' : hosted.state;
    const now = new Date();
    const stored: StoredCheck[] | undefined = checks?.map((check) => ({
      kind: check.kind,
      name: check.name,
      status: check.status,
      conclusion: check.conclusion,
      outcome: check.outcome,
      url: check.url,
    }));
    const values = {
      issueId: link?.id ?? null,
      linkedBy: link?.by ?? null,
      headBranch: hosted.headRef,
      headSha: hosted.headSha,
      baseBranch: hosted.baseRef,
      state,
      draft: hosted.draft,
      title: hosted.title,
      url: hosted.url,
      authorLogin: hosted.authorLogin,
      mergeability:
        hosted.mergeableState === null && existing
          ? existing.mergeability
          : mergeabilityOf(hosted.mergeableState),
      hostMergeState: hosted.mergeableState ?? existing?.hostMergeState ?? null,
      ciState: stored
        ? ciStateOf(stored, repository.requiredChecks)
        : (existing?.ciState ?? 'missing'),
      checks: JSON.stringify(stored ?? existing?.checks ?? []),
      mergeCommitSha:
        merge?.sha ?? hosted.mergeCommitSha ?? existing?.mergeCommitSha ?? null,
      mergedAt: merged
        ? existing?.mergedAt
          ? new Date(existing.mergedAt)
          : hosted.mergedAt
            ? new Date(hosted.mergedAt)
            : now
        : null,
      mergedById: merge?.byUserId ?? existing?.mergedById ?? null,
      mergeForcedReason:
        merge?.forcedReason ?? existing?.mergeForcedReason ?? null,
      closedAt: hosted.closedAt
        ? new Date(hosted.closedAt)
        : merged
          ? now
          : null,
      snapshotAt: now,
      updatedAt: now,
    };
    let becameMerged: boolean;
    let id = existing?.id;
    if (existing) {
      let update = conn()
        .query.updateTable(PULL_REQUESTS)
        .set(values)
        .where('id', '=', existing.id);
      if (state === 'merged') update = update.where('state', '!=', 'merged');
      const result = await update.execute();
      becameMerged =
        state === 'merged' &&
        existing.state !== 'merged' &&
        (result.updatedCount ?? 1) > 0;
    } else {
      id = randomUUID();
      await conn()
        .query.insertInto(PULL_REQUESTS)
        .values({
          id,
          repositoryId: repository.id,
          number: hosted.number,
          createdAt: now,
          ...values,
        })
        .execute();
      // A pull request merged before the repository was linked is history, not news.
      becameMerged =
        state === 'merged' &&
        (merge !== undefined ||
          (values.mergedAt !== null &&
            values.mergedAt.getTime() >= Date.parse(repository.createdAt)));
    }
    const pull = await pullRecord(id ?? '');
    if (becameMerged)
      await onMerged(
        pull,
        repository,
        merge ? { type: 'user', id: merge.byUserId } : undefined,
      );
    else if (state === 'closed' && existing?.state === 'open')
      await comment(
        pull,
        closedComment(pull, repository.fullName),
        PR_CLOSED_MESSAGE,
        repository,
      );
    return pull;
  }

  /** Reads one pull request and its head's checks from GitHub now. */
  async function refreshPull(
    repository: RepositoryRecord,
    client: GitHubClient,
    number: number,
    opened?: { readonly id: string; readonly by: string },
  ): Promise<PullRecord> {
    const hosted = await client.pull(repository.fullName, number);
    const checks =
      hosted.state === 'open' && hosted.headSha
        ? await client.checks(repository.fullName, hosted.headSha)
        : undefined;
    return store(repository, hosted, checks, undefined, opened);
  }

  /** The repository a project's runs start in: the one attached as primary, else the first attached. */
  async function primaryRepositoryOf(
    projectId: string,
  ): Promise<RepositoryRecord | null> {
    const rows: Row[] = await conn()
      .query.selectFrom(PROJECT_REPOSITORIES)
      .select(['repositoryId', 'isPrimary', 'createdAt'])
      .where('projectId', '=', projectId)
      .orderBy('createdAt', 'asc')
      .execute();
    const chosen = rows.find((row) => bool(row.isPrimary)) ?? rows[0];
    return chosen ? repositoryRecord(str(chosen.repositoryId)) : null;
  }

  /**
   * Opens a pull request for an issue on the code host: from `head` (the issue's branch, `agent/<IDENTIFIER>`, as runs
   * check it out) to `base` (the repository's default branch) of the project's primary repository, or of
   * `repositoryId` when it serves the project too. An open pull request from that head is answered instead of a new
   * one, so a repeated call opens nothing. The pull request is stored and linked to the issue at once; nothing is
   * posted on the issue.
   */
  async function openPullRequest(input: {
    readonly issue: {
      readonly id: string;
      readonly identifier: string;
      readonly projectId: string | null;
    };
    readonly title: string;
    readonly body: string;
    readonly base?: string;
    readonly head?: string;
    readonly draft: boolean;
    readonly repositoryId?: string;
  }): Promise<GitPullRequestView & { readonly created: boolean }> {
    const { issue } = input;
    if (!issue.projectId)
      throw new GitError(
        'FAILED_PRECONDITION',
        'ISSUE_HAS_NO_REPOSITORY',
        `Issue ${issue.identifier} belongs to no project, so it has no repository.`,
        { issue: issue.identifier },
      );
    let repository: RepositoryRecord | null;
    if (input.repositoryId) {
      if (!(await projectsOf(input.repositoryId)).includes(issue.projectId))
        throw new GitError(
          'FAILED_PRECONDITION',
          'GIT_REPOSITORY_NOT_IN_PROJECT',
          `Repository ${input.repositoryId} does not serve the project of ${issue.identifier}.`,
          { issue: issue.identifier },
        );
      repository = await repositoryRecord(input.repositoryId);
    } else repository = await primaryRepositoryOf(issue.projectId);
    if (!repository)
      throw new GitError(
        'FAILED_PRECONDITION',
        'ISSUE_HAS_NO_REPOSITORY',
        `The project of ${issue.identifier} has no repository.`,
        { issue: issue.identifier },
      );
    const head = input.head ?? `${ISSUE_BRANCH_PREFIX}${issue.identifier}`;
    const opened = { id: issue.id, by: 'opened' };
    const fullName = repository.fullName;
    try {
      const client = clientOf(await connectionRecord(repository.connectionId));
      const [already] = await client.openPullsFrom(fullName, head);
      if (already)
        return {
          ...pullView(
            await refreshPull(repository, client, already.number, opened),
            repository,
          ),
          created: false,
        };
      let created: GitHubPull;
      try {
        created = await client.createPull(fullName, {
          title: input.title,
          head,
          base: input.base ?? repository.defaultBranch,
          body: input.body,
          draft: input.draft,
        });
      } catch (error) {
        if (error instanceof GitHubError && error.status === 422)
          throw new GitError(
            'FAILED_PRECONDITION',
            'PULL_REQUEST_REFUSED_BY_HOST',
            error.message,
            { repo: fullName, head },
          );
        throw error;
      }
      return {
        ...pullView(
          await refreshPull(repository, client, created.number, opened),
          repository,
        ),
        created: true,
      };
    } catch (error) {
      throw hostError(error, { repo: fullName });
    }
  }

  async function refreshPullRequest(id: string): Promise<GitPullRequestView> {
    const pull = await pullRecord(id);
    const repository = await repositoryRecord(pull.repositoryId);
    try {
      const client = clientOf(await connectionRecord(repository.connectionId));
      return pullView(
        await refreshPull(repository, client, pull.number),
        repository,
      );
    } catch (error) {
      throw hostError(error, { repo: repository.fullName });
    }
  }

  /**
   * Polls one repository: its open pull requests (each with its head's checks) and the recently closed ones whose state
   * Studio has not recorded yet. `polledAt` and `pollError` say how it went.
   */
  async function syncRepository(id: string): Promise<void> {
    const repository = await repositoryRecord(id);
    let pollError: string | null = null;
    try {
      const client = clientOf(await connectionRecord(repository.connectionId));
      for (const hosted of await client.pulls(
        repository.fullName,
        'open',
        OPEN_PULLS,
      ))
        await refreshPull(repository, client, hosted.number);
      for (const hosted of await client.pulls(
        repository.fullName,
        'closed',
        CLOSED_PULLS,
      )) {
        const row: Row | undefined = await conn()
          .query.selectFrom(PULL_REQUESTS)
          .select(['state'])
          .where('repositoryId', '=', repository.id)
          .where('number', '=', hosted.number)
          .executeTakeFirst();
        if (row && str(row.state) !== 'open') continue;
        if (!row && !hosted.merged) continue;
        await store(repository, hosted, undefined);
      }
    } catch (error) {
      pollError = error instanceof Error ? error.message : String(error);
    }
    await conn()
      .query.updateTable(REPOSITORIES)
      .set({ polledAt: new Date(), pollError, updatedAt: new Date() })
      .where('id', '=', repository.id)
      .execute();
  }

  /** Polls every repository whose `pollSeconds` have passed since it was last polled. */
  async function syncDue(now: Date = new Date()): Promise<void> {
    const rows: Row[] = await conn()
      .query.selectFrom(REPOSITORIES)
      .select(['id', 'pollSeconds', 'polledAt'])
      .execute();
    for (const row of rows) {
      const polledAt = iso(row.polledAt);
      if (
        polledAt &&
        Date.parse(polledAt) + num(row.pollSeconds, 60) * 1000 > now.getTime()
      )
        continue;
      try {
        await syncRepository(str(row.id));
      } catch (error) {
        report(
          `Dương Sinh Studio could not poll repository ${str(row.id)}.`,
          error,
        );
      }
    }
  }

  /**
   * Squash-merges a pull request on GitHub after reading it again. Refused with its `mergeBlocker`; `force` with a reason
   * ("Merge anyway") overrides the blockers of `FORCEABLE_BLOCKERS`, records the reason and says so on the pull request.
   */
  async function mergePullRequest(
    id: string,
    input: {
      readonly byUserId: string;
      readonly force: boolean;
      readonly reason: string | null;
    },
  ): Promise<GitPullRequestView> {
    const before = await pullRecord(id);
    const repository = await repositoryRecord(before.repositoryId);
    let client: GitHubClient;
    let pull: PullRecord;
    try {
      client = clientOf(await connectionRecord(repository.connectionId));
      pull = await refreshPull(repository, client, before.number);
    } catch (error) {
      throw hostError(error, { repo: repository.fullName });
    }
    const blocker = mergeBlockerOf({
      ...pull,
      checksSource: repository.checksSource,
    });
    const forced =
      blocker !== null && input.force && FORCEABLE_BLOCKERS.has(blocker);
    if (blocker && !forced)
      throw new GitError(
        'FAILED_PRECONDITION',
        'MERGE_BLOCKED',
        `${repository.fullName}#${pull.number} cannot be merged: ${blocker}.`,
        { blocker },
        { mergeBlocker: blocker, forceable: FORCEABLE_BLOCKERS.has(blocker) },
      );
    let sha: string | null;
    try {
      sha = (
        await client.merge(repository.fullName, pull.number, {
          sha: pull.headSha,
          title: `${pull.title} (#${pull.number})`,
        })
      ).sha;
    } catch (error) {
      if (
        error instanceof GitHubError &&
        (error.status === 405 || error.status === 409 || error.status === 422)
      )
        throw new GitError(
          'FAILED_PRECONDITION',
          'MERGE_REFUSED_BY_HOST',
          error.message,
          { repo: repository.fullName },
        );
      throw hostError(error, { repo: repository.fullName });
    }
    const reason = forced ? input.reason : null;
    if (forced && reason)
      try {
        await client.comment(
          repository.fullName,
          pull.number,
          `Đã merge từ Dương Sinh Studio dù chưa đủ điều kiện (${blocker}). Lý do: ${reason}`,
        );
      } catch (error) {
        report(
          `Dương Sinh Studio could not comment the forced merge on ${repository.fullName}#${pull.number}.`,
          error,
        );
      }
    const hosted: GitHubPull = {
      number: pull.number,
      title: pull.title,
      url: pull.url,
      state: 'closed',
      merged: true,
      draft: false,
      headRef: pull.headBranch,
      headSha: pull.headSha,
      baseRef: pull.baseBranch,
      mergeableState: pull.hostMergeState,
      mergedAt: new Date().toISOString(),
      mergeCommitSha: sha,
      closedAt: new Date().toISOString(),
      authorLogin: pull.authorLogin,
      updatedAt: new Date().toISOString(),
    };
    return pullView(
      await store(repository, hosted, undefined, {
        byUserId: input.byUserId,
        forcedReason: reason,
        sha,
      }),
      repository,
    );
  }

  // Runs: the repositories of an issue's project a run checks out, and the token they push with.

  /** The linked repositories of `projectId` among `urls`, each with its connection's token. */
  async function credentialsFor(
    connection: DatabaseConnection,
    projectId: string,
    urls: readonly string[],
  ): Promise<{ url: string; token: string; fullName: string }[]> {
    const rows: Row[] = await connection.query
      .selectFrom(PROJECT_REPOSITORIES)
      .innerJoin(
        REPOSITORIES,
        `${REPOSITORIES}.id`,
        `${PROJECT_REPOSITORIES}.repositoryId`,
      )
      .select([
        `${REPOSITORIES}.cloneUrl as cloneUrl`,
        `${REPOSITORIES}.connectionId as connectionId`,
        `${REPOSITORIES}.fullName as fullName`,
      ])
      .where(`${PROJECT_REPOSITORIES}.projectId`, '=', projectId)
      .execute();
    const found: { url: string; token: string; fullName: string }[] = [];
    for (const url of urls) {
      const row = rows.find(
        (candidate) =>
          normalizeUrl(str(candidate.cloneUrl)) === normalizeUrl(url),
      );
      if (!row) continue;
      const record: Row | undefined = await connection.query
        .selectFrom(CONNECTIONS)
        .selectAll()
        .where('id', '=', str(row.connectionId))
        .executeTakeFirst();
      if (!record) continue;
      found.push({
        url,
        fullName: str(row.fullName),
        token: tokenOf(connectionOf(record)),
      });
    }
    return found;
  }

  return {
    listConnections,
    getConnection,
    createConnection,
    deleteConnection,
    listRepositories,
    getRepository,
    linkRepository,
    attachToProject,
    projectsOf,
    listPullRequests,
    getPullRequest,
    refreshPullRequest,
    syncRepository,
    syncDue,
    mergePullRequest,
    openPullRequest,
    credentialsFor,
    credentialTtlMs: CREDENTIAL_TTL_MS,
  };
}
