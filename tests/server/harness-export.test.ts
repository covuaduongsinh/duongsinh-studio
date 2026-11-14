// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  HARNESS_DIR,
  addIndexRow,
  buildHarnessFiles,
  driftOf,
  scanHarnessFiles,
} from '../../server/harness-export/build.js';

// T4 (plan T): the rules Studio keeps travel with the repository, as files a person can read and a PR can review.
const input = {
  projectName: 'Sandbox',
  skills: [
    {
      slug: 'ds-app-rules',
      name: 'App rules',
      content: '# Rules\nUse tokens.',
    },
  ],
  lessons: [
    {
      rule: 'Always write a down migration.',
      mistake: 'Forgot down.',
      tag: 'migration',
    },
  ],
  playbooks: [
    {
      slug: 'add-crud',
      name: 'Add CRUD',
      description: 'A table with its API.',
      instructions: 'Make the migration first.',
    },
  ],
  criteria: [
    {
      text: 'Tests pass',
      checkKind: 'test',
      checkValue: 'pnpm exec vitest run x',
    },
  ],
};

describe('buildHarnessFiles', () => {
  it('writes the skills, lessons, playbooks, criteria, the rule file and the manifest, never .agents/skills', () => {
    const files = buildHarnessFiles(input);
    const paths = files.map((file) => file.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        `${HARNESS_DIR}/skills/ds-app-rules/SKILL.md`,
        `${HARNESS_DIR}/lessons.md`,
        `${HARNESS_DIR}/playbooks/add-crud.md`,
        `${HARNESS_DIR}/criteria-template.md`,
        `${HARNESS_DIR}/manifest.json`,
        '.agents/rules/ds-harness.md',
      ]),
    );
    expect(paths.some((path) => path.startsWith('.agents/skills/'))).toBe(
      false,
    );
    const lessons = files.find((file) => file.path.endsWith('lessons.md'))!;
    expect(lessons.content).toContain('generated-by: duongsinh-studio');
    expect(lessons.content).toMatch(/hash: [0-9a-f]{64}/u);
    expect(lessons.content).toContain('Always write a down migration.');
  });

  it('gives the same files for the same input, and another revision when anything changes', () => {
    const a = buildHarnessFiles(input);
    const b = buildHarnessFiles(input);
    expect(a).toEqual(b);
    const manifest = (files: typeof a) =>
      JSON.parse(
        files.find((f) => f.path.endsWith('manifest.json'))!.content,
      ) as {
        revision: string;
      };
    const changed = buildHarnessFiles({
      ...input,
      lessons: [{ rule: 'Another rule.', mistake: 'x', tag: 't' }],
    });
    expect(manifest(changed).revision).not.toBe(manifest(a).revision);
  });
});

describe('scanHarnessFiles', () => {
  it('counts what looks like a secret without returning it', () => {
    const clean = buildHarnessFiles(input);
    expect(scanHarnessFiles(clean)).toEqual({ count: 0, paths: [] });
    const dirty = buildHarnessFiles({
      ...input,
      lessons: [
        {
          rule: 'Token ghp_' + 'a'.repeat(36) + ' leaked.',
          mistake: 'x',
          tag: 't',
        },
      ],
    });
    const result = scanHarnessFiles(dirty);
    expect(result.count).toBeGreaterThan(0);
    expect(result.paths).toEqual([`${HARNESS_DIR}/lessons.md`]);
    expect(JSON.stringify(result)).not.toContain('ghp_');
  });
});

describe('addIndexRow', () => {
  const agentsMd =
    '# App\n\n## Index\n\n| Read | When |\n| --- | --- |\n| [a](a.md) | A |\n';
  it('adds one row to the index, once', () => {
    const once = addIndexRow(agentsMd)!;
    expect(once).toContain('.agents/rules/ds-harness.md');
    expect(addIndexRow(once)).toBeNull();
  });
  it('leaves a file with no index table alone', () => {
    expect(addIndexRow('# App\n')).toBeNull();
  });
});

describe('driftOf', () => {
  const files = buildHarnessFiles(input);
  const repo = new Map(files.map((file) => [file.path, file.content]));
  it('is clean when the repository has what Studio would write', () => {
    expect(driftOf(files, repo)).toEqual({
      missing: [],
      edited: [],
      outdated: false,
    });
  });
  it('reports a file edited by hand, a missing one, and an older revision', () => {
    const edited = new Map(repo);
    edited.set(
      `${HARNESS_DIR}/lessons.md`,
      repo.get(`${HARNESS_DIR}/lessons.md`) + '\nhand edit',
    );
    edited.delete(`${HARNESS_DIR}/criteria-template.md`);
    const result = driftOf(files, edited);
    expect(result.edited).toEqual([`${HARNESS_DIR}/lessons.md`]);
    expect(result.missing).toEqual([`${HARNESS_DIR}/criteria-template.md`]);
    const newer = buildHarnessFiles({ ...input, lessons: [] });
    expect(driftOf(newer, repo).outdated).toBe(true);
  });
});
