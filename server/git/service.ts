import { randomBytes, randomUUID } from 'node:crypto';
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
  appJwt,
  appManifest,
  createGitHubAppApi,
  installationOf,
  manifestPostUrl,
  missingPermissions,
  verifySignature,
  webhookUrlOf,
  type AppInstallation,
} from './github-app.js';
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
/** The status event a pull request merge fires when the issue should continue in progress. */
export const PR_MERGED_CONTINUE_EVENT = 'ds.pr.merged.continue';
/** Comment messages (`projects.comments.post` `message.type`) a reader's page may word in its own language. */
export const PR_MERGED_MESSAGE = 'ds.pr.merged';
export const PR_CLOSED_MESSAGE = 'ds.pr.closed';
/** What seals a connection's token; `aad` is the connection id. */
export const TOKEN_SECRET_PURPOSE = 'duongsinh-studio/git-connection-token';
const PERSONAL_TOKEN_PURPOSE = 'duongsinh-studio/git-personal-token';
const REPORTED_CHECKS = 'dsReportedChecks';
const AUTHORIZATIONS = 'dsGitAuthorizations';
/** `linkedBy` of a pull request someone took off its issue: polling leaves it alone. */
const UNLINKED = 'unlinked';

export const CONNECTIONS = 'dsGitConnections';
export const REPOSITORIES = 'dsRepositories';
export const PROJECT_REPOSITORIES = 'dsProjectRepositories';
export const PULL_REQUESTS = 'dsPullRequests';
export const APPS = 'dsGitApps';
export const APP_MANIFESTS = 'dsGitAppManifests';
export const WEBHOOK_DELIVERIES = 'dsGitWebhookDeliveries';
/** What seals a GitHub App's private key and its webhook secret; `aad` is the connection id. */
export const APP_KEY_SECRET_PURPOSE = 'duongsinh-studio/github-app-private-key';
export const APP_WEBHOOK_SECRET_PURPOSE =
  'duongsinh-studio/github-app-webhook-secret';

/** How long a manifest sent to GitHub waits for the person to come back with its code. */
const MANIFEST_TTL_MS = 60 * 60 * 1000;
/** An installation token is minted again when less than this is left of it. */
const TOKEN_MARGIN_MS = 5 * 60 * 1000;
/** A connection whose webhook delivered within this long is pushed to: its repositories are polled only as a net. */
const WEBHOOK_FRESH_MS = 24 * 60 * 60 * 1000;
const WEBHOOK_POLL_SECONDS = 600;
/** How long a delivery id is remembered against GitHub redelivering it. */
const DELIVERY_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

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

/** A GitHub App connection's App, installation and webhook, as Settings → Git shows them. Never a key or a secret. */
export interface GitAppView {
  readonly appId: string;
  readonly slug: string;
  readonly htmlUrl: string;
  readonly ownerLogin: string | null;
  /** Where a person installs the App on an account and picks its repositories. */
  readonly installUrl: string;
  readonly installationId: string | null;
  readonly installationAccount: string | null;
  /** The installation's settings on GitHub, where its repositories and permissions change; null until installed. */
  readonly permissionsUrl: string | null;
  /** What Studio needs that the installation (else the App) does not grant, as `name:level`. */
  readonly missingPermissions: string[];
  readonly webhookUrl: string | null;
  readonly lastDeliveryAt: string | null;
  readonly lastEvent: string | null;
  readonly lastError: string | null;
}

