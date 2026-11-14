// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import {
  createReviewBatcher,
  reviewHasContent,
  reviewKey,
  reviewsReactionText,
  reviewFromPayload,
  reviewReactionText,
} from '../../server/reactions/review-comments.js';

// T1.3 (plan T): a person's inline review comments wake the pull request's author, a bot's or the agent's own do not.
const payload = (over: Record<string, unknown> = {}) => ({
  action: 'submitted',
  review: {
    id: 77,
    state: 'changes_requested',
    body: 'Please fix the naming.',
    commit_id: 'abc123',
    author_association: 'MEMBER',
    user: { login: 'khoa', type: 'User' },
  },
  pull_request: { number: 9, user: { login: 'ds-agent[bot]' } },
  sender: { login: 'khoa', type: 'User' },
  ...over,
});

describe('reviewFromPayload', () => {
  it('accepts a submitted review by a member that asks for changes or comments', () => {
    expect(reviewFromPayload(payload())).toMatchObject({
      accept: true,
      reviewId: '77',
      number: 9,
      headSha: 'abc123',
    });
    expect(
      reviewFromPayload(
        payload({
          review: {
            id: 1,
            state: 'commented',
            body: '',
            commit_id: 'x',
            author_association: 'OWNER',
            user: { login: 'a', type: 'User' },
          },
        }),
      ),
    ).toMatchObject({ accept: true });
  });

  it.each([
    ['not submitted', { action: 'edited' }],
    ['a bot', { sender: { login: 'dependabot[bot]', type: 'Bot' } }],
    ['the agent itself', { sender: { login: 'ds-agent', type: 'User' } }],
    [
      'an approval',
      {
        review: {
          id: 1,
          state: 'approved',
          body: '',
          commit_id: 'x',
          author_association: 'MEMBER',
          user: { login: 'a', type: 'User' },
        },
      },
    ],
    [
      'a stranger',
      {
        review: {
          id: 1,
          state: 'changes_requested',
          body: 'x',
          commit_id: 'x',
          author_association: 'NONE',
          user: { login: 'a', type: 'User' },
        },
      },
    ],
  ])('ignores %s', (_name, over) => {
    expect(reviewFromPayload(payload(over)).accept).toBe(false);
  });
});

describe('reviewReactionText', () => {
  it('lists each comment with its file and line', () => {
    const text = reviewReactionText({
      number: 9,
      reviewer: 'khoa',
      body: 'Please fix the naming.',
      comments: [
        { path: 'server/a.ts', line: 12, body: 'rename this' },
        { path: 'server/b.ts', line: null, body: 'and this' },
      ],
    });
    expect(text).toContain('#9');
    expect(text).toContain('khoa');
    expect(text).toContain('server/a.ts:12');
    expect(text).toContain('rename this');
    expect(text).toContain('server/b.ts');
  });
});

// S1b: one person's single-comment reviews become one wake, and an empty review wakes nobody.
describe('review batches', () => {
  it('has nothing to say for a review without words and without line comments', () => {
    expect(reviewHasContent('  ', [])).toBe(false);
    expect(reviewHasContent('', [{ path: 'a.ts', line: 1, body: ' ' }])).toBe(
      false,
    );
    expect(
      reviewHasContent('', [{ path: 'a.ts', line: 1, body: 'rename' }]),
    ).toBe(true);
    expect(reviewHasContent('please fix', [])).toBe(true);
    expect(reviewKey('77')).toBe('review:77');
  });

  it('gathers the reviews of one person on one pull request into one flush', async () => {
    vi.useFakeTimers();
    try {
      const flushed: unknown[] = [];
      const batcher = createReviewBatcher({
        windowMs: 90_000,
        flush: async (batch) => {
          flushed.push(batch);
        },
      });
      const base = { issueId: 'i1', pullRequestId: 'pr1', number: 9 };
      const review = (id: string) => ({
        reviewId: id,
        body: `note ${id}`,
        comments: [],
      });
      batcher.add({ ...base, reviewer: 'Khoa', review: review('1') });
      vi.advanceTimersByTime(30_000);
      batcher.add({ ...base, reviewer: 'khoa', review: review('2') });
      batcher.add({ ...base, reviewer: 'khoa', review: review('2') });
      batcher.add({
        ...base,
        pullRequestId: 'pr2',
        reviewer: 'khoa',
        review: review('3'),
      });
      vi.advanceTimersByTime(59_999);
      expect(flushed).toHaveLength(0);
      await vi.advanceTimersByTimeAsync(1);
      expect(flushed).toHaveLength(1);
      expect((flushed[0] as { reviews: unknown[] }).reviews).toHaveLength(2);
      await vi.advanceTimersByTimeAsync(30_000);
      expect(flushed).toHaveLength(2);
      const text = reviewsReactionText({
        number: 9,
        reviewer: 'khoa',
        reviews: (flushed[0] as { reviews: never[] }).reviews,
      });
      expect(text).toMatch(/note 1[\s\S]*note 2/u);
    } finally {
      vi.useRealTimers();
    }
  });
});
