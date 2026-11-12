/**
 * A memo that lives a moment. Callers that ask for the same key while a computation is running share it, and for
 * `graceMs` after it settles the answer is still shared; with `graceMs` of 0 nothing is kept once it is done, so a change
 * made a moment later is never answered from the past. The Today page and the menu badge ask for the same expensive figure
 * in parallel; this makes them one read. A failed computation is forgotten, so the next caller tries again.
 */
export interface ShortMemo<T> {
  readonly get: (key: string, compute: () => Promise<T>) => Promise<T>;
  readonly size: () => number;
}

export function createShortMemo<T>(
  graceMs: number,
  now: () => number = Date.now,
): ShortMemo<T> {
  const entries = new Map<
    string,
    { value: Promise<T>; settledAt: number | null }
  >();
  const usable = (entry: { settledAt: number | null }, at: number): boolean =>
    entry.settledAt === null || at - entry.settledAt < graceMs;
  return {
    get(key, compute) {
      const at = now();
      const hit = entries.get(key);
      if (hit && usable(hit, at)) return hit.value;
      for (const [other, entry] of entries)
        if (!usable(entry, at)) entries.delete(other);
      const entry: { value: Promise<T>; settledAt: number | null } = {
        value: compute(),
        settledAt: null,
      };
      entries.set(key, entry);
      entry.value.then(
        () => {
          entry.settledAt = now();
          if (graceMs <= 0 && entries.get(key) === entry) entries.delete(key);
        },
        () => {
          // Only forget this attempt: a newer entry under the same key stays.
          if (entries.get(key) === entry) entries.delete(key);
        },
      );
      return entry.value;
    },
    size: () => entries.size,
  };
}
