import { describe, expect, it } from 'vitest';
import {
  CHECK_WORKFLOW,
  CHECK_WORKFLOW_PATH,
} from '../../server/setups/check-workflow.js';

describe('ds-check workflow', () => {
  it('runs on pull requests only, one at a time per pull request, within a time limit', () => {
    expect(CHECK_WORKFLOW_PATH).toBe('.github/workflows/ds-check.yml');
    expect(CHECK_WORKFLOW).toMatch(/^on:\n {2}pull_request:\n\n/mu);
    expect(CHECK_WORKFLOW).not.toMatch(/^ {2}push:/mu);
    expect(CHECK_WORKFLOW).toContain(
      'group: ds-check-${{ github.event.pull_request.number }}\n  cancel-in-progress: true',
    );
    expect(CHECK_WORKFLOW).toContain('timeout-minutes: 30');
    expect(CHECK_WORKFLOW).toContain('permissions:\n  contents: read');
  });

  it('runs the whole check, the licence check and the committed-file check, with no secret', () => {
    expect(CHECK_WORKFLOW).toContain('- run: pnpm install --frozen-lockfile');
    expect(CHECK_WORKFLOW).toContain('- run: pnpm check');
    expect(CHECK_WORKFLOW).toContain(
      `if grep -E "^\\s+'?(chessground|chessops|@lichess-org/pgn-viewer|tournament-pairings|stockfish)@" pnpm-lock.yaml; then`,
    );
    expect(CHECK_WORKFLOW).toContain('pnpm licenses list --json');
    expect(CHECK_WORKFLOW).toContain(
      'if git ls-files | grep -iE "\\.sqlite|\\.env$|config\\.yml$|\\.dump"; then',
    );
    expect(CHECK_WORKFLOW).not.toContain('secrets.');
    // Tabs are not YAML indentation.
    expect(CHECK_WORKFLOW).not.toContain('\t');
  });

  it('fails on copyleft licences without an OR, and lets LGPL and dual licences through', () => {
    const script = /node -e '\n([\s\S]*?)\n {10}' "\$RUNNER_TEMP/m.exec(
      CHECK_WORKFLOW,
    )?.[1];
    expect(script).toBeDefined();
    const copyleftOf = (licenses: Record<string, { name: string }[]>) => {
      const found = new Function(
        'licenses',
        `${(script ?? '')
          .replace('const licenses = require(process.argv[1]);', '')
          .replace(/for \(const name of copyleft\)[\s\S]*$/u, '')}
        return copyleft;`,
      ) as (input: typeof licenses) => string[];
      return found(licenses);
    };
    expect(
      copyleftOf({
        MIT: [{ name: 'a' }],
        'GPL-3.0': [{ name: 'b' }],
        'AGPL-3.0-only': [{ name: 'c' }],
        'LGPL-3.0-or-later': [{ name: 'd' }],
        '(MIT OR GPL-3.0-or-later)': [{ name: 'jszip' }],
      }),
    ).toEqual(['GPL-3.0', 'AGPL-3.0-only']);
  });
});