export interface GitConnectionView {
  readonly id: string;
  readonly provider: 'github';
  readonly kind: 'token' | 'app';
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
  readonly app: GitAppView | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** What Studio answers when it starts making a GitHub App: where the browser posts `manifest` (a form field). */
export interface GitAppManifestStart {
  readonly connectionId: string;
  readonly postUrl: string;
  readonly manifest: Record<string, unknown>;
  readonly expiresAt: string;
}

export interface GitWebhookOutcome {
  readonly status: 202 | 200 | 400 | 401;
  readonly handled?: string;
  readonly duplicate?: boolean;
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
  readonly referenceChecks: string[];
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
  readonly autoCompleteDisabled: boolean;
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
  readonly kind: 'token' | 'app';
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
  readonly referenceChecks: string[];
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
  readonly autoCompleteDisabled: boolean;
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

interface AppRecord {
  readonly connectionId: string;
  readonly appId: string;
  readonly slug: string;
  readonly htmlUrl: string;
  readonly ownerLogin: string | null;
  readonly privateKeySealed: string;
  readonly webhookSecretSealed: string;
  readonly installationId: string | null;
  readonly installationAccount: string | null;
  readonly installationTargetType: string | null;
  readonly permissions: Record<string, string>;
  readonly lastDeliveryAt: string | null;
  readonly lastEvent: string | null;
  readonly lastError: string | null;
}

const permissionsValue = (value: unknown): Record<string, string> => {
  const parsed = json(value);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
    return {};
  return Object.fromEntries(
    Object.entries(parsed).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  );
};

const appOf = (row: Row): AppRecord => ({
  connectionId: str(row.connectionId),
  appId: str(row.appId),
  slug: str(row.slug),
  htmlUrl: str(row.htmlUrl),
  ownerLogin: strOrNull(row.ownerLogin),
  privateKeySealed: str(row.privateKeySealed),
  webhookSecretSealed: str(row.webhookSecretSealed),
  installationId: strOrNull(row.installationId),
  installationAccount: strOrNull(row.installationAccount),
  installationTargetType: strOrNull(row.installationTargetType),
  permissions: permissionsValue(row.permissions),
  lastDeliveryAt: iso(row.lastDeliveryAt),
  lastEvent: strOrNull(row.lastEvent),
  lastError: strOrNull(row.lastError),
});

const connectionOf = (row: Row): ConnectionRecord => ({
  id: str(row.id),
  kind: row.kind === 'app' ? 'app' : 'token',
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
  referenceChecks: strings(row.referenceChecks),
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
  autoCompleteDisabled: bool(row.autoCompleteDisabled),
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
  /**
   * Studio's public base (`https://studio.dsc.edu.vn/main`), from the application's configured public origin, never
   * from a request: GitHub App manifests point their webhook and redirects at it. Null when none is configured.
   */
  readonly publicBaseUrl?: () => string | null;
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
  /** Who hears of a tag pushed to a linked repository (releases), by repository id. */
  const tagListeners = new Set<(repositoryId: string) => Promise<void>>();
  /** Adds a listener for pushed tags; answers what removes it. */
  function onTagPush(
    listener: (repositoryId: string) => Promise<void>,
  ): () => void {
    tagListeners.add(listener);
    return () => {
      tagListeners.delete(listener);
    };
  }

  /** Who hears of pull request and workflow run deliveries of a linked repository (previews), with the payload. */
  const webhookListeners = new Set<
    (repositoryId: string, event: string, payload: Row) => Promise<void>
  >();
  /** Adds a listener for `pull_request` and `workflow_run` deliveries; answers what removes it. */
  function onWebhookEvent(
    listener: (
      repositoryId: string,
      event: string,
      payload: Row,
    ) => Promise<void>,
  ): () => void {
    webhookListeners.add(listener);
    return () => {
      webhookListeners.delete(listener);
    };
  }

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

  const appRecord = async (
    connectionId: string,
    connection: DatabaseConnection = conn(),
  ): Promise<AppRecord | null> => {
    const row: Row | undefined = await connection.query
      .selectFrom(APPS)
      .selectAll()
      .where('connectionId', '=', connectionId)
      .executeTakeFirst();
    return row ? appOf(row) : null;
  };

  const appView = (record: ConnectionRecord, app: AppRecord): GitAppView => {
    const web = webUrlOf(record.apiBaseUrl);
    const base = deps.publicBaseUrl?.() ?? null;
    return {
      appId: app.appId,
      slug: app.slug,
      htmlUrl: app.htmlUrl,
      ownerLogin: app.ownerLogin,
      installUrl: `${app.htmlUrl.replace(/\/+$/u, '')}/installations/new`,
      installationId: app.installationId,
      installationAccount: app.installationAccount,
      permissionsUrl: app.installationId
        ? app.installationTargetType === 'Organization' &&
          app.installationAccount
          ? `${web}/organizations/${encodeURIComponent(app.installationAccount)}/settings/installations/${app.installationId}`
          : `${web}/settings/installations/${app.installationId}`
        : null,
      missingPermissions: missingPermissions(app.permissions),
      webhookUrl: base ? webhookUrlOf(base, record.id) : null,
      lastDeliveryAt: app.lastDeliveryAt,
      lastEvent: app.lastEvent,
      lastError: app.lastError,
    };
  };

  const connectionView = (
    record: ConnectionRecord,
    usedBy: number,
    app: AppRecord | null,
  ): GitConnectionView => {
    const appInfo = record.kind === 'app' && app ? appView(record, app) : null;
    const problems: string[] = [];
    if (appInfo) {
      if (!appInfo.installationId) problems.push('appNotInstalled');
      if (appInfo.missingPermissions.length > 0)
        problems.push('appMissingPermissions');
      if (appInfo.lastError) problems.push('webhookFailing');
    }
    return {
      id: record.id,
      provider: 'github',
      kind: record.kind,
      name: record.name,
      account: record.account,
      webUrl: webUrlOf(record.apiBaseUrl),
      apiBaseUrl: record.apiBaseUrl,
      hasToken:
        record.kind === 'app'
          ? appInfo?.installationId != null
          : record.tokenSealed !== null,
      webhooks: appInfo?.installationId != null,
      personalMethods: [],
      allowPersonalTokens: false,
      problems,
      usedBy,
      app: appInfo,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  };

  const secretsReady = () => {
    const secrets = deps.secrets();
    if (!secrets.ready)
      throw new GitError(
        'UNAVAILABLE',
        'SECRETS_NOT_CONFIGURED',
        'The secrets keys are not configured.',
      );
    return secrets;
  };

  const openSealed = (
    sealed: string,
    purpose: string,
    connectionId: string,
  ): string => secretsReady().open(sealed, { purpose, aad: [connectionId] });

  /** Installation tokens by connection and repository (`*` for every repository of the installation). */
  const tokenCache = new Map<string, { token: string; expiresAt: number }>();
  const forgetTokens = (connectionId: string) => {
    for (const key of [...tokenCache.keys()])
      if (key.startsWith(`${connectionId}:`)) tokenCache.delete(key);
  };

  /**
   * An installation token of the App connection, limited to `fullName` when given: from the cache while more than five
   * minutes are left of it, else minted with the App's JWT. `refresh` mints a new one.
   */
  async function installationToken(
    record: ConnectionRecord,
    fullName: string | null,
    refresh = false,
  ): Promise<{ token: string; expiresAt: string }> {
    const key = `${record.id}:${fullName ?? '*'}`;
    const cached = tokenCache.get(key);
    if (!refresh && cached && cached.expiresAt - Date.now() > TOKEN_MARGIN_MS)
      return {
        token: cached.token,
        expiresAt: new Date(cached.expiresAt).toISOString(),
      };
    const app = await appRecord(record.id);
    if (!app)
      throw new GitError(
        'FAILED_PRECONDITION',
        'GIT_APP_NOT_FOUND',
        `Git connection ${record.id} has no GitHub App.`,
        { id: record.id },
      );
    if (!app.installationId)
      throw new GitError(
        'FAILED_PRECONDITION',
        'GIT_APP_NOT_INSTALLED',
        `The GitHub App of ${record.name} is not installed on any account yet.`,
        { name: record.name },
      );
    const jwt = appJwt(
      app.appId,
      openSealed(app.privateKeySealed, APP_KEY_SECRET_PURPOSE, record.id),
    );
    const minted = await createGitHubAppApi(
      record.apiBaseUrl,
    ).installationToken(
      jwt,
      app.installationId,
      fullName ? [fullName.split('/').pop() ?? fullName] : undefined,
    );
    tokenCache.set(key, {
      token: minted.token,
      expiresAt: Date.parse(minted.expiresAt),
    });
    return minted;
  }

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

  /** A GitHub client of the connection: its token, or for an App an installation token of every repository it reaches. */
  const clientOf = async (record: ConnectionRecord): Promise<GitHubClient> =>
    createGitHubClient({
      token:
        record.kind === 'app'
          ? (await installationToken(record, null)).token
          : tokenOf(record),
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
    const apps = new Map<string, AppRecord>();
    const appRows: Row[] = await conn()
      .query.selectFrom(APPS)
      .selectAll()
      .execute();
    for (const row of appRows) apps.set(str(row.connectionId), appOf(row));
    return rows
      .map(connectionOf)
      .map((record) =>
        connectionView(
          record,
          counts.get(record.id) ?? 0,
          apps.get(record.id) ?? null,
        ),
      );
  }

  async function getConnection(id: string): Promise<GitConnectionView> {
    const record = await connectionRecord(id);
    return connectionView(
      record,
      (await usage()).get(id) ?? 0,
      await appRecord(id),
    );
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
    await deps.database.transaction(async (tx) => {
      await tx.query.deleteFrom(APPS).where('connectionId', '=', id).execute();
      await tx.query.deleteFrom(CONNECTIONS).where('id', '=', id).execute();
    });
    forgetTokens(id);
  }

  // GitHub Apps: made from a manifest, installed on an account, pushing webhooks.

  const apiBaseOf = (apiBaseUrl?: string) =>
    (apiBaseUrl ?? GITHUB_API_URL).replace(/\/+$/u, '');

  /**
   * Starts making a GitHub App: keeps a one-time `state` for an hour and answers the manifest the browser posts to
   * GitHub, its webhook and redirects at Studio's public base. The connection's id is chosen now, as the webhook URL
   * names it.
   */
  async function startAppManifest(input: {
    readonly name: string;
    readonly organization?: string | null;
    readonly apiBaseUrl?: string;
    readonly createdById: string;
  }): Promise<GitAppManifestStart & { readonly state: string }> {
    const base = deps.publicBaseUrl?.() ?? null;
    if (!base)
      throw new GitError(
        'FAILED_PRECONDITION',
        'GIT_PUBLIC_URL_MISSING',
        'Studio has no public origin configured (APP_PUBLIC_ORIGIN), so GitHub could not call it back.',
      );
    secretsReady();
    const apiBaseUrl = apiBaseOf(input.apiBaseUrl);
    const connectionId = randomUUID();
    const state = randomBytes(24).toString('hex');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + MANIFEST_TTL_MS);
    await conn()
      .query.deleteFrom(APP_MANIFESTS)
      .where('expiresAt', '<', now)
      .execute();
    await conn()
      .query.insertInto(APP_MANIFESTS)
      .values({
        state,
        connectionId,
        name: input.name,
        organization: input.organization ?? null,
        apiBaseUrl,
        createdById: input.createdById,
        expiresAt,
        createdAt: now,
      })
      .execute();
    return {
      connectionId,
      state,
      postUrl: manifestPostUrl(
        webUrlOf(apiBaseUrl),
        state,
        input.organization ?? null,
      ),
      manifest: appManifest({ name: input.name, baseUrl: base, connectionId }),
      expiresAt: expiresAt.toISOString(),
    };
  }

  /**
   * Finishes making a GitHub App: the person who started it comes back from GitHub with `code` and `state`. The state
   * is used once; GitHub trades the code for the App's id, private key and webhook secret, which are sealed.
   */
  async function completeAppManifest(input: {
    readonly code: string;
    readonly state: string;
    readonly userId: string;
  }): Promise<GitConnectionView> {
    const secrets = secretsReady();
    const row: Row | undefined = await conn()
      .query.selectFrom(APP_MANIFESTS)
      .selectAll()
      .where('state', '=', input.state)
      .executeTakeFirst();
    const expired = (): GitError =>
      new GitError(
        'INVALID_ARGUMENT',
        'GIT_APP_MANIFEST_EXPIRED',
        'This GitHub App request is unknown, used or expired; start again from Settings → Git.',
      );
    if (!row) throw expired();
    const taken = await conn()
      .query.deleteFrom(APP_MANIFESTS)
      .where('state', '=', input.state)
      .execute();
    if ((taken.deletedCount ?? 1) === 0) throw expired();
    const expiresAt = iso(row.expiresAt);
    if (
      str(row.createdById) !== input.userId ||
      !expiresAt ||
      Date.parse(expiresAt) < Date.now()
    )
      throw expired();
    const connectionId = str(row.connectionId);
    const apiBaseUrl = str(row.apiBaseUrl) || GITHUB_API_URL;
    let converted;
    try {
      converted = await createGitHubAppApi(apiBaseUrl).convertManifest(
        input.code,
      );
    } catch (error) {
      throw hostError(error, { name: str(row.name) });
    }
    const now = new Date();
    await deps.database.transaction(async (tx) => {
      await tx.query
        .insertInto(CONNECTIONS)
        .values({
          id: connectionId,
          provider: 'github',
          kind: 'app',
          name: converted.name || str(row.name),
          account: converted.ownerLogin,
          apiBaseUrl,
          tokenSealed: null,
          createdById: input.userId,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
      await tx.query
        .insertInto(APPS)
        .values({
          connectionId,
          appId: converted.appId,
          slug: converted.slug,
          htmlUrl: converted.htmlUrl,
          ownerLogin: converted.ownerLogin,
          privateKeySealed: secrets.seal(converted.privateKey, {
            purpose: APP_KEY_SECRET_PURPOSE,
            aad: [connectionId],
          }),
          webhookSecretSealed: secrets.seal(converted.webhookSecret, {
            purpose: APP_WEBHOOK_SECRET_PURPOSE,
            aad: [connectionId],
          }),
          installationId: null,
          installationAccount: null,
          installationTargetType: null,
          permissions: JSON.stringify(converted.permissions),
          events: JSON.stringify(converted.events),
          lastDeliveryAt: null,
          lastEvent: null,
          lastError: null,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    });
    return getConnection(connectionId);
  }

  const writeInstallation = async (
    connectionId: string,
    installation: AppInstallation | null,
  ) => {
    await conn()
      .query.updateTable(APPS)
      .set({
        installationId: installation?.id ?? null,
        installationAccount: installation?.account ?? null,
        installationTargetType: installation?.targetType ?? null,
        ...(installation
          ? {
              permissions: JSON.stringify(installation.permissions),
              events: JSON.stringify(installation.events),
            }
          : {}),
        updatedAt: new Date(),
      })
      .where('connectionId', '=', connectionId)
      .execute();
    forgetTokens(connectionId);
  };

  /**
   * Records which installation the App connection acts through: `installationId` (GitHub's `installation_id` after a
   * person installed it), else the App's only installation. Reads its permissions again either way.
   */
  async function setInstallation(
    connectionId: string,
    installationId?: string,
  ): Promise<GitConnectionView> {
    const record = await connectionRecord(connectionId);
    const app = await appRecord(connectionId);
    if (record.kind !== 'app' || !app)
      throw new GitError(
        'FAILED_PRECONDITION',
        'GIT_APP_NOT_FOUND',
        `Git connection ${connectionId} has no GitHub App.`,
        { id: connectionId },
      );
    const api = createGitHubAppApi(record.apiBaseUrl);
    const jwt = appJwt(
      app.appId,
      openSealed(app.privateKeySealed, APP_KEY_SECRET_PURPOSE, connectionId),
    );
    let installation: AppInstallation;
    try {
      if (installationId)
        installation = await api.installation(jwt, installationId);
      else {
        const all = await api.installations(jwt);
        if (all.length === 0)
          throw new GitError(
            'FAILED_PRECONDITION',
            'GIT_APP_NOT_INSTALLED',
            `The GitHub App of ${record.name} is not installed on any account yet.`,
            { name: record.name },
          );
        if (all.length > 1)
          throw new GitError(
            'INVALID_ARGUMENT',
            'GIT_APP_INSTALLATION_AMBIGUOUS',
            `The GitHub App of ${record.name} is installed on several accounts; name the installation.`,
            { name: record.name },
          );
        installation = all[0];
      }
    } catch (error) {
      throw hostError(error, { name: record.name });
    }
    await writeInstallation(connectionId, installation);
    await conn()
      .query.updateTable(CONNECTIONS)
      .set({
        account: installation.account ?? record.account,
        updatedAt: new Date(),
      })
      .where('id', '=', connectionId)
      .execute();
    return getConnection(connectionId);
  }

  /** The stored open pull requests of `repositoryId` whose head is `sha`. */
  const pullNumbersAt = async (
    repositoryId: string,
    sha: string,
  ): Promise<number[]> => {
    const rows: Row[] = await conn()
      .query.selectFrom(PULL_REQUESTS)
      .select(['number'])
      .where('repositoryId', '=', repositoryId)
      .where('headSha', '=', sha)
      .where('state', '=', 'open')
      .execute();
    return rows.map((row) => num(row.number));
  };

  const numbersOf = (value: unknown): number[] =>
    Array.isArray(value)
      ? value
          .map((item) =>
            typeof item === 'object' && item !== null
              ? (item as Row).number
              : undefined,
          )
          .filter((number): number is number => typeof number === 'number')
      : [];

  /** What one delivery asks Studio to read again: the repository and its pull requests by number. */
  async function dispatchWebhook(
    record: ConnectionRecord,
    event: string,
    payload: Row,
  ): Promise<string> {
    const object = (key: string): Row => {
      const value = payload[key];
      return typeof value === 'object' && value !== null ? (value as Row) : {};
    };
    if (event === 'ping') return 'ping';
    if (event === 'installation') {
      const action = str(payload.action);
      if (action === 'deleted') await writeInstallation(record.id, null);
      else if (action !== 'suspend')
        await writeInstallation(
          record.id,
          installationOf(payload.installation),
        );
      return `installation.${action}`;
    }
    if (event === 'installation_repositories') {
      forgetTokens(record.id);
      return event;
    }
    // A pushed tag is for releases (S5.5); other pushes say nothing a pull request does not.
    if (event === 'push' && !str(payload.ref).startsWith('refs/tags/'))
      return 'push.ignored';
    const fullName = str(object('repository').full_name);
    const repositoryRow: Row | undefined = await conn()
      .query.selectFrom(REPOSITORIES)
      .selectAll()
      .where('connectionId', '=', record.id)
      .where('fullName', '=', fullName)
      .executeTakeFirst();
    if (!repositoryRow) return `${event}.unlinked`;
    const repository = repositoryOf(repositoryRow);
    if (event === 'push') {
      for (const listener of tagListeners) await listener(repository.id);
      return tagListeners.size > 0 ? 'push.tags' : 'push.ignored';
    }
    if (event === 'pull_request' || event === 'workflow_run')
      for (const listener of webhookListeners) {
        try {
          await listener(repository.id, event, payload);
        } catch (error) {
          report(
            `A ${event} listener failed for ${repository.fullName}`,
            error,
          );
        }
      }
    const numbers = new Set<number>();
    if (event === 'pull_request') {
      const number = num(object('pull_request').number, num(payload.number));
      if (number > 0) numbers.add(number);
    } else if (
      event === 'check_run' ||
      event === 'check_suite' ||
      event === 'workflow_run'
    ) {
      const subject = object(event);
      for (const number of numbersOf(subject.pull_requests))
        numbers.add(number);
      const sha = str(subject.head_sha);
      if (sha)
        for (const number of await pullNumbersAt(repository.id, sha))
          numbers.add(number);
    } else if (event === 'status') {
      const sha = str(payload.sha);
      if (sha)
        for (const number of await pullNumbersAt(repository.id, sha))
          numbers.add(number);
    } else return `${event}.ignored`;
    if (numbers.size === 0) return `${event}.nothing`;
    const client = await clientOf(record);
    for (const number of numbers) await refreshPull(repository, client, number);
    return `${event}.refreshed`;
  }

  /**
   * One webhook delivery of an App connection: refused (401) unless `X-Hub-Signature-256` is the HMAC of the raw body
   * with the App's webhook secret; a delivery id seen before is answered without being handled again. What it names is
   * read again from GitHub now; a failure is recorded on the connection (the poll is the net) and still answered 202, as
   * GitHub would only deliver the same again.
   */
  async function handleWebhook(input: {
    readonly connectionId: string;
    readonly event: string | null;
    readonly deliveryId: string | null;
    readonly signature: string | null;
    readonly body: Uint8Array;
  }): Promise<GitWebhookOutcome> {
    const row: Row | undefined = await conn()
      .query.selectFrom(CONNECTIONS)
      .selectAll()
      .where('id', '=', input.connectionId)
      .executeTakeFirst();
    const app = row ? await appRecord(input.connectionId) : null;
    if (!row || !app) return { status: 401 };
    const secret = openSealed(
      app.webhookSecretSealed,
      APP_WEBHOOK_SECRET_PURPOSE,
      input.connectionId,
    );
    if (!verifySignature(secret, input.body, input.signature))
      return { status: 401 };
    if (!input.deliveryId || !input.event) return { status: 400 };
    const seen: Row | undefined = await conn()
      .query.selectFrom(WEBHOOK_DELIVERIES)
      .select(['id'])
      .where('id', '=', input.deliveryId)
      .executeTakeFirst();
    if (seen) return { status: 200, duplicate: true };
    try {
      await conn()
        .query.insertInto(WEBHOOK_DELIVERIES)
        .values({
          id: input.deliveryId,
          connectionId: input.connectionId,
          event: input.event,
          receivedAt: new Date(),
        })
        .execute();
    } catch {
      // Two copies of one delivery at once: the other is handling it.
      return { status: 200, duplicate: true };
    }
    let payload: Row;
    try {
      const parsed: unknown = JSON.parse(
        Buffer.from(input.body).toString('utf8'),
      );
      payload =
        typeof parsed === 'object' && parsed !== null ? (parsed as Row) : {};
    } catch {
      return { status: 400 };
    }
    let handled = input.event;
    let lastError: string | null = null;
    try {
      handled = await dispatchWebhook(connectionOf(row), input.event, payload);
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      report(
        `Dương Sinh Studio could not handle the ${input.event} delivery ${input.deliveryId}.`,
        error,
      );
    }
    await conn()
      .query.updateTable(APPS)
      .set({
        lastDeliveryAt: new Date(),
        lastEvent: input.event,
        lastError,
        updatedAt: new Date(),
      })
      .where('connectionId', '=', input.connectionId)
      .execute();
    return { status: 202, handled };
  }

  /** Forgets delivery ids older than a week. */
  async function pruneDeliveries(now: Date = new Date()): Promise<void> {
    await conn()
      .query.deleteFrom(WEBHOOK_DELIVERIES)
      .where('receivedAt', '<', new Date(now.getTime() - DELIVERY_RETENTION_MS))
      .execute();
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
    referenceChecks: record.referenceChecks,
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

  /**
   * A fresh installation token of the repository's App connection, limited to that repository (an hour), for a
   * preview's setup to read the repository and its workflow artifacts. A token connection has none to give.
   */
  async function repositoryToken(
    id: string,
  ): Promise<{ token: string; expiresAt: string; fullName: string }> {
    const record = await repositoryRecord(id);
    const minted = await installationToken(
      await connectionRecord(record.connectionId),
      record.fullName,
      true,
    );
    return { ...minted, fullName: record.fullName };
  }

  /** A GitHub client with the token of the repository's connection, for reads other modules make (project memory). */
  async function clientForRepository(id: string): Promise<GitHubClient> {
    const record = await repositoryRecord(id);
    return clientOf(await connectionRecord(record.connectionId));
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
      hosted = await (await clientOf(connection)).repository(input.fullName);
    } catch (error) {
      throw hostError(error, { repo: input.fullName });
    }
    // An installation token's repository answer carries no `permissions`: what an App may do is its installation's
    // permissions, which Settings → Git lists as missing ones.
    if (connection.kind === 'token' && !hosted.canPush)
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
    autoCompleteDisabled: pull.autoCompleteDisabled,
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

  async function listPullRequests(
    filter: {
      readonly issueId?: string;
      readonly issueIds?: readonly string[];
      readonly repositoryId?: string;
    } = {},
  ): Promise<GitPullRequestView[]> {
    let query = conn().query.selectFrom(PULL_REQUESTS).selectAll();
    if (filter.issueId) query = query.where('issueId', '=', filter.issueId);
    if (filter.issueIds)
      query = query.where('issueId', 'in', [...filter.issueIds]);
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

  /**
   * What decides whether a finished stage's pull request may be merged by Studio, and hears of it when it is: the
   * autopilot (`server/autopilot/evaluator.ts`) sets it at boot. Without one, nothing is merged by itself.
   */
  let stageMergePolicy: {
    readonly allow: (input: {
      readonly issueId: string;
      readonly pullRequestId: string;
    }) => Promise<boolean>;
    readonly merged: (input: {
      readonly issueId: string;
      readonly pullRequestId: string;
      readonly number: number;
      readonly repo: string;
    }) => Promise<void>;
  } | null = null;

  /** Pull requests Studio is merging for a finished stage now; read by `onMerged`, which completes the stage issue. */
  const stageMerges = new Set<string>();

  /**
   * Merges the pull request of a finished stage by itself, so the work goes on to the next stage without waiting for a
   * person. Only a stage issue (a sub-issue with a stage) that has been handed over (In review) qualifies, and only
   * when the pull request could be merged without forcing: not a draft, no conflict and every required check passed.
   * The project's autopilot settings have the last word (`stageMergePolicy`). Anything else, and any refusal from the
   * host, leaves the pull request for a person, as before. It merges as the issue's owner. The pull request's own "complete when merged" switch (off by default) is not consulted: it decides
   * whether a merge completes an issue that is not a stage, while a stage always ends with its merge.
   */
  async function autoMergeStage(
    pull: PullRecord,
    repository: RepositoryRecord,
  ): Promise<void> {
    if (
      !stageMergePolicy ||
      !pull.issueId ||
      pull.state !== 'open' ||
      pull.draft ||
      stageMerges.has(pull.id)
    )
      return;
    if (
      mergeBlockerOf({ ...pull, checksSource: repository.checksSource }) !==
      null
    )
      return;
    stageMerges.add(pull.id);
    try {
      const issue: Row | undefined = await conn()
        .query.selectFrom('pmIssues')
        .select(['statusKey', 'stage', 'parentIssueId', 'ownerUserId'])
        .where('id', '=', pull.issueId)
        .executeTakeFirst();
      if (
        !issue ||
        issue.stage === null ||
        issue.stage === undefined ||
        !issue.parentIssueId ||
        issue.statusKey !== 'in_review' ||
        !issue.ownerUserId
      )
        return;
      // The project's say: switched off, paused (emergency stop), over its daily limit, or touching sensitive paths.
      if (
        !(await stageMergePolicy.allow({
          issueId: pull.issueId,
          pullRequestId: pull.id,
        }))
      )
        return;
      await mergePullRequest(pull.id, {
        byUserId: str(issue.ownerUserId),
        force: false,
        reason: null,
      });
      await stageMergePolicy.merged({
        issueId: pull.issueId,
        pullRequestId: pull.id,
        number: pull.number,
        repo: repository.fullName,
      });
    } catch (error) {
      report(
        `Dương Sinh Studio could not merge the pull request of a finished stage (${repository.fullName}#${pull.number}); it waits for a person.`,
        error,
      );
    } finally {
      stageMerges.delete(pull.id);
    }
  }

  async function onMerged(
    pull: PullRecord,
    repository: RepositoryRecord,
    actor: Actor | undefined,
  ): Promise<void> {
    const projects = deps.projects();
    if (!projects || !pull.issueId) return;

    let shouldComplete = stageMerges.has(pull.id) || !pull.autoCompleteDisabled;

    // Check issue-level flag from dsAutopilotIssueFlags if available. A stage Studio merged by itself (`autoMergeStage`)
    // is the exception: its stage issue is done with its merge so the next stage can start, whatever the flag says; the
    // flag keeps meaning "a merge completes the issue" for an issue that is not one stage of a larger one.
    if (shouldComplete && !stageMerges.has(pull.id)) {
      try {
        const flagRow = await conn()
          .query.selectFrom('dsAutopilotIssueFlags')
          .selectAll()
          .where('issueId', '=', pull.issueId)
          .executeTakeFirst<Row>();
        if (
          flagRow &&
          'autoCompleteOnMerge' in flagRow &&
          !bool(flagRow.autoCompleteOnMerge)
        ) {
          shouldComplete = false;
        }
      } catch {
        // Table or column may not exist in early tests
      }
    }

    // Check if there are other open pull requests linked to this issue
    if (shouldComplete) {
      const allPulls = await listPullRequests({ issueId: pull.issueId });
      const otherOpenPulls = allPulls.filter(
        (p) => p.id !== pull.id && p.state === 'open',
      );
      if (otherOpenPulls.length > 0) {
        shouldComplete = false;
      }
    }

    try {
      if (shouldComplete) {
        await projects.statusEvents.fire({
          event: PR_MERGED_EVENT,
          issueIds: [pull.issueId],
          ...(actor ? { actor } : {}),
          note: `${repository.fullName}#${pull.number}`,
          details: { pullRequestId: pull.id, url: pull.url },
        });
      } else {
        await projects.statusEvents.fire({
          event: PR_MERGED_CONTINUE_EVENT,
          issueIds: [pull.issueId],
          ...(actor ? { actor } : {}),
          note: `${repository.fullName}#${pull.number}`,
          details: { pullRequestId: pull.id, url: pull.url },
        });
      }
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
      : existing?.linkedBy === UNLINKED
        ? { id: null, by: UNLINKED }
        : (opened ?? (await issueFor(repository, hosted)));
    const merged = hosted.merged || merge !== undefined;
    const state: PullState = merged ? 'merged' : hosted.state;
    const now = new Date();
    // Where checks are reported rather than read from the host, the reports are the checks.
    const stored: StoredCheck[] | undefined =
      repository.checksSource !== 'host'
        ? await reportedAsChecks(repository.id, hosted.headSha)
        : checks?.map((check) => ({
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
        ? ciStateOf(
            stored,
            repository.requiredChecks,
            repository.referenceChecks,
          )
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
          autoCompleteDisabled: true,
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
    else if (state === 'open') await autoMergeStage(pull, repository);
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
    let checks: readonly GitHubCheck[] | undefined;
    if (hosted.state === 'open' && hosted.headSha) {
      try {
        checks = await client.checks(repository.fullName, hosted.headSha);
      } catch (error) {
        // A token without "Checks: Read" (or "Commit statuses: Read") gets 403 here. The pull request is still stored
        // and linked; its CI reads as missing, so merging is blocked with `ciMissing` until the token can read checks.
        if (
          !(error instanceof GitHubError) ||
          (error.status !== 403 && error.status !== 404)
        )
          throw error;
        report(
          `Checks of ${repository.fullName}#${number} are unreadable with this connection's token; grant it Checks and Commit statuses read access.`,
          error,
        );
      }
    }
    return store(repository, hosted, checks, undefined, opened);
  }

  /** The latest report of each name on a commit, as the checks of its pull requests. */
  async function reportedAsChecks(
    repositoryId: string,
    sha: string,
  ): Promise<StoredCheck[]> {
    const rows: Row[] = await conn()
      .query.selectFrom(REPORTED_CHECKS)
      .selectAll()
      .where('repositoryId', '=', repositoryId)
      .where('sha', '=', sha)
      .orderBy('name')
      .execute();
    return rows.map((row) => {
      const status = str(row.status);
      return {
        kind: 'checkRun' as const,
        name: str(row.name),
        status: status === 'pending' ? 'in_progress' : 'completed',
        conclusion: status === 'pending' ? null : status,
        outcome:
          status === 'success'
            ? ('success' as const)
            : status === 'failure'
              ? ('failure' as const)
              : ('pending' as const),
        url: strOrNull(row.url),
      };
    });
  }

  /**
   * Records a report and applies it to the open pull requests at that commit; the latest report of a name on a commit
   * replaces the one before.
   */
  async function reportCheck(input: {
    readonly repositoryId: string;
    readonly sha: string;
    readonly name: string;
    readonly status: 'pending' | 'success' | 'failure';
    readonly source: 'ci' | 'agent';
    readonly url: string | null;
    readonly summary: string | null;
    readonly runId: string | null;
  }) {
    const repository = await repositoryRecord(input.repositoryId);
    const now = new Date();
    await deps.database.transaction(async (tx) => {
      await tx.query
        .deleteFrom(REPORTED_CHECKS)
        .where('repositoryId', '=', input.repositoryId)
        .where('sha', '=', input.sha)
        .where('name', '=', input.name)
        .execute();
      await tx.query
        .insertInto(REPORTED_CHECKS)
        .values({ id: randomUUID(), ...input, reportedAt: now })
        .execute();
    });
    const checks = await reportedAsChecks(input.repositoryId, input.sha);
    const rows: Row[] = await conn()
      .query.selectFrom(PULL_REQUESTS)
      .select(['id', 'number'])
      .where('repositoryId', '=', input.repositoryId)
      .where('headSha', '=', input.sha)
      .where('state', '=', 'open')
      .execute();
    if (rows.length > 0)
      await conn()
        .query.updateTable(PULL_REQUESTS)
        .set({
          checks: JSON.stringify(checks),
          ciState: ciStateOf(
            checks,
            repository.requiredChecks,
            repository.referenceChecks,
          ),
          updatedAt: now,
        })
        .where(
          'id',
          'in',
          rows.map((row) => str(row.id)),
        )
        .execute();
    return {
      repo: repository.fullName,
      sha: input.sha,
      name: input.name,
      status: input.status,
      source: input.source,
      url: input.url,
      summary: input.summary,
      runId: input.runId,
      reportedAt: now.toISOString(),
      pullRequests: rows.map((row) => ({
        repo: repository.fullName,
        number: num(row.number),
      })),
    };
  }

  /** The commit a source reported on last, with each check's latest report. */
  async function reportedChecksOf(
    repositoryId: string,
    source: 'ci' | 'agent' | null,
  ) {
    const repository = await repositoryRecord(repositoryId);
    const wanted =
      source ??
      (repository.checksSource === 'external'
        ? 'ci'
        : repository.checksSource === 'agent'
          ? 'agent'
          : null);
    const empty = { source: null, sha: null, lastReportAt: null, checks: [] };
    if (!wanted) return empty;
    const latest: Row | undefined = await conn()
      .query.selectFrom(REPORTED_CHECKS)
      .select(['sha', 'reportedAt'])
      .where('repositoryId', '=', repositoryId)
      .where('source', '=', wanted)
      .orderBy('reportedAt', 'desc')
      .limit(1)
      .executeTakeFirst();
    if (!latest) return empty;
    const rows: Row[] = await conn()
      .query.selectFrom(REPORTED_CHECKS)
      .selectAll()
      .where('repositoryId', '=', repositoryId)
      .where('source', '=', wanted)
      .where('sha', '=', str(latest.sha))
      .orderBy('name')
      .execute();
    return {
      source: wanted,
      sha: str(latest.sha),
      lastReportAt: iso(latest.reportedAt),
      checks: rows.map((row) => ({
        name: str(row.name),
        status: str(row.status) as 'pending' | 'success' | 'failure',
        url: strOrNull(row.url),
        reportedAt: iso(row.reportedAt) ?? '',
      })),
    };
  }

  /** The commit a report or a question names: a pull request's head, a SHA, or a branch's head on the host. */
  async function resolveCommit(
    repositoryId: string,
    ref: {
      readonly changeRequest?: number;
      readonly sha?: string;
      readonly branch?: string;
    },
  ): Promise<string | null> {
    const repository = await repositoryRecord(repositoryId);
    if (ref.changeRequest !== undefined) {
      const row: Row | undefined = await conn()
        .query.selectFrom(PULL_REQUESTS)
        .select(['headSha'])
        .where('repositoryId', '=', repositoryId)
        .where('number', '=', ref.changeRequest)
        .executeTakeFirst();
      return row ? str(row.headSha) : null;
    }
    if (ref.sha) return ref.sha;
    if (!ref.branch) return null;
    try {
      const client = await clientOf(
        await connectionRecord(repository.connectionId),
      );
      return await client.branchHead(repository.fullName, ref.branch);
    } catch (error) {
      throw hostError(error, { repo: repository.fullName });
    }
  }

  /** A commit's checks now: reported ones where the repository's source says so, else the host's. */
  async function commitChecks(repositoryId: string, sha: string) {
    const repository = await repositoryRecord(repositoryId);
    const reference = new Set(repository.referenceChecks);
    if (repository.checksSource !== 'host') {
      const checks = await reportedAsChecks(repositoryId, sha);
      const state = ciStateOf(
        checks,
        repository.requiredChecks,
        repository.referenceChecks,
      );
      return {
        sha,
        state:
          state === 'passed'
            ? ('success' as const)
            : state === 'failed'
              ? ('failure' as const)
              : state === 'pending'
                ? ('pending' as const)
                : ('none' as const),
        checks: checks.map((check) => ({
          kind: check.kind,
          name: check.name,
          status: check.status,
          conclusion: check.conclusion,
          url: check.url,
          source:
            repository.checksSource === 'external'
              ? ('ci' as const)
              : ('agent' as const),
          reference: reference.has(check.name),
        })),
      };
    }
    try {
      const client = await clientOf(
        await connectionRecord(repository.connectionId),
      );
      const checks = await client.checks(repository.fullName, sha);
      const state = ciStateOf(
        checks,
        repository.requiredChecks,
        repository.referenceChecks,
      );
      return {
        sha,
        state:
          state === 'passed'
            ? ('success' as const)
            : state === 'failed'
              ? ('failure' as const)
              : state === 'pending'
                ? ('pending' as const)
                : ('none' as const),
        checks: checks.map((check) => ({
          kind: check.kind,
          name: check.name,
          status: check.status,
          conclusion: check.conclusion,
          url: check.url,
          reference: reference.has(check.name),
        })),
      };
    } catch (error) {
      throw hostError(error, { repo: repository.fullName });
    }
  }

  /** What a project manager may change on a repository; a field left out stays. */
  async function updateRepository(
    id: string,
    input: {
      readonly checksSource?: ChecksSource;
      readonly referenceChecks?: readonly string[];
      readonly branchPrefix?: string;
    },
  ): Promise<GitRepositoryView> {
    await repositoryRecord(id);
    await conn()
      .query.updateTable(REPOSITORIES)
      .set({
        ...(input.checksSource ? { checksSource: input.checksSource } : {}),
        ...(input.referenceChecks
          ? { referenceChecks: JSON.stringify(input.referenceChecks) }
          : {}),
        ...(input.branchPrefix ? { branchPrefix: input.branchPrefix } : {}),
        updatedAt: new Date(),
      })
      .where('id', '=', id)
      .execute();
    return getRepository(id);
  }

  async function setAutoComplete(
    id: string,
    disabled: boolean,
  ): Promise<GitPullRequestView> {
    await pullRecord(id);
    await conn()
      .query.updateTable(PULL_REQUESTS)
      .set({ autoCompleteDisabled: disabled, updatedAt: new Date() })
      .where('id', '=', id)
      .execute();
    return getPullRequest(id);
  }

  /** Takes a pull request off its issue; polling does not link it back. */
  async function unlinkPullRequest(id: string): Promise<void> {
    await pullRecord(id);
    await conn()
      .query.updateTable(PULL_REQUESTS)
      .set({ issueId: null, linkedBy: UNLINKED, updatedAt: new Date() })
      .where('id', '=', id)
      .execute();
  }

  /** Records a pull request merged without asking the host, as for one merged outside it. */
  async function markMerged(
    id: string,
    byUserId: string,
  ): Promise<GitPullRequestView> {
    const before = await pullRecord(id);
    if (before.state === 'merged') return getPullRequest(id);
    const repository = await repositoryRecord(before.repositoryId);
    const now = new Date();
    await conn()
      .query.updateTable(PULL_REQUESTS)
      .set({
        state: 'merged',
        mergedAt: now,
        mergedById: byUserId,
        closedAt: now,
        updatedAt: now,
      })
      .where('id', '=', id)
      .execute();
    await onMerged(await pullRecord(id), repository, {
      type: 'user',
      id: byUserId,
    });
    return getPullRequest(id);
  }

  /** Which linked repositories go through a connection, with their projects. */
  async function connectionUsage(connectionId: string) {
    await connectionRecord(connectionId);
    return (await listRepositories()).filter(
      (repository) => repository.connectionId === connectionId,
    );
  }

  /** Renames a connection or replaces its token; a field left out stays. */
  async function updateConnection(
    id: string,
    input: { readonly name?: string; readonly token?: string },
  ): Promise<GitConnectionView> {
    const record = await connectionRecord(id);
    if (input.token !== undefined && record.kind !== 'token')
      throw new GitError(
        'FAILED_PRECONDITION',
        'GIT_CONNECTION_NOT_TOKEN',
        'Only a token connection has a token to replace.',
      );
    let account: string | undefined;
    if (input.token !== undefined)
      try {
        account = (
          await createGitHubClient({
            token: input.token,
            apiBaseUrl: record.apiBaseUrl,
          }).viewer()
        ).login;
      } catch (error) {
        throw hostError(error, {});
      }
    await conn()
      .query.updateTable(CONNECTIONS)
      .set({
        ...(input.name ? { name: input.name } : {}),
        ...(input.token !== undefined
          ? {
              account: account || null,
              tokenSealed: deps.secrets().seal(input.token, {
                purpose: TOKEN_SECRET_PURPOSE,
                aad: [id],
              }),
            }
          : {}),
        updatedAt: new Date(),
      })
      .where('id', '=', id)
      .execute();
    return getConnection(id);
  }

  /** People's own host tokens: never read back, kept so their work can be attributed to them. */
  async function listAuthorizations(userId: string) {
    const rows: Row[] = await conn()
      .query.selectFrom(AUTHORIZATIONS)
      .selectAll()
      .where('userId', '=', userId)
      .execute();
    return { connections: await listConnections(), rows };
  }

  async function useToken(
    userId: string,
    connectionId: string,
    token: string,
  ): Promise<{ login: string; connectedAt: string }> {
    const record = await connectionRecord(connectionId);
    let login: string;
    try {
      login = (
        await createGitHubClient({
          token,
          apiBaseUrl: record.apiBaseUrl,
        }).viewer()
      ).login;
    } catch (error) {
      throw hostError(error, {});
    }
    const now = new Date();
    await deps.database.transaction(async (tx) => {
      await tx.query
        .deleteFrom(AUTHORIZATIONS)
        .where('userId', '=', userId)
        .where('connectionId', '=', connectionId)
        .execute();
      await tx.query
        .insertInto(AUTHORIZATIONS)
        .values({
          userId,
          connectionId,
          tokenSealed: deps.secrets().seal(token, {
            purpose: PERSONAL_TOKEN_PURPOSE,
            aad: [userId, connectionId],
          }),
          login,
          method: 'token',
          connectedAt: now,
        })
        .execute();
    });
    return { login, connectedAt: now.toISOString() };
  }

  /** The caller's own token on a connection, or null when they have connected none. */
  const personalClient = async (
    userId: string,
    record: ConnectionRecord,
  ): Promise<GitHubClient | null> => {
    const row: Row | undefined = await conn()
      .query.selectFrom(AUTHORIZATIONS)
      .select(['tokenSealed'])
      .where('userId', '=', userId)
      .where('connectionId', '=', record.id)
      .executeTakeFirst();
    if (!row) return null;
    return createGitHubClient({
      token: deps.secrets().open(str(row.tokenSealed), {
        purpose: PERSONAL_TOKEN_PURPOSE,
        aad: [userId, record.id],
      }),
      apiBaseUrl: record.apiBaseUrl,
    });
  };

  /**
   * Creates a file in a repository with the caller's own token, and only that: a path under `.github/workflows` needs the
   * `workflows` permission, which the App is not given, so no installation token may ever write one.
   */
  /** The caller's own client: a token connection is already a person's token; an App connection is not, so it needs theirs. */
  async function ownClient(
    userId: string,
    record: ConnectionRecord,
  ): Promise<GitHubClient> {
    const client =
      (await personalClient(userId, record)) ??
      (record.kind === 'token' ? await clientOf(record) : null);
    if (!client)
      throw new GitError(
        'FAILED_PRECONDITION',
        'GIT_PERSONAL_TOKEN_REQUIRED',
        'Writing a workflow file needs your own GitHub token: connect it with `git authorization use-token`.',
      );
    return client;
  }

  async function writeFileAsPerson(
    userId: string,
    connectionId: string,
    fullName: string,
    input: {
      readonly path: string;
      readonly content: string;
      readonly message: string;
      readonly branch: string;
    },
  ): Promise<void> {
    const client = await ownClient(
      userId,
      await connectionRecord(connectionId),
    );
    try {
      await client.putFile(fullName, input);
    } catch (error) {
      throw hostError(error, { repo: fullName });
    }
  }

  /**
   * Proposes a file through a pull request instead of writing it to the default branch, so a protected branch accepts it and
   * a person reviews it: a branch off `base`, one commit with the file, and the pull request. The caller's own token does
   * all of it. Nothing is changed on `base`.
   */
  async function proposeFileAsPerson(
    userId: string,
    connectionId: string,
    fullName: string,
    input: {
      readonly path: string;
      readonly content: string;
      readonly message: string;
      readonly branch: string;
      readonly base: string;
      readonly title: string;
      readonly body: string;
    },
  ): Promise<{ readonly number: number; readonly url: string }> {
    const client = await ownClient(
      userId,
      await connectionRecord(connectionId),
    );
    try {
      const head = await client.branchHead(fullName, input.base);
      try {
        await client.createBranch(fullName, input.branch, head);
      } catch (error) {
        if (error instanceof GitHubError && error.status === 422)
          throw new GitError(
            'ALREADY_EXISTS',
            'GIT_BRANCH_EXISTS',
            `${fullName} already has a branch named ${input.branch}: merge or delete it, then try again.`,
            { repo: fullName },
          );
        throw error;
      }
      try {
        await client.putFile(fullName, {
          path: input.path,
          content: input.content,
          message: input.message,
          branch: input.branch,
        });
      } catch (error) {
        if (error instanceof GitHubError && error.status === 422)
          throw new GitError(
            'ALREADY_EXISTS',
            'GIT_FILE_EXISTS',
            `${fullName} already has ${input.path}.`,
            { repo: fullName },
          );
        throw error;
      }
      const pull = await client.createPull(fullName, {
        title: input.title,
        head: input.branch,
        base: input.base,
        body: input.body,
        draft: false,
      });
      return { number: pull.number, url: pull.url };
    } catch (error) {
      throw hostError(error, { repo: fullName });
    }
  }

  /**
   * Creates a repository on the host. An App's installation token can create one only in an organization, whatever its
   * permissions; under a personal account GitHub takes only a person's token, so that case uses the caller's own.
   */
  async function createRepository(
    userId: string,
    connectionId: string,
    input: {
      readonly owner?: string | null;
      readonly name: string;
      readonly private: boolean;
      readonly description?: string | null;
      readonly empty?: boolean;
    },
  ) {
    const record = await connectionRecord(connectionId);
    const app = record.kind === 'app' ? await appRecord(connectionId) : null;
    const organization =
      app?.installationTargetType === 'Organization'
        ? app.installationAccount
        : null;
    const personal = await personalClient(userId, record);
    let client = personal;
    if (!client) {
      if (record.kind === 'app' && !organization)
        throw new GitError(
          'FAILED_PRECONDITION',
          'GIT_PERSONAL_TOKEN_REQUIRED',
          'GitHub creates a repository under a personal account only with that person’s token: connect yours with `git authorization use-token` first.',
        );
      client = await clientOf(record);
    }
    let owner = input.owner ?? organization ?? null;
    try {
      // Naming one's own account is the same as naming none; GitHub's organization path would refuse it.
      if (owner && !organization && owner === (await client.viewer()).login)
        owner = null;
      return await client.createRepository({
        owner,
        name: input.name,
        private: input.private,
        description: input.description ?? null,
        // Always initialised: a repository with no commit has no branch, and the runner's checkout of it fails.
        autoInit: true,
      });
    } catch (error) {
      if (error instanceof GitHubError && error.status === 422)
        throw new GitError(
          'ALREADY_EXISTS',
          'GIT_REPOSITORY_NAME_TAKEN',
          `GitHub refused the name ${input.name}: ${error.message}`,
        );
      throw hostError(error, { repo: input.name });
    }
  }

  /** One page of what a connection reaches on the host, narrowed by `q`. */
  async function hostRepositories(
    connectionId: string,
    query: { readonly q?: string; readonly page: number },
  ) {
    const record = await connectionRecord(connectionId);
    try {
      const { items, more } = await (
        await clientOf(record)
      ).repositories(
        record.kind === 'app' ? 'installation' : 'user',
        query.page,
      );
      const words = query.q?.toLocaleLowerCase();
      return {
        items: words
          ? items.filter((item) =>
              item.fullName.toLocaleLowerCase().includes(words),
            )
          : items,
        more,
      };
    } catch (error) {
      throw hostError(error, {});
    }
  }

  async function forgetAuthorization(
    userId: string,
    connectionId: string,
  ): Promise<void> {
    await conn()
      .query.deleteFrom(AUTHORIZATIONS)
      .where('userId', '=', userId)
      .where('connectionId', '=', connectionId)
      .execute();
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
      const client = await clientOf(
        await connectionRecord(repository.connectionId),
      );
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
      const client = await clientOf(
        await connectionRecord(repository.connectionId),
      );
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
      const client = await clientOf(
        await connectionRecord(repository.connectionId),
      );
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

  /**
   * The seconds between two polls of a repository: its own `pollSeconds`, or at least ten minutes while its connection
   * is an installed App whose webhook delivered within a day, the poll then being only a net for missed deliveries.
   */
  async function pollIntervals(
    now: Date,
  ): Promise<Map<string, { seconds: number; polledAt: string | null }>> {
    const pushed = new Set<string>();
    const appRows: Row[] = await conn()
      .query.selectFrom(APPS)
      .select(['connectionId', 'installationId', 'lastDeliveryAt'])
      .execute();
    for (const row of appRows) {
      const delivered = iso(row.lastDeliveryAt);
      if (
        strOrNull(row.installationId) &&
        delivered &&
        now.getTime() - Date.parse(delivered) < WEBHOOK_FRESH_MS
      )
        pushed.add(str(row.connectionId));
    }
    const rows: Row[] = await conn()
      .query.selectFrom(REPOSITORIES)
      .select(['id', 'connectionId', 'pollSeconds', 'polledAt'])
      .execute();
    const intervals = new Map<
      string,
      { seconds: number; polledAt: string | null }
    >();
    for (const row of rows) {
      const own = num(row.pollSeconds, 60);
      intervals.set(str(row.id), {
        seconds: pushed.has(str(row.connectionId))
          ? Math.max(own, WEBHOOK_POLL_SECONDS)
          : own,
        polledAt: iso(row.polledAt),
      });
    }
    return intervals;
  }

  /** Polls every repository whose interval (`pollIntervals`) has passed since it was last polled. */
  async function syncDue(now: Date = new Date()): Promise<void> {
    for (const [id, { seconds, polledAt }] of await pollIntervals(now)) {
      if (polledAt && Date.parse(polledAt) + seconds * 1000 > now.getTime())
        continue;
      try {
        await syncRepository(id);
      } catch (error) {
        report(`Dương Sinh Studio could not poll repository ${id}.`, error);
      }
    }
  }

  /** Relative file paths changed by a pull request (read via GitHub client). */
  async function pullFiles(id: string): Promise<string[]> {
    const pull = await pullRecord(id);
    const repo = await repositoryRecord(pull.repositoryId);
    const client = await clientForRepository(repo.id);
    return client.pullFiles(repo.fullName, pull.number);
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
      client = await clientOf(await connectionRecord(repository.connectionId));
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

  /**
   * Installation tokens for the linked repositories of `projectId` among `urls` that an App connection serves, each
   * limited to its repository, keyed by the normalized URL. Outside any transaction: it may call GitHub.
   */
  async function appCredentialsFor(
    projectId: string,
    /** Null: every repository of the project an App serves (a claim's preparation does not know its checkouts yet). */
    urls: readonly string[] | null,
    refresh = false,
  ): Promise<Map<string, { token: string; expiresAt: string }>> {
    const minted = new Map<string, { token: string; expiresAt: string }>();
    const rows: Row[] = await conn()
      .query.selectFrom(PROJECT_REPOSITORIES)
      .innerJoin(
        REPOSITORIES,
        `${REPOSITORIES}.id`,
        `${PROJECT_REPOSITORIES}.repositoryId`,
      )
      .innerJoin(
        CONNECTIONS,
        `${CONNECTIONS}.id`,
        `${REPOSITORIES}.connectionId`,
      )
      .select([
        `${REPOSITORIES}.cloneUrl as cloneUrl`,
        `${REPOSITORIES}.fullName as fullName`,
        `${REPOSITORIES}.connectionId as connectionId`,
      ])
      .where(`${PROJECT_REPOSITORIES}.projectId`, '=', projectId)
      .where(`${CONNECTIONS}.kind`, '=', 'app')
      .execute();
    for (const url of urls ?? rows.map((row) => str(row.cloneUrl))) {
      const row = rows.find(
        (candidate) =>
          normalizeUrl(str(candidate.cloneUrl)) === normalizeUrl(url),
      );
      if (!row) continue;
      const record = await connectionRecord(str(row.connectionId));
      minted.set(
        normalizeUrl(url),
        await installationToken(record, str(row.fullName), refresh),
      );
    }
    return minted;
  }

  /**
   * The linked repositories of `projectId` among `urls`, each with what it pushes with: a token connection's own
   * token, or for an App connection the installation token `prepared` holds for it (from `appCredentialsFor`, minted
   * before the claim's transaction); a repository of an App connection with none prepared is left out.
   */
  async function credentialsFor(
    connection: DatabaseConnection,
    projectId: string,
    urls: readonly string[],
    prepared?: ReadonlyMap<string, { token: string; expiresAt: string }>,
    /** List App repositories without a prepared token too (their token empty): a runner asks for it on demand. */
    listUnprepared = false,
  ): Promise<
    { url: string; token: string; fullName: string; expiresAt?: string }[]
  > {
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
    const found: {
      url: string;
      token: string;
      fullName: string;
      expiresAt?: string;
    }[] = [];
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
      const connectionRow = connectionOf(record);
      if (connectionRow.kind === 'app') {
        const token = prepared?.get(normalizeUrl(url));
        if (token)
          found.push({
            url,
            fullName: str(row.fullName),
            token: token.token,
            expiresAt: token.expiresAt,
          });
        else if (listUnprepared)
          found.push({ url, fullName: str(row.fullName), token: '' });
        continue;
      }
      found.push({
        url,
        fullName: str(row.fullName),
        token: tokenOf(connectionRow),
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
    clientForRepository,
    repositoryToken,
    onTagPush,
    onWebhookEvent,
    linkRepository,
    updateRepository,
    updateConnection,
    connectionUsage,
    reportCheck,
    reportedChecksOf,
    resolveCommit,
    commitChecks,
    setAutoComplete,
    unlinkPullRequest,
    markMerged,
    listAuthorizations,
    useToken,
    forgetAuthorization,
    createRepository,
    writeFileAsPerson,
    proposeFileAsPerson,
    hostRepositories,
    attachToProject,
    primaryRepository: async (projectId: string) => {
      const record = await primaryRepositoryOf(projectId);
      return record ? getRepository(record.id) : null;
    },
    projectsOf,
    listPullRequests,
    getPullRequest,
    refreshPullRequest,
    pullFiles,
    setStageMergePolicy: (policy: NonNullable<typeof stageMergePolicy>) => {
      stageMergePolicy = policy;
    },
    syncRepository,
    syncDue,
    pollIntervals,
    mergePullRequest,
    openPullRequest,
    credentialsFor,
    appCredentialsFor,
    startAppManifest,
    completeAppManifest,
    setInstallation,
    handleWebhook,
    pruneDeliveries,
    credentialTtlMs: CREDENTIAL_TTL_MS,
  };
}
