/**
 * The agents plugin claims queued runs by `priority` (lower first), then by age. An issue's own priority decides where
 * its runs wait, so with one runner slot an urgent issue is not stuck behind older, less important ones (M1.3).
 * The order matches the projects plugin's: urgent, high, medium, low, none.
 */
const ORDER = ['urgent', 'high', 'medium', 'low', 'none'] as const;

/** Run priority of an issue priority; a missing or unknown one counts as none, so it never jumps the queue. */
export function runPriorityOf(priority: string | null | undefined): number {
  const rank = ORDER.indexOf(priority as (typeof ORDER)[number]);
  return rank === -1 ? ORDER.length - 1 : rank;
}
