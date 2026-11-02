/**
 * Project memory files (`.nb-studio/memory/<slug>.md`), in the format NocoBase's own repository keeps them: a front
 * matter of `name`, `description`, `type` (`feedback`, `project` or `reference`) and `modified` (a date), then a
 * Markdown body. Agents write them in their pull requests; Studio only reads them.
 */

export const MEMORY_DIR = '.nb-studio/memory';
/** How many memories one repository keeps; more are listed as left out. */
export const MEMORY_LIMIT = 50;
/** A memory's size limit in bytes; a larger one is still read and shown, marked oversize. */
export const MEMORY_MAX_BYTES = 4096;

export const MEMORY_TYPES = ['feedback', 'project', 'reference'] as const;
export type MemoryType = (typeof MEMORY_TYPES)[number];

export interface ParsedMemory {
  readonly name: string;
  readonly description: string;
  /** Null when the front matter names no type, or one outside `MEMORY_TYPES`. */
  readonly type: MemoryType | null;
  /** As written (`2026-10-29`); null when missing. */
  readonly modified: string | null;
  readonly body: string;
  /** What is wrong with the front matter, for the page to say; empty when nothing is. */
  readonly problems: readonly string[];
}

/** `slug.md` inside the memory directory, nothing nested, nothing climbing out. */
const MEMORY_PATH = /^\.nb-studio\/memory\/[\w.-]+\.md$/u;

export function isMemoryPath(path: string): boolean {
  return MEMORY_PATH.test(path) && !path.includes('..');
}

const unquote = (value: string): string => {
  const trimmed = value.trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  )
    return trimmed.slice(1, -1);
  return trimmed;
};

export function parseMemory(text: string, fallbackName: string): ParsedMemory {
  const normalized = text.replace(/^\u{FEFF}/u, '').replace(/\r\n?/gu, '\n');
  const problems: string[] = [];
  const fields = new Map<string, string>();
  let body = normalized;
  const match = /^---\n([\s\S]*?)\n---(?:\n|$)/u.exec(normalized);
  if (match) {
    for (const line of match[1].split('\n')) {
      const colon = line.indexOf(':');
      if (colon <= 0) continue;
      fields.set(line.slice(0, colon).trim(), unquote(line.slice(colon + 1)));
    }
    body = normalized.slice(match[0].length);
  } else problems.push('noFrontMatter');

  const name = fields.get('name') || '';
  if (!name && match) problems.push('noName');
  const rawType = fields.get('type') ?? '';
  const type = (MEMORY_TYPES as readonly string[]).includes(rawType)
    ? (rawType as MemoryType)
    : null;
  if (match && !type) problems.push('unknownType');
  return {
    name: name || fallbackName,
    description: fields.get('description') ?? '',
    type,
    modified: fields.get('modified') || null,
    body: body.trim(),
    problems,
  };
}
