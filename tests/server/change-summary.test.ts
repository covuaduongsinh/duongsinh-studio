// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  createSummaryCache,
  summarizeChanges,
} from '../../server/changes/summary.js';

// T7 (plan T): what a pull request changes, in a few numbers a person can read before deciding.
const patch = (added: number, removed: number) =>
  [
    '@@ -1,3 +1,3 @@',
    ...Array.from({ length: removed }, (_, i) => `-old ${i}`),
    ...Array.from({ length: added }, (_, i) => `+new ${i}`),
    ' context',
  ].join('\n');

describe('summarizeChanges', () => {
  const files = [
    { filename: 'server/routes/a.ts', patch: patch(10, 2) },
    { filename: 'server/routes/b.ts', patch: patch(3, 0) },
    { filename: 'client/pages/x.tsx', patch: patch(1, 1) },
    { filename: 'package.json', patch: patch(1, 1) },
    { filename: 'logo.png' },
  ];

  it('counts files and lines, and groups by the first two directories', () => {
    const summary = summarizeChanges(files, ['package.json']);
    expect(summary.files).toBe(5);
    expect(summary.additions).toBe(15);
    expect(summary.deletions).toBe(4);
    expect(summary.groups).toEqual([
      { directory: 'server/routes', files: 2, additions: 13, deletions: 2 },
      { directory: 'client/pages', files: 1, additions: 1, deletions: 1 },
      { directory: '.', files: 2, additions: 1, deletions: 1 },
    ]);
  });

  it('flags the sensitive files by the project’s patterns', () => {
    expect(summarizeChanges(files, ['package.json']).sensitive).toEqual([
      'package.json',
    ]);
    expect(summarizeChanges(files, ['server/**']).sensitive).toEqual([
      'server/routes/a.ts',
      'server/routes/b.ts',
    ]);
  });

  it('does not count the diff headers as changed lines', () => {
    const header = ['--- a/x', '+++ b/x', '@@ -1 +1 @@', '-a', '+b'].join('\n');
    const summary = summarizeChanges([{ filename: 'x', patch: header }], []);
    expect([summary.additions, summary.deletions]).toEqual([1, 1]);
  });
});

describe('the summary cache', () => {
  it('answers from memory for the same head and reads again for a new one', async () => {
    const cache = createSummaryCache<number>(2);
    let reads = 0;
    const read = async () => {
      reads += 1;
      return reads;
    };
    expect(await cache.get('pr1:sha1', read)).toBe(1);
    expect(await cache.get('pr1:sha1', read)).toBe(1);
    expect(await cache.get('pr1:sha2', read)).toBe(2);
    expect(reads).toBe(2);
    // The oldest goes when it is full.
    await cache.get('pr2:sha1', read);
    expect(await cache.get('pr1:sha1', read)).toBe(4);
  });
});
