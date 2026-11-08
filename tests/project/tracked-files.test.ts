import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const appRoot = path.resolve(
  fileURLToPath(new URL('.', import.meta.url)),
  '../..',
);

/**
 * `git ls-files -s` lists `<mode> <object> <stage>\t<path>` for every tracked path, or null where the application is not a
 * Git checkout (a generated application has no history until its owner makes one).
 */
function trackedEntries(): { mode: string; file: string }[] | null {
  try {
    return execFileSync('git', ['ls-files', '-s', '-z'], {
      cwd: appRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .split('\0')
      .filter(Boolean)
      .map((line) => {
        const [info = '', file = ''] = line.split('\t');
        return { mode: info.split(' ')[0] ?? '', file };
      });
  } catch {
    return null;
  }
}

describe('tracked files', () => {
  // A symlink committed from a worktree (`node_modules` pointing at another checkout's) broke `pnpm install` on every clone.
  it('has no symbolic link, so nothing outside the repository leaks in', () => {
    const entries = trackedEntries();
    if (!entries) return;
    expect(entries.filter((entry) => entry.mode === '120000')).toEqual([]);
  });

  it('does not track node_modules at any depth', () => {
    const entries = trackedEntries();
    if (!entries) return;
    expect(
      entries.filter((entry) => entry.file.split('/').includes('node_modules')),
    ).toEqual([]);
  });
});
