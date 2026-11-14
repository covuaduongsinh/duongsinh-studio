import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
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

// S4 (plan S): the `verify` job runs the commands Studio fixed and submits their exit codes with the repository's CI key.
const hasJq = spawnSync('jq', ['--version']).status === 0;

describe('ds-check verify job', () => {
  const lines = CI_WORKFLOW.split('\n');
  const start = lines.findIndex((l) => l.startsWith('  verify:'));
  const verify = lines.slice(start).join('\n');

  it('waits for the check, and only the verify job holds the key', () => {
    expect(start).toBeGreaterThan(0);
    expect(verify).toContain('needs: check');
    expect(CI_WORKFLOW.slice(0, CI_WORKFLOW.indexOf('  verify:'))).not.toMatch(
      /secrets\./u,
    );
    expect(verify).toContain('secrets.DS_STUDIO_API_KEY');
    expect(verify).toContain('vars.DS_STUDIO_API');
  });

  /** The step's script as the shell sees it, run against a `curl` that answers from a plan and records what is posted. */
  const run = (input: {
    branch: string;
    sha: string;
    plan: object;
    api?: string;
    key?: string;
  }) => {
    const dir = mkdtempSync(join(tmpdir(), 'verify-'));
    const runStart = lines.findIndex(
      (l, i) => i > start && l.trimEnd() === '        run: |',
    );
    const script = [];
    for (const line of lines.slice(runStart + 1)) {
      if (line.trim() !== '' && !line.startsWith('          ')) break;
      script.push(line.slice(10));
    }
    writeFileSync(join(dir, 'plan.json'), JSON.stringify(input.plan));
    writeFileSync(
      join(dir, 'curl'),
      `#!/bin/bash\nfor a in "$@"; do last="$a"; done\nif [[ "$*" == *"-X POST"* ]]; then\n  while [ $# -gt 0 ]; do [ "$1" = "-d" ] && printf '%s' "$2" > "${dir}/posted.json"; shift; done\nelse\n  cat "${dir}/plan.json"\nfi\n`,
    );
    chmodSync(join(dir, 'curl'), 0o755);
    const result = spawnSync('bash', ['-e', '-c', script.join('\n')], {
      encoding: 'utf8',
      env: {
        PATH: `${dir}:${process.env.PATH ?? ''}`,
        API: input.api ?? 'https://studio.test/main/api',
        KEY: input.key ?? 'secret-key',
        BRANCH: input.branch,
        SHA: input.sha,
      },
    });
    let posted: unknown = null;
    try {
      posted = JSON.parse(readFileSync(join(dir, 'posted.json'), 'utf8'));
    } catch {
      // Nothing was posted.
    }
    return { result, posted };
  };
  const plan = (headSha: string) => ({
    data: {
      issueId: 'i-1',
      headSha,
      criteria: [
        { id: 'c-ok', text: 't', checkKind: 'test', command: 'echo fine' },
        {
          id: 'c-bad',
          text: 'u',
          checkKind: 'command',
          command: 'echo broken; exit 3',
        },
        { id: 'c-ci', text: 'v', checkKind: 'ci', command: null },
      ],
    },
  });

  // The script uses `jq`, which the GitHub runner has; a machine without it skips the two that run the script.
  it.skipIf(!hasJq)(
    'runs each command Studio fixed and submits the exit codes of the head it verified',
    () => {
      const { result, posted } = run({
        branch: 'agent/DS-12',
        sha: 'abc',
        plan: plan('abc'),
      });
      expect(result.status).toBe(0);
      const body = posted as {
        issueId: string;
        headSha: string;
        items: { criterionId: string; exitCode: number; output: string }[];
      };
      expect(body.issueId).toBe('i-1');
      expect(body.headSha).toBe('abc');
      expect(body.items.map((i) => [i.criterionId, i.exitCode])).toEqual([
        ['c-ok', 0],
        ['c-bad', 3],
      ]);
      expect(body.items[1]!.output).toContain('broken');
    },
  );

  it.skipIf(!hasJq)(
    'submits nothing for another head, a branch that is no issue, or a repository without the key',
    () => {
      for (const input of [
        { branch: 'agent/DS-12', sha: 'new', plan: plan('old') },
        { branch: 'feature/login-page', sha: 'abc', plan: plan('abc') },
        { branch: 'agent/DS-12', sha: 'abc', plan: plan('abc'), key: '' },
        { branch: 'agent/DS-12', sha: 'abc', plan: plan('abc'), api: '' },
      ]) {
        const { result, posted } = run(input);
        expect(result.status).toBe(0);
        expect(posted).toBeNull();
      }
    },
  );
});
