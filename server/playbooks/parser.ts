import type { ParsedPlaybookInvocation } from './types.js';

/**
 * Parses playbook invocations from a body of text (issue description or comment).
 * Syntax: `!<slug>` or `!<slug> key1=value1 key2="value 2"`
 */
export function parsePlaybookInvocations(
  text: string,
): ParsedPlaybookInvocation[] {
  if (!text || typeof text !== 'string') return [];

  // Match !slug followed by optional arguments on the same line
  const regex = /(?:^|\s)!([a-zA-Z0-9_-]+)(?:[ \t]+([^\r\n]*))?/gmu;
  const invocations: ParsedPlaybookInvocation[] = [];

  for (const match of text.matchAll(regex)) {
    const rawSlug = match[1];
    if (!rawSlug) continue;
    const slug = rawSlug.toLowerCase();
    const rawArgs = match[2]?.trim() ?? '';
    const params: Record<string, string> = {};

    if (rawArgs) {
      // Parse key=value pairs, respecting quotes
      const paramRegex =
        /([a-zA-Z0-9_-]+)=(?:"([^"]*)"|'([^']*)'|([^\s"']+))/gu;
      for (const pMatch of rawArgs.matchAll(paramRegex)) {
        const key = pMatch[1];
        if (!key) continue;
        const val = pMatch[2] ?? pMatch[3] ?? pMatch[4] ?? '';
        params[key] = val;
      }
    }

    invocations.push({
      slug,
      params,
      rawText: match[0].trim(),
    });
  }

  return invocations;
}
