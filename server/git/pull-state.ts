import type { GitHubCheck } from './github.js';

/** What the checks of a pull request's head say, as stored (`dsPullRequests.ciState`). */
export type CiState = 'pending' | 'passed' | 'failed' | 'missing';
export type Mergeability = 'clean' | 'conflicts' | 'blocked' | 'unknown';
export type PullState = 'open' | 'closed' | 'merged';
export type ChecksSource = 'host' | 'external' | 'agent';

/** Why a pull request cannot be merged from Studio (the Studio demo's `mergeBlocker`). */
export type MergeBlocker =
  | 'merged'
  | 'closed'
  | 'draft'
  | 'conflicts'
  | 'computing'
  | 'ciPending'
  | 'ciFailed'
  | 'ciMissing'
  | 'protected';

/** The blockers "Merge anyway" (`force` with a reason) may override; the host still decides. */
export const FORCEABLE_BLOCKERS: ReadonlySet<MergeBlocker> = new Set([
  'computing',
  'ciPending',
  'ciFailed',
  'ciMissing',
  'protected',
]);

/**
 * The checks' verdict. With required checks only those count, and one that has not reported yet is pending; without,
 * every check counts. No check at all is `missing`.
 */
export function ciStateOf(
  checks: readonly Pick<GitHubCheck, 'name' | 'outcome'>[],
  required: readonly string[],
): CiState {
  const relevant = required.length
    ? checks.filter((check) => required.includes(check.name))
    : checks;
  if (relevant.some((check) => check.outcome === 'failure')) return 'failed';
  if (relevant.some((check) => check.outcome === 'pending')) return 'pending';
  if (required.some((name) => !checks.some((check) => check.name === name)))
    return 'pending';
  return relevant.length === 0 ? 'missing' : 'passed';
}

/** GitHub's `mergeable_state` in Studio's words. */
export function mergeabilityOf(mergeableState: string | null): Mergeability {
  switch (mergeableState) {
    case 'clean':
    case 'unstable':
    case 'has_hooks':
      return 'clean';
    case 'dirty':
      return 'conflicts';
    case 'blocked':
    case 'behind':
    case 'draft':
      return 'blocked';
    default:
      return 'unknown';
  }
}

export function mergeBlockerOf(pull: {
  readonly state: PullState;
  readonly draft: boolean;
  readonly mergeability: Mergeability;
  readonly ciState: CiState;
  readonly checksSource: ChecksSource;
}): MergeBlocker | null {
  if (pull.state === 'merged') return 'merged';
  if (pull.state === 'closed') return 'closed';
  if (pull.draft) return 'draft';
  if (pull.mergeability === 'conflicts') return 'conflicts';
  if (pull.ciState === 'failed') return 'ciFailed';
  if (pull.ciState === 'pending') return 'ciPending';
  if (pull.ciState === 'missing' && pull.checksSource === 'host')
    return 'ciMissing';
  if (pull.mergeability === 'unknown') return 'computing';
  if (pull.mergeability === 'blocked') return 'protected';
  return null;
}

/** The issue identifiers a pull request names: its head branch after the prefix, then any `DS-12` in its title. */
export function issueKeysOf(
  pull: { readonly headRef: string; readonly title: string },
  branchPrefix: string,
): { readonly key: string; readonly by: 'branch' | 'title' }[] {
  const keys: { key: string; by: 'branch' | 'title' }[] = [];
  if (branchPrefix && pull.headRef.startsWith(branchPrefix)) {
    const key = pull.headRef.slice(branchPrefix.length);
    if (/^[A-Za-z][A-Za-z0-9]*-\d+$/u.test(key))
      keys.push({ key, by: 'branch' });
  }
  for (const match of pull.title.matchAll(/\b([A-Z][A-Z0-9]*-\d+)\b/gu))
    if (!keys.some((known) => known.key === match[1]))
      keys.push({ key: match[1], by: 'title' });
  return keys;
}
