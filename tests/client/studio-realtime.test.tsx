// Studio's queries read again when the server announces a change (V3.1), and keep their slower poll as the fallback.
import { realtimeClientToken, useApiClient } from '@nocobase/app-client';
import {
  answerApi,
  renderWithApp,
  type ApiCall,
} from '@nocobase/app-testing/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { act, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { StudioRealtime } from '../../client/components/studio-realtime.js';
import enUS from '../../client/locales/en-US.js';
import { IssueRuns } from '../../client/pages/issues/detail/issue-runs.js';
import packageMetadata from '../../package.json' with { type: 'json' };

let signedIn = true;
vi.mock('@nocobase/app-plugin-authentication/client', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  useAuthentication: () => ({
    session: signedIn ? { user: { id: 'u1', name: 'Ada' } } : null,
    isPending: false,
  }),
}));

type Listener = (event: { payload: unknown }) => void;
const watches = new Map<string, Listener[]>();
const closed: string[] = [];
let calls: ApiCall[] = [];
let runs: unknown[] = [];

/** A query of Studio's under one of the keys the announcement refreshes, counting its reads. */
function Probe({ root }: { readonly root: string }) {
  const api = useApiClient();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: [root],
    queryFn: async () => {
      await api.request({ path: `probe/${root}` });
      return Date.now();
    },
  });
  return (
    <output aria-label={root}>
      {query.data ? 'loaded' : 'loading'}
      {queryClient.getQueryCache().getAll().length}
    </output>
  );
}

const answer = (call: ApiCall): unknown => {
  calls.push(call);
  if (call.path.startsWith('probe/')) return { data: true };
  if (call.path === 'issueRuns') return { data: runs };
  if (call.path === 'issuePanels/11') return { data: { progress: {} } };
  return new Response(null, { status: 404 });
};

function render(node: React.ReactNode) {
  return renderWithApp(<>{node}</>, {
    namespace: packageMetadata.name,
    namespaces: { [packageMetadata.name]: enUS },
    fetch: answerApi(answer),
    services: (app) => {
      const realtime = app.container.resolve(realtimeClientToken);
      vi.spyOn(realtime, 'watch').mockImplementation(((
        topic: string,
        options: { onEvent: Listener; onReady?: () => void },
      ) => {
        watches.set(topic, [...(watches.get(topic) ?? []), options.onEvent]);
        return { close: () => closed.push(topic) };
      }) as never);
      vi.spyOn(realtime, 'subscribe').mockReturnValue(vi.fn());
      vi.spyOn(realtime, 'onOpen').mockReturnValue(vi.fn());
    },
  });
}

const announce = (topic: string, payload: unknown = {}) =>
  act(() => {
    for (const listener of watches.get(topic) ?? []) listener({ payload });
  });
const reads = (root: string) =>
  calls.filter((call) => call.path === `probe/${root}`).length;

beforeEach(() => {
  watches.clear();
  closed.length = 0;
  calls = [];
  signedIn = true;
  runs = [];
});

describe('pm:changes', () => {
  it('reads the issue lists, Today and the badge again when the projects plugin announces a change', async () => {
    await render(
      <>
        <StudioRealtime />
        <Probe root='today' />
        <Probe root='task-groups' />
        <Probe root='navigation-badges' />
      </>,
    );
    await waitFor(() => expect(reads('today')).toBe(1));
    await waitFor(() => expect(watches.has('pm:changes')).toBe(true));

    announce('pm:changes', {
      kind: 'pm.changed',
      domain: 'issues',
      issueIds: ['11'],
    });

    await waitFor(() => expect(reads('today')).toBe(2));
    expect(reads('task-groups')).toBe(2);
    expect(reads('navigation-badges')).toBe(2);
  });

  it('turns a burst of announcements into one read', async () => {
    await render(
      <>
        <StudioRealtime />
        <Probe root='today' />
      </>,
    );
    await waitFor(() => expect(watches.has('pm:changes')).toBe(true));
    await waitFor(() => expect(reads('today')).toBe(1));
    announce('pm:changes');
    announce('pm:changes');
    announce('pm:changes');
    await waitFor(() => expect(reads('today')).toBe(2));
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(reads('today')).toBe(2);
  });

  it('does not subscribe when nobody is signed in', async () => {
    signedIn = false;
    await render(<StudioRealtime />);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(watches.has('pm:changes')).toBe(false);
  });

  it('stops listening when it is unmounted', async () => {
    const view = await render(<StudioRealtime />);
    await waitFor(() => expect(watches.has('pm:changes')).toBe(true));
    view.unmount();
    expect(closed).toContain('pm:changes');
  });
});

describe('a run that is still going', () => {
  const run = (id: string, status: string) => ({
    id,
    agent: 'Claude',
    status,
    trigger: null,
    attempt: 1,
    createdAt: '2026-11-01T09:00:00.000Z',
    startedAt: null,
    finishedAt: null,
    summary: '',
    failureReason: null,
    failure: '',
  });

  it('listens to its own topic, and not to runs that ended', async () => {
    runs = [run('r-live', 'running'), run('r-done', 'completed')];
    await render(<IssueRuns issueId='11' />);
    await waitFor(() => expect(watches.has('agents:runs:r-live')).toBe(true));
    expect(watches.has('agents:runs:r-done')).toBe(false);
  });

  it('reads the issue again when the run changes', async () => {
    runs = [run('r-live', 'running')];
    await render(<IssueRuns issueId='11' />);
    await waitFor(() => expect(watches.has('agents:runs:r-live')).toBe(true));
    const before = calls.filter((call) => call.path === 'issueRuns').length;
    announce('agents:runs:r-live', { kind: 'run.status', status: 'completed' });
    await waitFor(() =>
      expect(
        calls.filter((call) => call.path === 'issueRuns').length,
      ).toBeGreaterThan(before),
    );
  });
});
