/** A share as a person reads it in a generated message, such as `90%`, or `n/a` without one. */
export function percentText(value: number | null): string {
  return value === null ? 'n/a' : `${Math.round(value * 100)}%`;
}

/** A length of time in a generated message, such as `45s`, `3m`, `5h` or `2.5d`, or `n/a` without one. */
export function durationText(ms: number | null): string {
  if (ms === null) return 'n/a';
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h`;
  return `${Math.round(ms / 8_640_000) / 10}d`;
}
