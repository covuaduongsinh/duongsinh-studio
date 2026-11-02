import { GitHubError, type GitHubClient } from '../git/github.js';
import { GitError, type GitRepositoryView } from '../git/service.js';
import {
  MEMORY_DIR,
  MEMORY_LIMIT,
  MEMORY_MAX_BYTES,
  isMemoryPath,
  parseMemory,
  type MemoryType,
  type ParsedMemory,
} from './parse.js';

/** How long a repository's branch head is trusted before GitHub is asked again. */
export const MEMORY_CHECK_MS = 60_000;

/** Why a repository's memory could not be read: the page says it in its own words. */
export type MemoryUnavailable =
  | 'noToken'
  | 'tokenRejected'
  | 'unreachable'
  | 'hostUnavailable';

export interface MemorySummary {
  readonly path: string;
  readonly slug: string;
  /** The blob: unchanged content keeps it across commits. */
  readonly sha: string;
  readonly name: string;
  readonly description: string;
  readonly type: MemoryType | null;
  readonly modified: string | null;
  readonly size: number;
  readonly oversize: boolean;
  readonly problems: readonly string[];
  readonly webUrl: string;
}

export interface RepositoryMemory {
  readonly repositoryId: string;
  readonly repo: string;
  readonly provider: 'github';
  readonly branch: string;
  /** The commit read; null when it never could be. */
  readonly commitSha: string | null;
  /** `main@1a2b3c4`, as the page shows it; null with `commitSha`. */
  readonly ref: string | null;
  readonly checkedAt: string | null;
  readonly limit: number;
  /** Memory files on the branch, including those past `limit`. */
  readonly total: number;
  readonly webUrl: string;
  readonly memories: readonly MemorySummary[];
  readonly unavailable: MemoryUnavailable | null;
}

export interface MemoryFile extends MemorySummary {
  readonly body: string;
  readonly ref: string;
  readonly commitSha: string;
}

/** A refusal the routes answer as an API error. */
export class MemoryError extends Error {
  override name = 'MemoryError';
  constructor(
    readonly status: 'INVALID_ARGUMENT' | 'NOT_FOUND' | 'UNAVAILABLE',
    readonly reason: string,
    message: string,
  ) {
    super(message);
  }
}

export interface MemoryServiceDeps {
  readonly client: (repositoryId: string) => Promise<GitHubClient>;
  readonly now?: () => number;
}

interface Cached {
  readonly value: RepositoryMemory;
  readonly checkedMs: number;
}

/** Parsed files by blob sha: the same content is the same blob in every commit, so a new head refetches only changes. */
const BLOB_CACHE_LIMIT = 2_000;

export function unavailableOf(error: unknown): MemoryUnavailable {
  if (error instanceof GitError) return 'noToken';
  if (error instanceof GitHubError) {
    if (error.status === 401) return 'tokenRejected';
    if (error.status === 403 || error.status === 404) return 'unreachable';
  }
  return 'hostUnavailable';
}

export type MemoryService = ReturnType<typeof createMemoryService>;

/**
 * Project memory (S4): the `.nb-studio/memory/*.md` files of a repository's default branch, read from GitHub through
 * the repository's connection and kept in memory per branch head, checked again at most once a minute. Read-only.
 */
