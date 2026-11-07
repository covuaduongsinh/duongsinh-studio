import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BUILTIN_SKILLS } from '../../server/agents/builtin-skills.js';
import { readTemplateRelease } from '../../server/setups/template-version.js';

describe('template release', () => {
  it('reads the pinned template from the application package.json', () => {
    const release = readTemplateRelease();
    expect(release.package).toBe('@nocobase/app-template-default');
    expect(release.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('walks up to the nearest package.json that declares it', () => {
    const root = mkdtempSync(join(tmpdir(), 'tpl-'));
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({
        nocobase: { templatePackage: '@x/t', defaultTemplateVersion: '9.9.9' },
      }),
    );
    const deep = join(root, 'dist', 'server', 'setups');
    mkdirSync(deep, { recursive: true });
    expect(readTemplateRelease(deep)).toEqual({
      package: '@x/t',
      version: '9.9.9',
    });
  });

  it('refuses to fall back to latest when nothing declares it', () => {
    const root = mkdtempSync(join(tmpdir(), 'tpl-'));
    writeFileSync(join(root, 'package.json'), '{}');
    expect(() => readTemplateRelease(root)).toThrow(/templatePackage/);
  });
});

describe('built-in skills', () => {
  it('carries the application rules into every new project', () => {
    const rules = BUILTIN_SKILLS.find((skill) => skill.slug === 'ds-app-rules');
    expect(rules?.reach).toBe('project');
    expect(rules?.content).toContain('pnpm check');
    expect(rules?.content).toContain('react-chessboard');
  });
});
