/**
 * The one module that talks to GitHub's REST API, over `fetch` (read from `globalThis` on every call, so tests replace
 * it with `vi.stubGlobal`). Answers are narrowed field by field; nothing GitHub sends is trusted as typed.
 */

export const GITHUB_API_URL = 'https://api.github.com';
const TIMEOUT_MS = 15_000;

/** A GitHub answer other than 2xx, or a network failure (`status` 0). Its message never carries the token. */
export class GitHubError extends Error {
  override name = 'GitHubError';
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface GitHubRepository {
  readonly id: string;
  readonly fullName: string;
  readonly defaultBranch: string;
  readonly cloneUrl: string;
  readonly webUrl: string;
  /** Whether the token may push (`permissions.push`); false when GitHub does not say. */
  readonly canPush: boolean;
}

export interface GitHubPull {
  readonly number: number;
  readonly title: string;
  readonly url: string;
  readonly state: 'open' | 'closed';
  readonly merged: boolean;
  readonly draft: boolean;
  readonly headRef: string;
  readonly headSha: string;
  readonly baseRef: string;
  /** Only the single-pull answer carries it; null in lists and while GitHub works it out. */
  readonly mergeableState: string | null;
  readonly mergedAt: string | null;
  readonly mergeCommitSha: string | null;
  readonly closedAt: string | null;
  readonly authorLogin: string | null;
  readonly updatedAt: string;
}

export type CheckOutcome = 'pending' | 'success' | 'failure';

export interface GitHubCheck {
  readonly kind: 'checkRun' | 'status';
  readonly name: string;
  readonly outcome: CheckOutcome;
  /** GitHub's own words: a check run's status and conclusion, or a commit status's state. */
  readonly status: string;
  readonly conclusion: string | null;
  readonly url: string | null;
}

export interface GitHubClient {
  viewer(): Promise<{ readonly login: string }>;
  repository(fullName: string): Promise<GitHubRepository>;
  /**
   * Creates a repository: in the organization `owner`, or with no owner under the account the token belongs to. GitHub
   * takes the second only from a person's token, never from an App's installation token.
   */
  createRepository(input: {
    readonly owner: string | null;
    readonly name: string;
    readonly private: boolean;
    readonly description: string | null;
    readonly autoInit: boolean;
  }): Promise<GitHubRepository>;
  /** One page of the repositories the token reaches, with whether there are more. */
  repositories(
    source: 'installation' | 'user',
    page: number,
  ): Promise<{
    readonly items: readonly GitHubRepository[];
    readonly more: boolean;
  }>;
  pulls(
    fullName: string,
    state: 'open' | 'closed',
    perPage: number,
  ): Promise<GitHubPull[]>;
  pull(fullName: string, number: number): Promise<GitHubPull>;
  /** The files changed by a pull request (relative file paths). */
  pullFiles(fullName: string, number: number): Promise<string[]>;
  /** The open pull requests whose head is `branch` of the repository itself (not of a fork). */
  openPullsFrom(fullName: string, branch: string): Promise<GitHubPull[]>;
  createPull(
    fullName: string,
    input: {
      readonly title: string;
      readonly head: string;
      readonly base: string;
      readonly body: string;
      readonly draft: boolean;
    },
  ): Promise<GitHubPull>;
  checks(fullName: string, sha: string): Promise<GitHubCheck[]>;
  merge(
    fullName: string,
    number: number,
    input: { readonly sha: string; readonly title: string },
  ): Promise<{ readonly sha: string | null }>;
  comment(fullName: string, number: number, body: string): Promise<void>;
  /** The commit a branch points at. */
  branchHead(fullName: string, branch: string): Promise<string>;
  /** The entries of a directory at `ref`; empty when the directory (or the path) does not exist there. */
  directory(
    fullName: string,
    path: string,
    ref: string,
  ): Promise<GitHubContentEntry[]>;
  /** A file's text at `ref` (UTF-8). */
  file(fullName: string, path: string, ref: string): Promise<GitHubFile>;
  /** The repository's tags, newest first as GitHub lists them (at most `perPage`, up to 100). */
  tags(fullName: string, perPage: number): Promise<GitHubTag[]>;
  /** How `head` relates to `base`, with the commits `head` has that `base` lacks (up to 250). */
  compare(
    fullName: string,
    base: string,
    head: string,
  ): Promise<GitHubComparison>;
  /** When a commit was made (its committer date). */
  commitDate(fullName: string, sha: string): Promise<string | null>;
  /** The artifacts a workflow run uploaded (names, ids and the API URL their zip downloads from). */
  runArtifacts(fullName: string, runId: number): Promise<GitHubArtifact[]>;
}

export interface GitHubArtifact {
  readonly id: number;
  readonly name: string;
  readonly expired: boolean;
  /** `GET` with the token answers a redirect to the zip. */
  readonly downloadUrl: string;
}

export interface GitHubTag {
  readonly name: string;
  readonly sha: string;
}

export interface GitHubComparison {
  /** GitHub's words: `ahead`, `behind`, `identical` or `diverged`. */
  readonly status: string;
  readonly aheadBy: number;
  readonly commits: readonly string[];
}

export interface GitHubContentEntry {
  readonly name: string;
  readonly path: string;
  readonly type: 'file' | 'dir' | 'other';
  /** The blob's (or tree's) sha: the same content keeps the same sha across commits. */
  readonly sha: string;
  readonly size: number;
}

export interface GitHubFile {
  readonly path: string;
  readonly sha: string;
  readonly size: number;
  readonly text: string;
}

type Json = Record<string, unknown>;

const record = (value: unknown): Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Json)
    : {};
