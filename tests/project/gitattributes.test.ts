import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const appRoot = path.resolve(
  fileURLToPath(new URL('.', import.meta.url)),
  '../..',
);

/** `git ls-files --eol` lines (`i/crlf w/lf attr/… <tab>path`), or null where this is not a Git checkout. */
function eolEntries(): string[] | null {
  try {
    return execFileSync('git', ['ls-files', '--eol', '-z'], {
      cwd: appRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .split('\0')
      .filter(Boolean);
  } catch {
    return null;
  }
}

describe('line endings', () => {
  it('asks for LF everywhere and leaves the verbatim archive alone', () => {
    const file = path.join(appRoot, '.gitattributes');
    expect(existsSync(file)).toBe(true);
    const text = readFileSync(file, 'utf8');
    expect(text).toMatch(/^\* text=auto eol=lf$/mu);
    expect(text).toMatch(/^docs\/plans\/archive\/\*\* -text$/mu);
  });

  it('keeps CRLF out of the index, except the archived plans copied as they were', () => {
    const entries = eolEntries();
    if (entries === null) return;
    const crlf = entries
      .filter((line) => line.startsWith('i/crlf'))
      .map((line) => line.split('\t')[1] ?? line)
      .filter((file) => !file.startsWith('docs/plans/archive/'));
    expect(crlf).toEqual([]);
  });
});
