// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
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
