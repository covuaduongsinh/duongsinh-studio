// Playbook commands must exist and obey the shared runner's limits (V0.4): no `pnpm nocobase app:test`, no test file
// that is not in the repository, no whole-repository build, check, test or typecheck.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { PLAYBOOK_DEFINITIONS } from '../../server/playbooks/definitions.js';

const root = resolve(import.meta.dirname, '../..');

/** The topics and commands `pnpm nocobase --help` lists in this application. */
const NOCOBASE_WORDS = new Set([
  'agents',
  'cli',
  'collections',
  'config',
  'db',
  'dist',
  'foundation',
  'locales',
  'package',
  'plugin',
  'scheduler',
  'secrets',
  'skills',
  'build',
  'commands',
  'dev',
  'info',
  'start',
]);

/** `pnpm build|check|test|lint|typecheck` with no script suffix (`check:packages` is a different, light script). */
const WHOLE_REPOSITORY =
  /\bpnpm\s+(?:run\s+)?(?:build|check|test|lint|typecheck)\b(?!:)/u;

const commands = PLAYBOOK_DEFINITIONS.flatMap((playbook) =>
  playbook.defaultCriteria
    .filter((criterion) => criterion.checkKind === 'command')
    .map((criterion) => ({
      slug: playbook.slug,
      value: criterion.checkValue ?? '',
    })),
);

describe('playbook commands', () => {
  it('keeps each playbook command criterion non-empty', () => {
    for (const command of commands) expect(command.value.trim()).not.toBe('');
  });

  it.each(commands)(
    '$slug: "$value" is not a whole-repository run',
    ({ value }) => {
      expect(value).not.toMatch(WHOLE_REPOSITORY);
      expect(value).not.toContain('app:test');
    },
  );

  it.each(commands)(
    '$slug: "$value" uses a real nocobase command',
    ({ value }) => {
      const match = /\bpnpm\s+nocobase\s+([\w:-]+)/u.exec(value);
      if (match) expect(NOCOBASE_WORDS.has(match[1] ?? '')).toBe(true);
    },
  );

  it('only runs vitest on a named file', () => {
    for (const { value } of commands) {
      if (/\bvitest\b/u.test(value))
        expect(value).toMatch(/\bvitest\s+run\s+\S+\.test\.tsx?\b/u);
    }
  });

  it('never tells the agent to run a whole-repository command in its steps', () => {
    for (const playbook of PLAYBOOK_DEFINITIONS) {
      // Allowed only in a sentence that forbids it; steps that start with the command are rejected.
      const runs = playbook.instructions
        .split('\n')
        .filter((line) => WHOLE_REPOSITORY.test(line))
        .filter((line) => !/không|cấm|never|not/iu.test(line));
      expect({ slug: playbook.slug, runs }).toEqual({
        slug: playbook.slug,
        runs: [],
      });
    }
  });

  it('only mentions test files that exist in this repository', () => {
    const missing: string[] = [];
    for (const playbook of PLAYBOOK_DEFINITIONS) {
      const text = JSON.stringify([
        playbook.instructions,
        playbook.defaultCriteria,
      ]);
      for (const path of text.match(/tests\/[\w./-]+\.test\.tsx?/gu) ?? [])
        if (!existsSync(resolve(root, path)))
          missing.push(`${playbook.slug}: ${path}`);
    }
    expect(missing).toEqual([]);
  });
});
