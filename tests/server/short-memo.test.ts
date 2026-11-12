import { describe, expect, it, vi } from 'vitest';

import { createShortMemo } from '../../server/routes/short-memo.js';

const later = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('short memo', () => {
  it('shares one computation among callers that ask while it runs', async () => {
    const memo = createShortMemo<number>(0);
    let release: (value: number) => void = () => {};
    const compute = vi.fn(
      () => new Promise<number>((resolve) => (release = resolve)),
    );
    const calls = [
      memo.get('k', compute),
      memo.get('k', compute),
      memo.get('k', compute),
    ];
    release(7);
    expect(await Promise.all(calls)).toEqual([7, 7, 7]);
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it('keeps nothing once the computation is done when the grace is zero', async () => {
    const memo = createShortMemo<number>(0);
    const compute = vi.fn(async () => 1);
    await memo.get('k', compute);
    await later();
    expect(memo.size()).toBe(0);
    await memo.get('k', compute);
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it('keeps an answer for the grace period when it is positive, then lets it go', async () => {
    let clock = 0;
    const memo = createShortMemo<number>(2000, () => clock);
    const compute = vi.fn(async () => clock);
    expect(await memo.get('k', compute)).toBe(0);
    await later();
    clock = 1999;
    expect(await memo.get('k', compute)).toBe(0);
    clock = 4000;
    expect(await memo.get('k', compute)).toBe(4000);
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it('keeps different keys apart', async () => {
    const memo = createShortMemo<string>(0);
    expect(await memo.get('a', async () => 'one')).toBe('one');
    expect(await memo.get('b', async () => 'two')).toBe('two');
  });

  it('forgets a failed computation so the next caller tries again', async () => {
    const memo = createShortMemo<number>(5000, () => 0);
    await expect(
      memo.get('k', async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    await later();
    expect(await memo.get('k', async () => 5)).toBe(5);
  });
});
