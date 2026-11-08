import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CI_WORKFLOW,
  CI_WORKFLOW_PATH,
  LICENSE_GATE_JS,
} from '../../server/setups/ci-workflow.js';

/** What `pnpm licenses list --json` prints: licence expression → the packages under it. */
const gate = (licences: Record<string, { name: string }[]>) => {
  const dir = mkdtempSync(join(tmpdir(), 'lic-'));
  const file = join(dir, 'licenses.json');
  writeFileSync(file, JSON.stringify(licences));
  return spawnSync('node', ['-e', LICENSE_GATE_JS, file], {
    encoding: 'utf8',
  });
};

describe('ds-check workflow', () => {
  it('is pushed where GitHub reads workflows, for pull requests only', () => {
    expect(CI_WORKFLOW_PATH).toBe('.github/workflows/ds-check.yml');
    expect(CI_WORKFLOW).toMatch(/^on:\n {2}pull_request:/m);
    expect(CI_WORKFLOW).toContain('timeout-minutes');
    expect(CI_WORKFLOW).toContain('cancel-in-progress: true');
    expect(CI_WORKFLOW).toContain('pnpm check');
  });

  it('lists licences without --prod, because client libraries are devDependencies', () => {
    expect(CI_WORKFLOW).toContain('pnpm licenses list --json');
    expect(CI_WORKFLOW).not.toContain('--prod');
    expect(CI_WORKFLOW).toContain(LICENSE_GATE_JS);
  });

  it('passes permissive and dual-licensed packages', () => {
    const result = gate({
      MIT: [{ name: 'a' }],
      'Apache-2.0': [{ name: 'b' }],
      '(MIT OR GPL-3.0-or-later)': [{ name: 'jszip' }],
      'EPL-2.0 OR GPL-3.0-or-later': [{ name: 'elkjs' }],
    });
    expect(result.status).toBe(0);
  });

  it.each([
    'GPL-3.0',
    'GPL-3.0-or-later',
    'AGPL-3.0',
    'LGPL-2.1',
    'GPL-2.0 AND MIT',
  ])('fails %s with no alternative, and names it', (licence) => {
    const result = gate({ MIT: [{ name: 'a' }], [licence]: [{ name: 'x' }] });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(licence);
  });

  it('still blocks the GPL chess libraries by name', () => {
    for (const name of [
      'chessground',
      'chessops',
      '@lichess-org/pgn-viewer',
      'tournament-pairings',
      'stockfish',
    ])
      expect(CI_WORKFLOW).toContain(name);
  });

  it('runs the licence step as the shell would', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lic-'));
    writeFileSync(
      join(dir, 'licenses.json'),
      JSON.stringify({ 'GPL-3.0': [{ name: 'x' }] }),
    );
    const step = CI_WORKFLOW.split('\n')
      .filter((line) => line.includes('node -e'))
      .map((line) => line.trim())[0];
    const result = spawnSync('bash', ['-c', step ?? 'exit 99'], {
      encoding: 'utf8',
      env: { ...process.env, RUNNER_TEMP: dir },
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('GPL-3.0');
  });
});
