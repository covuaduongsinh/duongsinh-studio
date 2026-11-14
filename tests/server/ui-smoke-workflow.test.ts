// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  UI_SMOKE_PAGES_PATH,
  UI_SMOKE_SCRIPT,
  UI_SMOKE_WORKFLOW,
  UI_SMOKE_WORKFLOW_PATH,
} from '../../server/setups/ui-smoke-workflow.js';

// T5 (plan T): a smoke test of the interface that runs on Actions, with no secret and a time limit.
describe('ds-ui-smoke workflow', () => {
  it('is its own workflow, for pull requests that touch the interface, with a 15 minute limit', () => {
    expect(UI_SMOKE_WORKFLOW_PATH).toBe('.github/workflows/ds-ui-smoke.yml');
    expect(UI_SMOKE_WORKFLOW).toMatch(/^on:\n {2}pull_request:\n {4}paths:/mu);
    expect(UI_SMOKE_WORKFLOW).toContain('timeout-minutes: 15');
    expect(UI_SMOKE_WORKFLOW).toContain('cancel-in-progress: true');
    expect(UI_SMOKE_WORKFLOW).toContain("'client/**'");
  });

  it('uses no secret and only reads the repository', () => {
    expect(UI_SMOKE_WORKFLOW).not.toMatch(/secrets\./u);
    expect(UI_SMOKE_WORKFLOW).toMatch(/permissions:\n {2}contents: read/u);
  });

  it('runs the built application on the runner against a temporary database and uploads the screenshots', () => {
    expect(UI_SMOKE_WORKFLOW).toContain('pnpm build');
    expect(UI_SMOKE_WORKFLOW).toContain('pnpm nocobase config init');
    expect(UI_SMOKE_WORKFLOW).toContain('api/healthz');
    expect(UI_SMOKE_WORKFLOW).toContain('actions/upload-artifact@v4');
    expect(UI_SMOKE_WORKFLOW).not.toMatch(/ssh|docker\.sock|dokploy/iu);
  });

  it('embeds the script whole, so one file is the whole proposal', () => {
    for (const line of UI_SMOKE_SCRIPT.split('\n').filter(Boolean))
      expect(UI_SMOKE_WORKFLOW).toContain(line);
    expect(UI_SMOKE_WORKFLOW).toContain(UI_SMOKE_PAGES_PATH);
  });
});

describe('the workflow as YAML', () => {
  it('keeps the script inside its run block, so the shell sees it flush left', () => {
    // A `run: |` block ends at the first non-blank line indented no more than `run:`; YAML strips the common indent.
    const lines = UI_SMOKE_WORKFLOW.split('\n');
    const start = lines.findIndex((line) => line.includes("<<'SMOKE'"));
    let header = start;
    while (header > 0 && !/^\s+run: \|$/u.test(lines[header]!)) header -= 1;
    const runIndent = lines[header]!.search(/\S/u);
    const block: string[] = [];
    for (const line of lines.slice(header + 1)) {
      if (line.trim() !== '' && line.search(/\S/u) <= runIndent) break;
      block.push(line);
    }
    const common = Math.min(
      ...block
        .filter((line) => line.trim() !== '')
        .map((line) => line.search(/\S/u)),
    );
    const shell = block.map((line) => line.slice(common)).join('\n');
    const body = shell.split("<<'SMOKE'\n")[1]!.split('\nSMOKE')[0]!;
    expect(body).toBe(UI_SMOKE_SCRIPT.replace(/\n$/u, ''));
    expect(shell).toContain('\nSMOKE\n');
  });
});

describe('the smoke script', () => {
  it('is valid JavaScript, opens both widths and fails on page errors, console errors and blank pages', () => {
    const dir = mkdtempSync(join(tmpdir(), 'smoke-'));
    const file = join(dir, 'smoke.mjs');
    writeFileSync(file, UI_SMOKE_SCRIPT);
    expect(
      spawnSync('node', ['--check', file], { encoding: 'utf8' }).status,
    ).toBe(0);
    expect(UI_SMOKE_SCRIPT).toContain('width: 390, height: 844');
    expect(UI_SMOKE_SCRIPT).toContain('width: 1280, height: 800');
    expect(UI_SMOKE_SCRIPT).toContain("'pageerror'");
    expect(UI_SMOKE_SCRIPT).toContain("message.type() === 'error'");
    expect(UI_SMOKE_SCRIPT).toContain('blank page');
    expect(UI_SMOKE_SCRIPT).toContain('process.exit(1)');
  });
});