const text = (value: unknown): string | null =>
  typeof value === 'string' ? value : null;
const items = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];

function pullOf(value: unknown): GitHubPull {
  const pull = record(value);
  const head = record(pull.head);
  const base = record(pull.base);
  const mergedAt = text(pull.merged_at);
  return {
    number: typeof pull.number === 'number' ? pull.number : 0,
    title: text(pull.title) ?? '',
    url: text(pull.html_url) ?? '',
    state: pull.state === 'closed' ? 'closed' : 'open',
    merged: pull.merged === true || mergedAt !== null,
    draft: pull.draft === true,
    headRef: text(head.ref) ?? '',
    headSha: text(head.sha) ?? '',
    baseRef: text(base.ref) ?? '',
    mergeableState: text(pull.mergeable_state),
    mergedAt,
    mergeCommitSha: mergedAt ? text(pull.merge_commit_sha) : null,
    closedAt: text(pull.closed_at),
    authorLogin: text(record(pull.user).login),
    updatedAt: text(pull.updated_at) ?? new Date(0).toISOString(),
  };
}

const FAILED = new Set([
  'failure',
  'timed_out',
  'cancelled',
  'action_required',
  'startup_failure',
  'stale',
]);

function checkRunOf(value: unknown): GitHubCheck {
  const run = record(value);
  const status = text(run.status) ?? 'queued';
  const conclusion = text(run.conclusion);
  return {
    kind: 'checkRun',
    name: text(run.name) ?? '',
    status,
    conclusion,
    url: text(run.html_url),
    outcome:
      status !== 'completed' || conclusion === null
        ? 'pending'
        : FAILED.has(conclusion)
          ? 'failure'
          : 'success',
  };
}

function statusOf(value: unknown): GitHubCheck {
  const status = record(value);
  const state = text(status.state) ?? 'pending';
  return {
    kind: 'status',
    name: text(status.context) ?? '',
    status: state,
    conclusion: null,
    url: text(status.target_url),
    outcome:
      state === 'success'
        ? 'success'
        : state === 'pending'
          ? 'pending'
          : 'failure',
  };
}

function repositoryOf(value: unknown, fullName: string): GitHubRepository {
  const repo = record(value);
  const name = text(repo.full_name) ?? fullName;
  return {
    id:
      typeof repo.id === 'number' || typeof repo.id === 'string'
        ? String(repo.id)
        : '',
    fullName: name,
    defaultBranch: text(repo.default_branch) ?? 'main',
    cloneUrl: text(repo.clone_url) ?? `https://github.com/${name}.git`,
    webUrl: text(repo.html_url) ?? `https://github.com/${name}`,
    canPush: record(repo.permissions).push === true,
  };
}

