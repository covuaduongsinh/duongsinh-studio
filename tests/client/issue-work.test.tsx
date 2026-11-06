// The issue's progress panel and the Agent queue, with `server/routes/issue-work.ts` answered by the fixture below.
import {
  answerApi,
  renderWithApp,
  type ApiCall,
} from '@nocobase/app-testing/client';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import packageMetadata from '../../package.json' with { type: 'json' };
import enUS from '../../client/locales/en-US.js';
import { AgentQueueView } from '../../client/pages/issues/agent-queue.js';
import { IssueProgressPanel } from '../../client/pages/issues/detail/issue-progress.js';
import { IssueRuns } from '../../client/pages/issues/detail/issue-runs.js';

const ISSUE = '11';
const FAILED_RUN = 'run-failed';

function panels(overrides: Record<string, unknown> = {}) {
  return {
    progress: {
      state: 'idle',
      agent: null,
      step: null,
      since: null,
      runner: null,
      pullRequest: null,
      needsYou: null,
      next: null,
      handOver: false,
      failedRunId: null,
      ...overrides,
    },
    ownerHandoff: { handoff: null, canDecide: false },
    commentRunLimit: null,
  };
}

let answer: (call: ApiCall) => unknown;
const calls: ApiCall[] = [];

function render(node: ReactNode) {
  return renderWithApp(<>{node}</>, {
    namespace: packageMetadata.name,
    namespaces: { [packageMetadata.name]: enUS },
    fetch: answerApi((call: ApiCall) => {
      calls.push(call);
      return answer(call);
    }),
  });
}

const panel = (canEdit = true) => (
  <IssueProgressPanel
    issueId={ISSUE}
    revision={3}
    canEdit={canEdit}
    onChanged={vi.fn()}
  />
);

