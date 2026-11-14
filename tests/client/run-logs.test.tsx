import {
  answerApi,
  renderWithApp,
  type ApiCall,
} from '@nocobase/app-testing/client';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import enUS from '../../client/locales/en-US.js';
import packageMetadata from '../../package.json' with { type: 'json' };
import RunLogsPage from '../../client/pages/settings/run-logs.js';
import { stubMobileViewport } from './helpers/mobile-viewport.js';

// S6 (plan S): the search box of run logs, with a window of days.
stubMobileViewport();

let calls: ApiCall[] = [];

const render = () =>
  renderWithApp(<RunLogsPage />, {
    namespace: packageMetadata.name,
    namespaces: { [packageMetadata.name]: enUS },
    fetch: answerApi((call: ApiCall) => {
      calls.push(call);
      return {
        data: [
          {
            runId: 'r1',
            seq: 2,
            at: '2026-11-14T08:00:00.000Z',
            type: 'message',
            snippet: '…FAIL a.test.ts NEEDLE…',
            subjectKind: 'issue',
            subjectId: 'i1',
          },
        ],
      };
    }),
  });

beforeEach(() => {
  calls = [];
});

describe('RunLogsPage', () => {
  it('asks nothing until there is a word, then searches the chosen window', async () => {
    const user = userEvent.setup();
    await render();
    expect(
      await screen.findByText(/Type at least two characters/u),
    ).toBeTruthy();
    expect(calls).toHaveLength(0);
    await user.type(screen.getByLabelText('Text to find'), 'NEEDLE');
    await user.selectOptions(screen.getByLabelText('Window'), '90');
    await user.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByText(/FAIL a\.test\.ts NEEDLE/u)).toBeTruthy();
    await waitFor(() =>
      expect(
        calls.some(
          (call) =>
            String(call.path) === 'runLogs/search' &&
            String((call.query as Record<string, unknown>)?.days) === '90' &&
            JSON.stringify(call.query).includes('NEEDLE'),
        ),
      ).toBe(true),
    );
    expect(screen.getByRole('link', { name: 'Open the issue' })).toBeTruthy();
  });
});