export function createGitHubClient(options: {
  readonly token: string;
  readonly apiBaseUrl?: string;
}): GitHubClient {
  const base = (options.apiBaseUrl ?? GITHUB_API_URL).replace(/\/+$/, '');

  async function call(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<unknown> {
    let response: Response;
    try {
      response = await globalThis.fetch(`${base}${path}`, {
        method,
        headers: {
          accept: 'application/vnd.github+json',
          authorization: `Bearer ${options.token}`,
          'user-agent': 'duongsinh-studio',
          'x-github-api-version': '2022-11-28',
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
    if (response.status === 204) return null;
    const answer: unknown = await response.json().catch(() => null);
    if (!response.ok)
      throw new GitHubError(
        response.status,
        `GitHub answered ${response.status} to ${method} ${path}: ${text(record(answer).message) ?? 'no message'}`,
      );
    return answer;
  }

  const repoPath = (fullName: string) =>
    `/repos/${fullName.split('/').map(encodeURIComponent).join('/')}`;
  const contentsPath = (fullName: string, path: string, ref: string) =>
    `${repoPath(fullName)}/contents/${path
      .split('/')
      .filter(Boolean)
      .map(encodeURIComponent)
      .join('/')}?ref=${encodeURIComponent(ref)}`;

  return {
    async viewer() {
      return { login: text(record(await call('GET', '/user')).login) ?? '' };
    },
    async repository(fullName) {
      return repositoryOf(await call('GET', repoPath(fullName)), fullName);
    },
    async createRepository(input) {
      const fullName = `${input.owner ?? ''}/${input.name}`;
      return repositoryOf(
        await call(
          'POST',
          input.owner
            ? `/orgs/${encodeURIComponent(input.owner)}/repos`
            : '/user/repos',
          {
            name: input.name,
            private: input.private,
            auto_init: input.autoInit,
            ...(input.description ? { description: input.description } : {}),
          },
        ),
        fullName,
      );
    },
    async repositories(source, page) {
      const perPage = 100;
      const answer = await call(
        'GET',
        source === 'installation'
          ? `/installation/repositories?per_page=${perPage}&page=${page}`
          : `/user/repos?per_page=${perPage}&page=${page}&sort=updated`,
      );
      const list: unknown[] = Array.isArray(answer)
        ? answer
        : Array.isArray(record(answer).repositories)
          ? (record(answer).repositories as unknown[])
          : [];
      return {
        items: list.map((item) => repositoryOf(item, '')),
        more: list.length === perPage,
      };
    },
    async pulls(fullName, state, perPage) {
      const query = new URLSearchParams({
        state,
        sort: 'updated',
        direction: 'desc',
        per_page: String(perPage),
      });
      return items(
        await call('GET', `${repoPath(fullName)}/pulls?${query.toString()}`),
      ).map(pullOf);
    },
    async pull(fullName, number) {
      return pullOf(await call('GET', `${repoPath(fullName)}/pulls/${number}`));
    },
    async pullFiles(fullName, number) {
      const answer = items(
        await call(
          'GET',
          `${repoPath(fullName)}/pulls/${number}/files?per_page=100`,
        ),
      );
      return answer
        .map((entry) => text(record(entry).filename) ?? '')
        .filter((name) => name !== '');
    },
    async openPullsFrom(fullName, branch) {
      const query = new URLSearchParams({
        state: 'open',
        head: `${fullName.split('/')[0]}:${branch}`,
        per_page: '10',
      });
      return items(
        await call('GET', `${repoPath(fullName)}/pulls?${query.toString()}`),
      ).map(pullOf);
    },
    async createPull(fullName, input) {
      return pullOf(
        await call('POST', `${repoPath(fullName)}/pulls`, {
          title: input.title,
          head: input.head,
          base: input.base,
          body: input.body,
          draft: input.draft,
        }),
      );
    },
    async checks(fullName, sha) {
      const ref = encodeURIComponent(sha);
      let runs: GitHubCheck[];
      try {
        runs = items(
          record(
            await call(
              'GET',
              `${repoPath(fullName)}/commits/${ref}/check-runs?per_page=100`,
            ),
          ).check_runs,
        ).map(checkRunOf);
      } catch (error) {
        // Fine-grained personal access tokens cannot be granted "Checks" at all, so check runs answer 403. The GitHub
        // Actions runs of the same commit carry the same name, status and conclusion and need only "Actions: Read".
        if (!(error instanceof GitHubError) || error.status !== 403)
          throw error;
        const latest = new Map<string, GitHubCheck>();
        for (const run of items(
          record(
            await call(
              'GET',
              `${repoPath(fullName)}/actions/runs?head_sha=${ref}&per_page=100`,
            ),
          ).workflow_runs,
        ).map(checkRunOf)) {
          // Newest first: keep each workflow's latest attempt.
          if (!latest.has(run.name)) latest.set(run.name, run);
        }
        runs = [...latest.values()];
      }
      const statuses = items(
        record(await call('GET', `${repoPath(fullName)}/commits/${ref}/status`))
          .statuses,
      ).map(statusOf);
      return [...runs, ...statuses];
    },
    async merge(fullName, number, input) {
      const answer = record(
        await call('PUT', `${repoPath(fullName)}/pulls/${number}/merge`, {
          merge_method: 'squash',
          sha: input.sha,
          commit_title: input.title,
        }),
      );
      return { sha: text(answer.sha) };
    },
    async comment(fullName, number, body) {
      await call('POST', `${repoPath(fullName)}/issues/${number}/comments`, {
        body,
      });
    },
    async branchHead(fullName, branch) {
      const answer = record(
        await call(
          'GET',
          `${repoPath(fullName)}/branches/${encodeURIComponent(branch)}`,
        ),
      );
      const sha = text(record(answer.commit).sha);
      if (!sha)
        throw new GitHubError(
          502,
          `GitHub named no commit for ${fullName}@${branch}.`,
        );
      return sha;
    },
    async directory(fullName, path, ref) {
      let answer: unknown;
      try {
        answer = await call('GET', contentsPath(fullName, path, ref));
      } catch (error) {
        if (error instanceof GitHubError && error.status === 404) return [];
        throw error;
      }
      // A file at the path answers an object, not a list: no directory there.
      return items(answer).map((value): GitHubContentEntry => {
        const entry = record(value);
        return {
          name: text(entry.name) ?? '',
          path: text(entry.path) ?? '',
          type:
            entry.type === 'file'
              ? 'file'
              : entry.type === 'dir'
                ? 'dir'
                : 'other',
          sha: text(entry.sha) ?? '',
          size: typeof entry.size === 'number' ? entry.size : 0,
        };
      });
    },
    async file(fullName, path, ref) {
      const answer = record(
        await call('GET', contentsPath(fullName, path, ref)),
      );
      const content = text(answer.content);
      if (answer.type !== 'file' || content === null)
        throw new GitHubError(
          404,
          `${fullName}:${path} is not a file at ${ref}.`,
        );
      return {
        path: text(answer.path) ?? path,
        sha: text(answer.sha) ?? '',
        size: typeof answer.size === 'number' ? answer.size : 0,
        text:
          answer.encoding === 'base64'
            ? Buffer.from(content, 'base64').toString('utf8')
            : content,
      };
    },
    async tags(fullName, perPage) {
      const query = new URLSearchParams({
        per_page: String(Math.min(Math.max(perPage, 1), 100)),
      });
      return items(
        await call('GET', `${repoPath(fullName)}/tags?${query.toString()}`),
      )
        .map((value): GitHubTag => {
          const tag = record(value);
          return {
            name: text(tag.name) ?? '',
            sha: text(record(tag.commit).sha) ?? '',
          };
        })
        .filter((tag) => tag.name !== '' && tag.sha !== '');
    },
    async compare(fullName, base, head) {
      const answer = record(
        await call(
          'GET',
          `${repoPath(fullName)}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}?per_page=250`,
        ),
      );
      return {
        status: text(answer.status) ?? 'diverged',
        aheadBy: typeof answer.ahead_by === 'number' ? answer.ahead_by : 0,
        commits: items(answer.commits)
          .map((value) => text(record(value).sha) ?? '')
          .filter((sha) => sha !== ''),
      };
    },
    async commitDate(fullName, sha) {
      const answer = record(
        await call(
          'GET',
          `${repoPath(fullName)}/commits/${encodeURIComponent(sha)}`,
        ),
      );
      const commit = record(answer.commit);
      return (
        text(record(commit.committer).date) ?? text(record(commit.author).date)
      );
    },
    async runArtifacts(fullName, runId) {
      const answer = record(
        await call(
          'GET',
          `${repoPath(fullName)}/actions/runs/${encodeURIComponent(String(runId))}/artifacts?per_page=100`,
        ),
      );
      return items(answer.artifacts)
        .map((value): GitHubArtifact => {
          const artifact = record(value);
          return {
            id: typeof artifact.id === 'number' ? artifact.id : 0,
            name: text(artifact.name) ?? '',
            expired: artifact.expired === true,
            downloadUrl: text(artifact.archive_download_url) ?? '',
          };
        })
        .filter((artifact) => artifact.id > 0 && artifact.downloadUrl !== '');
    },
  };
}