export function createMemoryService(deps: MemoryServiceDeps) {
  const now = deps.now ?? (() => Date.now());
  const repositories = new Map<string, Cached>();
  const inFlight = new Map<string, Promise<RepositoryMemory>>();
  const blobs = new Map<string, ParsedMemory>();

  const folderUrl = (repo: GitRepositoryView) =>
    `${repo.webUrl}/tree/${encodeURIComponent(repo.defaultBranch)}/${MEMORY_DIR}`;
  const fileUrl = (repo: GitRepositoryView, path: string) =>
    `${repo.webUrl}/blob/${encodeURIComponent(repo.defaultBranch)}/${path}`;

  const empty = (
    repo: GitRepositoryView,
    unavailable: MemoryUnavailable,
  ): RepositoryMemory => ({
    repositoryId: repo.id,
    repo: repo.repo,
    provider: 'github',
    branch: repo.defaultBranch,
    commitSha: null,
    ref: null,
    checkedAt: null,
    limit: MEMORY_LIMIT,
    total: 0,
    webUrl: folderUrl(repo),
    memories: [],
    unavailable,
  });

  async function load(
    repo: GitRepositoryView,
    previous: Cached | undefined,
  ): Promise<RepositoryMemory> {
    const checkedMs = now();
    let client: GitHubClient;
    let sha: string;
    try {
      client = await deps.client(repo.id);
      sha = await client.branchHead(repo.repo, repo.defaultBranch);
    } catch (error) {
      const reason = unavailableOf(error);
      // What was read before stays shown, said to be out of reach now.
      const value = previous
        ? { ...previous.value, unavailable: reason }
        : empty(repo, reason);
      repositories.set(repo.id, { value, checkedMs });
      return value;
    }
    const checkedAt = new Date(checkedMs).toISOString();
    if (previous && previous.value.commitSha === sha) {
      const value = { ...previous.value, checkedAt, unavailable: null };
      repositories.set(repo.id, { value, checkedMs });
      return value;
    }
    try {
      const entries = (await client.directory(repo.repo, MEMORY_DIR, sha))
        .filter((entry) => entry.type === 'file' && isMemoryPath(entry.path))
        .sort((a, b) => a.name.localeCompare(b.name));
      const memories: MemorySummary[] = [];
      for (const entry of entries.slice(0, MEMORY_LIMIT)) {
        let parsed = blobs.get(entry.sha);
        if (!parsed) {
          const file = await client.file(repo.repo, entry.path, sha);
          parsed = parseMemory(file.text, entry.name.replace(/\.md$/u, ''));
          if (blobs.size >= BLOB_CACHE_LIMIT) blobs.clear();
          blobs.set(entry.sha, parsed);
        }
        memories.push({
          path: entry.path,
          slug: entry.name.replace(/\.md$/u, ''),
          sha: entry.sha,
          name: parsed.name,
          description: parsed.description,
          type: parsed.type,
          modified: parsed.modified,
          size: entry.size,
          oversize: entry.size > MEMORY_MAX_BYTES,
          problems: parsed.problems,
          webUrl: fileUrl(repo, entry.path),
        });
      }
      memories.sort(
        (a, b) =>
          (b.modified ?? '').localeCompare(a.modified ?? '') ||
          a.slug.localeCompare(b.slug),
      );
      const value: RepositoryMemory = {
        ...empty(repo, 'hostUnavailable'),
        commitSha: sha,
        ref: `${repo.defaultBranch}@${sha.slice(0, 7)}`,
        checkedAt,
        total: entries.length,
        memories,
        unavailable: null,
      };
      repositories.set(repo.id, { value, checkedMs });
      return value;
    } catch (error) {
      const reason = unavailableOf(error);
      const value = previous
        ? { ...previous.value, unavailable: reason }
        : empty(repo, reason);
      repositories.set(repo.id, { value, checkedMs });
      return value;
    }
  }

  /** The repository's memory at its default branch; GitHub is asked when the last check is a minute old, or `fresh`. */
  async function readRepository(
    repo: GitRepositoryView,
    options: { readonly fresh?: boolean } = {},
  ): Promise<RepositoryMemory> {
    const cached = repositories.get(repo.id);
    if (
      cached &&
      !options.fresh &&
      cached.value.branch === repo.defaultBranch &&
      now() - cached.checkedMs < MEMORY_CHECK_MS
    )
      return cached.value;
    const running = inFlight.get(repo.id);
    if (running) return running;
    const promise = load(
      repo,
      cached?.value.branch === repo.defaultBranch ? cached : undefined,
    ).finally(() => inFlight.delete(repo.id));
    inFlight.set(repo.id, promise);
    return promise;
  }

  /** One memory with its body, at the commit `readRepository` last read. */
  async function readFile(
    repo: GitRepositoryView,
    path: string,
  ): Promise<MemoryFile> {
    if (!isMemoryPath(path))
      throw new MemoryError(
        'INVALID_ARGUMENT',
        'MEMORY_PATH_INVALID',
        `${path} is not a file of ${MEMORY_DIR}.`,
      );
    const memory = await readRepository(repo);
    if (!memory.commitSha || !memory.ref)
      throw new MemoryError(
        'UNAVAILABLE',
        'MEMORY_UNAVAILABLE',
        `The memory of ${repo.repo} cannot be read now (${memory.unavailable ?? 'unknown'}).`,
      );
    const summary = memory.memories.find((item) => item.path === path);
    if (!summary)
      throw new MemoryError(
        'NOT_FOUND',
        'MEMORY_NOT_FOUND',
        `${repo.repo} has no memory ${path} on ${memory.ref}.`,
      );
    let parsed = blobs.get(summary.sha);
    if (!parsed) {
      try {
        const client = await deps.client(repo.id);
        const file = await client.file(repo.repo, path, memory.commitSha);
        parsed = parseMemory(file.text, summary.slug);
        blobs.set(summary.sha, parsed);
      } catch (error) {
        throw new MemoryError(
          'UNAVAILABLE',
          'MEMORY_UNAVAILABLE',
          `${repo.repo}:${path} cannot be read now (${unavailableOf(error)}).`,
        );
      }
    }
    const body = parsed.body;
    return {
      ...summary,
      body,
      ref: memory.ref,
      commitSha: memory.commitSha,
    };
  }

  return { readRepository, readFile };
}
