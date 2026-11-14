import { isSensitive } from '../autopilot/evaluator.js';

/** What a pull request changes, in numbers a person reads before deciding (plan T, T7). Pure. */
export interface ChangedFile {
  readonly filename: string;
  readonly patch?: string;
}

export interface ChangeGroup {
  readonly directory: string;
  readonly files: number;
  readonly additions: number;
  readonly deletions: number;
}

export interface ChangeSummary {
  readonly files: number;
  readonly additions: number;
  readonly deletions: number;
  readonly groups: ChangeGroup[];
  /** The files that match the project's sensitive paths. */
  readonly sensitive: string[];
}

/** Lines a patch adds and removes; the `---`/`+++` file headers and hunk markers are not changes. */
function linesOf(patch: string | undefined): {
  additions: number;
  deletions: number;
} {
  let additions = 0;
  let deletions = 0;
  for (const line of (patch ?? '').split('\n')) {
    if (line.startsWith('+++') || line.startsWith('---')) continue;
    if (line.startsWith('+')) additions += 1;
    else if (line.startsWith('-')) deletions += 1;
  }
  return { additions, deletions };
}

/** The first two directories of a path, or `.` for a file at the root. */
const directoryOf = (filename: string): string => {
  const parts = filename.split('/');
  parts.pop();
  return parts.length === 0 ? '.' : parts.slice(0, 2).join('/');
};

export function summarizeChanges(
  files: readonly ChangedFile[],
  sensitivePatterns: readonly string[],
): ChangeSummary {
  const groups = new Map<
    string,
    { files: number; additions: number; deletions: number }
  >();
  let additions = 0;
  let deletions = 0;
  for (const file of files) {
    const counted = linesOf(file.patch);
    additions += counted.additions;
    deletions += counted.deletions;
    const key = directoryOf(file.filename);
    const group = groups.get(key) ?? { files: 0, additions: 0, deletions: 0 };
    groups.set(key, {
      files: group.files + 1,
      additions: group.additions + counted.additions,
      deletions: group.deletions + counted.deletions,
    });
  }
  return {
    files: files.length,
    additions,
    deletions,
    groups: [...groups].map(([directory, group]) => ({ directory, ...group })),
    sensitive: files
      .map((file) => file.filename)
      .filter((name) => isSensitive(name, sensitivePatterns)),
  };
}

/** A small memory keyed by pull request and head, so a page that reloads does not ask GitHub again. */
export function createSummaryCache<T>(limit: number) {
  const entries = new Map<string, T>();
  return {
    async get(key: string, read: () => Promise<T>): Promise<T> {
      const hit = entries.get(key);
      if (hit !== undefined) return hit;
      const value = await read();
      entries.set(key, value);
      if (entries.size > limit) entries.delete(entries.keys().next().value!);
      return value;
    },
  };
}
