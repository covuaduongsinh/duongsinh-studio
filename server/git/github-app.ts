/**
 * GitHub App pieces that need no database: the manifest Studio sends to GitHub, the App's JWT (RS256 through
 * `node:crypto`), webhook signatures, what the App is missing of the permissions Studio needs, and the few App
 * endpoints (manifest conversion, installations, installation tokens). Everything GitHub answers is narrowed field by
 * field; `fetch` is read from `globalThis` on every call so tests replace it.
 */
import { createHmac, createSign, timingSafeEqual } from 'node:crypto';
import { GITHUB_API_URL, GitHubError } from './github.js';

const TIMEOUT_MS = 15_000;

/** What Studio needs of an installation: read and push code, open and merge pull requests, read CI. */
export const REQUIRED_APP_PERMISSIONS: Readonly<
  Record<string, 'read' | 'write'>
> = {
  metadata: 'read',
  contents: 'write',
  pull_requests: 'write',
  checks: 'write',
  statuses: 'read',
  actions: 'read',
};

/** The webhook events Studio subscribes to. */
export const APP_EVENTS: readonly string[] = [
  'pull_request',
  'check_run',
  'check_suite',
  'workflow_run',
  'status',
  'push',
];

/**
 * The manifest of a new App (https://docs.github.com/apps/sharing-github-apps/registering-a-github-app-from-a-manifest):
 * private, its webhook at this connection's URL, back to Studio's Git settings when created and when installed.
 */
export function appManifest(input: {
  readonly name: string;
  /** Studio's public base, such as `https://studio.dsc.edu.vn/main`. */
  readonly baseUrl: string;
  readonly connectionId: string;
}): Record<string, unknown> {
  const base = input.baseUrl.replace(/\/+$/u, '');
  return {
    name: input.name,
    url: `${base}/`,
    description:
      'Dương Sinh Studio: agents open pull requests, Studio reads their checks and merges them.',
    hook_attributes: {
      url: webhookUrlOf(base, input.connectionId),
      active: true,
    },
    redirect_url: `${base}/settings/git`,
    setup_url: `${base}/settings/git?githubApp=${encodeURIComponent(input.connectionId)}`,
    setup_on_update: true,
    public: false,
    default_permissions: { ...REQUIRED_APP_PERMISSIONS },
    default_events: [...APP_EVENTS],
  };
}

export const webhookUrlOf = (baseUrl: string, connectionId: string): string =>
  `${baseUrl.replace(/\/+$/u, '')}/api/webhooks/github/connections/${encodeURIComponent(connectionId)}`;

/** Where a person creates the App from a manifest: their own account, or an organization they manage. */
export function manifestPostUrl(
  webUrl: string,
  state: string,
  organization?: string | null,
): string {
  const web = webUrl.replace(/\/+$/u, '');
  const path = organization
    ? `/organizations/${encodeURIComponent(organization)}/settings/apps/new`
    : '/settings/apps/new';
  return `${web}${path}?state=${encodeURIComponent(state)}`;
}

const base64url = (value: Buffer | string): string =>
  Buffer.from(value).toString('base64url');

