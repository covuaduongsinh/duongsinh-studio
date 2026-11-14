import { maskSecrets } from '../security/secret-patterns.js';

/** A run's log, as the profile reads it (plan T, T11). Pure: what leaves it has no secret in it. */
export interface LogEvent {
  readonly seq: number;
  readonly type: string;
  readonly tool?: string | null;
  readonly content?: string | null;
  readonly output?: string | null;
}

const flat = (event: LogEvent): string =>
  [
    event.tool ? `[${event.tool}]` : null,
    event.content ?? null,
    event.output ? `→ ${event.output}` : null,
  ]
    .filter(Boolean)
    .join(' ');

/** A window of `radius` characters on each side of the first match, secrets masked first. */
export function snippetOf(text: string, query: string, radius: number): string {
  const masked = maskSecrets(text);
  const at = masked.toLowerCase().indexOf(query.toLowerCase());
  if (at < 0) return masked.slice(0, radius * 2);
  const from = Math.max(0, at - radius);
  const to = Math.min(masked.length, at + query.length + radius);
  return `${from > 0 ? '…' : ''}${masked.slice(from, to)}${to < masked.length ? '…' : ''}`;
}

/** What a new run is told of the old one: the last `limit` events up to and including `seq`, each cut short. */
export function contextFrom(
  events: readonly LogEvent[],
  seq: number,
  limit: number,
): string {
  return events
    .filter((event) => event.seq <= seq)
    .slice(-limit)
    .map(
      (event) =>
        `#${event.seq} ${event.type}: ${snippetOf(flat(event), '', 300)}`,
    )
    .join('\n');
}
