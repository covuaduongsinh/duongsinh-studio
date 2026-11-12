// Follow-ups and the menu's counts, with `server/routes/inbox.ts` answered by the fixture below.
import {
  answerApi,
  renderWithApp,
  type ApiCall,
} from '@nocobase/app-testing/client';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';

import packageMetadata from '../../package.json' with { type: 'json' };
import enUS from '../../client/locales/en-US.js';
import FollowUpsPage from '../../client/pages/follow-ups/index.js';
import { useNavigationCounts } from '../../client/hooks/use-follow-ups.js';

let answer: (call: ApiCall) => unknown;
const calls: ApiCall[] = [];

function render(node: ReactElement) {
  return renderWithApp(node, {
    namespace: packageMetadata.name,
    namespaces: { [packageMetadata.name]: enUS },
    fetch: answerApi((call: ApiCall) => {
      calls.push(call);
      return answer(call);
    }),
  });
}

const issue = (overrides: Record<string, unknown>) => ({
  id: '1',
  identifier: 'PM-1',
  title: 'Việc một',
  statusKey: 'in_review',
  executorName: 'Claude',
  lastActivityAt: '2026-11-06T09:00:00.000Z',
  owned: true,
  followed: true,
  unread: 2,
  ...overrides,
});

describe('follow-ups', () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it('groups issues, shows what is new and unfollows', async () => {
    answer = (call) =>
      call.method === 'POST'
        ? { data: { followed: false } }
        : {
            data: {
              issues: [
                issue({}),
                issue({
                  id: '2',
                  identifier: 'PM-2',
                  title: 'Việc hai',
                  statusKey: 'in_progress',
                  unread: 0,
                }),
              ],
              counts: { in_review: 1, in_progress: 1, blocked: 0, backlog: 0 },
              truncated: false,
            },
          };
    render(<FollowUpsPage />);
    const review = await screen.findByRole('region', {
      name: 'Waiting for acceptance',
    });
    expect(within(review).getByText('2 new')).toBeTruthy();
    const working = screen.getByRole('region', { name: 'In progress' });
    expect(within(working).queryByText(/new$/)).toBeNull();
    await userEvent.click(
      within(review).getByRole('button', { name: 'Unfollow' }),
    );
    await waitFor(() =>
      expect(
        calls.some((call) => call.path === 'followUps/issues/1/unfollow'),
      ).toBe(true),
    );
  });

  it('says so when there is nothing', async () => {
    answer = () => ({
      data: {
        issues: [],
        counts: { in_review: 0, in_progress: 0, blocked: 0, backlog: 0 },
        truncated: false,
      },
    });
    render(<FollowUpsPage />);
    expect(await screen.findByText('Nothing to follow up on.')).toBeTruthy();
  });
});

function Counts(): ReactElement {
  const counts = useNavigationCounts(true);
  return <output>{JSON.stringify(counts)}</output>;
}

describe('menu counts', () => {
  it('adds what waits, and one failing source leaves the others', async () => {
    answer = (call) => {
      if (call.path === 'inbox/pending')
        return { data: { decision: 2, info: 3 } };
      if (call.path === 'attention')
        return {
          data: {
            count: 5,
            reasons: [
              { reason: 'pendingRelease', count: 4, path: '/releases' },
              { reason: 'other', count: 1, path: '/x' },
            ],
          },
        };
      if (call.path === 'agents/conversationAttention')
        return { data: { needsYou: 2, unread: 5 } };
      return new Response(null, { status: 500 });
    };
    render(<Counts />);
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe(
        JSON.stringify({
          // The one number on Today: waiting issues (the failing source counts 0) + conversations asking + releases.
          needsYou: 6,
          decisions: 5,
          myIssues: 0,
          sessions: 2,
          releases: 4,
        }),
      ),
    );
  });
});