/** The App's JWT: issued a minute in the past (clock drift), valid nine minutes, as GitHub allows at most ten. */
export function appJwt(
  appId: string,
  privateKey: string,
  now: number = Date.now(),
): string {
  const seconds = Math.floor(now / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(
    JSON.stringify({ iat: seconds - 60, exp: seconds + 540, iss: appId }),
  );
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${payload}`);
  signer.end();
  return `${header}.${payload}.${signer.sign(privateKey).toString('base64url')}`;
}

/** Whether `header` (`X-Hub-Signature-256`) is the HMAC-SHA256 of `body` with `secret`, compared in constant time. */
export function verifySignature(
  secret: string,
  body: Uint8Array,
  header: string | null | undefined,
): boolean {
  if (!header || !header.startsWith('sha256=')) return false;
  const expected = Buffer.from(
    `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`,
  );
  const given = Buffer.from(header);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

const LEVELS: Readonly<Record<string, number>> = {
  read: 1,
  write: 2,
  admin: 3,
};

/** The permissions Studio needs that `granted` lacks or holds below the needed level, as `name:level`. */
export function missingPermissions(
  granted: Readonly<Record<string, string>>,
): string[] {
  return Object.entries(REQUIRED_APP_PERMISSIONS)
    .filter(
      ([name, level]) => (LEVELS[granted[name] ?? ''] ?? 0) < LEVELS[level],
    )
    .map(([name, level]) => `${name}:${level}`);
}

type Json = Record<string, unknown>;

const record = (value: unknown): Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Json)
    : {};
const text = (value: unknown): string | null =>
  typeof value === 'string' ? value : null;
const idOf = (value: unknown): string | null =>
  typeof value === 'number' || (typeof value === 'string' && value)
    ? String(value)
    : null;
const permissionsOf = (value: unknown): Record<string, string> =>
  Object.fromEntries(
    Object.entries(record(value)).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  );

export interface ConvertedApp {
  readonly appId: string;
  readonly slug: string;
  readonly name: string;
  readonly htmlUrl: string;
  readonly ownerLogin: string | null;
  readonly privateKey: string;
  readonly webhookSecret: string;
  readonly permissions: Record<string, string>;
  readonly events: string[];
}

export interface AppInstallation {
  readonly id: string;
  readonly account: string | null;
  /** `User` or `Organization`. */
  readonly targetType: string | null;
  readonly permissions: Record<string, string>;
  readonly events: string[];
  readonly suspended: boolean;
}

export function installationOf(value: unknown): AppInstallation {
  const installation = record(value);
  return {
    id: idOf(installation.id) ?? '',
    account: text(record(installation.account).login),
    targetType: text(installation.target_type),
    permissions: permissionsOf(installation.permissions),
    events: Array.isArray(installation.events)
      ? installation.events.filter(
          (event): event is string => typeof event === 'string',
        )
      : [],
    suspended: installation.suspended_at != null,
  };
}

export interface GitHubAppApi {
  /** Trades the one-time `code` GitHub sent back for the new App's id, key and webhook secret. No credential. */
  convertManifest(code: string): Promise<ConvertedApp>;
  installations(jwt: string): Promise<AppInstallation[]>;
  installation(jwt: string, installationId: string): Promise<AppInstallation>;
  /** An installation token, limited to `repositories` (names without the owner) when given. */
  installationToken(
    jwt: string,
    installationId: string,
    repositories?: readonly string[],
  ): Promise<{ readonly token: string; readonly expiresAt: string }>;
}

export function createGitHubAppApi(
  apiBaseUrl: string = GITHUB_API_URL,
): GitHubAppApi {
  const base = apiBaseUrl.replace(/\/+$/u, '');

  async function call(
    method: string,
    path: string,
    bearer: string | null,
    body?: unknown,
  ): Promise<unknown> {
    let response: Response;
    try {
      response = await globalThis.fetch(`${base}${path}`, {
        method,
        headers: {
          accept: 'application/vnd.github+json',
          'user-agent': 'duongsinh-studio',
          'x-github-api-version': '2022-11-28',
          ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      throw new GitHubError(
        0,
        `GitHub could not be reached: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    const answer: unknown = await response.json().catch(() => null);
    if (!response.ok)
      throw new GitHubError(
        response.status,
        `GitHub answered ${response.status} to ${method} ${path}: ${text(record(answer).message) ?? 'no message'}`,
      );
    return answer;
  }

  return {
    async convertManifest(code) {
      const app = record(
        await call(
          'POST',
          `/app-manifests/${encodeURIComponent(code)}/conversions`,
          null,
        ),
      );
      const appId = idOf(app.id);
      const privateKey = text(app.pem);
      const webhookSecret = text(app.webhook_secret);
      if (!appId || !privateKey || !webhookSecret)
        throw new GitHubError(
          502,
          'GitHub answered the manifest conversion without an App id, key or webhook secret.',
        );
      return {
        appId,
        slug: text(app.slug) ?? '',
        name: text(app.name) ?? '',
        htmlUrl: text(app.html_url) ?? '',
        ownerLogin: text(record(app.owner).login),
        privateKey,
        webhookSecret,
        permissions: permissionsOf(app.permissions),
        events: Array.isArray(app.events)
          ? app.events.filter(
              (event): event is string => typeof event === 'string',
            )
          : [],
      };
    },
    async installations(jwt) {
      const answer = await call('GET', '/app/installations?per_page=100', jwt);
      return (Array.isArray(answer) ? answer : []).map(installationOf);
    },
    async installation(jwt, installationId) {
      return installationOf(
        await call(
          'GET',
          `/app/installations/${encodeURIComponent(installationId)}`,
          jwt,
        ),
      );
    },
    async installationToken(jwt, installationId, repositories) {
      const answer = record(
        await call(
          'POST',
          `/app/installations/${encodeURIComponent(installationId)}/access_tokens`,
          jwt,
          repositories && repositories.length > 0
            ? { repositories: [...repositories] }
            : {},
        ),
      );
      const token = text(answer.token);
      if (!token)
        throw new GitHubError(
          502,
          'GitHub answered an installation token request without a token.',
        );
      return {
        token,
        expiresAt:
          text(answer.expires_at) ??
          new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      };
    },
  };
}