describe('issue progress', () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it('shows who works on what, and what comes next', async () => {
    answer = () => ({
      data: panels({
        state: 'working',
        agent: { id: 'a', name: 'Claude' },
        step: 'Next: sửa trang',
        next: 'Chờ review',
        needsYou: 'Chọn một phương án',
        pullRequest: { number: 7, url: 'https://example.test/7' },
      }),
    });
    render(panel());
    expect(await screen.findByText(/Claude is working/)).toBeTruthy();
    expect(screen.getByText(/Next: sửa trang/)).toBeTruthy();
    expect(screen.getByText('Chờ review')).toBeTruthy();
    expect(screen.getByText('Chọn một phương án')).toBeTruthy();
    expect(screen.getByRole('link', { name: /#7/ }).getAttribute('href')).toBe(
      'https://example.test/7',
    );
  });

  it('asks for a decision on a failed run and sends it', async () => {
    answer = (call) =>
      call.method === 'POST'
        ? { data: { outcome: 'cancelled' } }
        : { data: panels({ state: 'needsDecision', failedRunId: FAILED_RUN }) };
    render(panel());
    const card = await screen.findByTestId('failed-run-card');
    await userEvent.click(within(card).getByRole('button', { name: 'Stop' }));
    await waitFor(() =>
      expect(
        calls.find((call) => call.path === `failedRuns/${FAILED_RUN}/decide`)
          ?.json,
      ).toEqual({ action: 'cancel' }),
    );
  });

  it('offers no decisions to someone who may not edit the issue', async () => {
    answer = () => ({
      data: panels({
        state: 'inReview',
        failedRunId: FAILED_RUN,
        handOver: true,
      }),
    });
    render(panel(false));
    await screen.findByTestId('issue-progress');
    expect(screen.queryByTestId('failed-run-card')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Send back' })).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Hand to the project manager' }),
    ).toBeNull();
  });

  it('continues a held comment with its token', async () => {
    answer = (call) =>
      call.method === 'POST'
        ? { data: { runIds: ['r1'] } }
        : {
            data: {
              ...panels({ state: 'waitingForContinuation' }),
              commentRunLimit: { token: 'tok', maxRuns: 20, windowHours: 24 },
            },
          };
    render(panel());
    const card = await screen.findByTestId('comment-run-limit');
    expect(within(card).getByText(/limit of 20 runs/)).toBeTruthy();
    await userEvent.click(
      within(card).getByRole('button', { name: 'Continue' }),
    );
    await waitFor(() =>
      expect(
        calls.find((call) => call.path === `issueCommentRuns/${ISSUE}/continue`)
          ?.json,
      ).toEqual({ token: 'tok' }),
    );
  });

  it('sends an issue back with the reason and the revision it saw', async () => {
    answer = (call) =>
      call.method === 'POST'
        ? { data: { commentId: 'c1' } }
        : { data: panels({ state: 'inReview' }) };
    render(panel());
    await userEvent.click(
      await screen.findByRole('button', { name: 'Send back' }),
    );
    await userEvent.type(
      screen.getByLabelText('What needs to change'),
      'Sai màu',
    );
    const dialog = screen.getByRole('dialog');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Send back' }),
    );
    await waitFor(() =>
      expect(
        calls.find((call) => call.path === `issues/${ISSUE}/sendBack`)?.json,
      ).toEqual({ revision: 3, content: 'Sai màu' }),
    );
  });

  it('lists runs and opens a transcript', async () => {
    answer = (call) =>
      call.path === 'issueRuns'
        ? {
            data: [
              {
                id: 'r1',
                agent: 'Claude',
                status: 'failed',
                trigger: 'mention',
                attempt: 1,
                createdAt: '2026-11-06T09:00:00.000Z',
                finishedAt: null,
                summary: '',
                failureReason: 'toolProcess',
                failure: 'Tiến trình dừng.',
              },
            ],
          }
        : {
            data: [
              {
                seq: 1,
                at: 'x',
                type: 'text',
                tool: null,
                text: 'Đang đọc mã',
              },
            ],
          };
    render(<IssueRuns issueId={ISSUE} />);
    expect(await screen.findByText('Tiến trình dừng.')).toBeTruthy();
    expect(screen.getByText('Failed')).toBeTruthy();
    await userEvent.click(
      screen.getByRole('button', { name: 'Show transcript' }),
    );
    expect(await screen.findByText('Đang đọc mã')).toBeTruthy();
  });
});

describe('agent queue', () => {
  it('groups rows by what they wait for and starts an idle one', async () => {
    const row = (
      state: string,
      id: string,
      extra: Record<string, unknown>,
    ) => ({
      agentId: 'a',
      state,
      run: null,
      queue: null,
      waiting: null,
      idle: null,
      issue: { id, identifier: `PM-${id}`, title: `Việc ${id}` },
      mine: true,
      ...extra,
    });
    answer = (call) =>
      call.method === 'POST'
        ? { data: { started: true, skipped: null } }
        : {
            data: {
              rows: [
                row('waiting', '1', {
                  waiting: {
                    kind: 'review',
                    viewerDecides: true,
                    detail: null,
                  },
                }),
                row('queued', '2', {
                  queue: { reason: 'toolQuota', position: 1, until: null },
                }),
                row('idle', '3', {
                  idle: { reason: 'neverRan', mayStart: true },
                }),
              ],
              agents: { a: { name: 'Claude' } },
              summary: { waiting: 1, working: 0, queued: 1, idle: 1 },
            },
          };
    render(<AgentQueueView filters={{}} />);
    const waiting = await screen.findByRole('region', {
      name: 'Waiting for people',
    });
    expect(within(waiting).getByText('Needs your acceptance')).toBeTruthy();
    expect(
      within(screen.getByRole('region', { name: 'Queued' })).getByText(
        /Tool quota exhausted/,
      ),
    ).toBeTruthy();
    const idle = screen.getByRole('region', { name: 'Idle' });
    await userEvent.click(within(idle).getByRole('button', { name: 'Start' }));
    await waitFor(() =>
      expect(
        calls.some((call) => call.path === 'agentBoard/issues/3/start'),
      ).toBe(true),
    );
  });
});
