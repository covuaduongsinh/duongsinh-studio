// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  ciStateOf,
  issueKeysOf,
  mergeBlockerOf,
  mergeabilityOf,
} from '../../server/git/pull-state.js';

describe('pull request state', () => {
  it('computes the checks verdict, with and without required checks', () => {
    expect(ciStateOf([], [])).toBe('missing');
    expect(ciStateOf([{ name: 'a', outcome: 'success' }], [])).toBe('passed');
    expect(
      ciStateOf(
        [
          { name: 'a', outcome: 'success' },
          { name: 'b', outcome: 'pending' },
        ],
        [],
      ),
    ).toBe('pending');
    expect(
      ciStateOf(
        [
          { name: 'a', outcome: 'failure' },
          { name: 'b', outcome: 'pending' },
        ],
        [],
      ),
    ).toBe('failed');
    // Only required checks count, and one not reported yet keeps it pending.
    expect(
      ciStateOf(
        [
          { name: 'lint', outcome: 'failure' },
          { name: 'verify', outcome: 'success' },
        ],
        ['verify'],
      ),
    ).toBe('passed');
    expect(ciStateOf([{ name: 'lint', outcome: 'success' }], ['verify'])).toBe(
      'pending',
    );
  });

  it('names the issues of a branch and a title', () => {
    expect(
      issueKeysOf({ headRef: 'agent/DS-12', title: 'Fix DS-7 too' }, 'agent/'),
    ).toEqual([
      { key: 'DS-12', by: 'branch' },
      { key: 'DS-7', by: 'title' },
    ]);
    expect(
      issueKeysOf({ headRef: 'feature/x', title: 'No key' }, 'agent/'),
    ).toEqual([]);
  });

  it('says why a pull request cannot be merged', () => {
    const open = {
      state: 'open' as const,
      draft: false,
      mergeability: mergeabilityOf('clean'),
      ciState: 'passed' as const,
      checksSource: 'host' as const,
    };
    expect(mergeBlockerOf(open)).toBeNull();
    expect(mergeBlockerOf({ ...open, state: 'merged' })).toBe('merged');
    expect(mergeBlockerOf({ ...open, draft: true })).toBe('draft');
    expect(
      mergeBlockerOf({ ...open, mergeability: mergeabilityOf('dirty') }),
    ).toBe('conflicts');
    expect(mergeBlockerOf({ ...open, ciState: 'failed' })).toBe('ciFailed');
    expect(mergeBlockerOf({ ...open, ciState: 'missing' })).toBe('ciMissing');
    expect(
      mergeBlockerOf({ ...open, ciState: 'missing', checksSource: 'agent' }),
    ).toBeNull();
    expect(
      mergeBlockerOf({ ...open, mergeability: mergeabilityOf(null) }),
    ).toBe('computing');
    expect(
      mergeBlockerOf({ ...open, mergeability: mergeabilityOf('blocked') }),
    ).toBe('protected');
  });
});
