// Tests for the "Changes" card of an issue (plan T, T7), at desktop and at 390 px.
import {
  answerApi,
  renderWithApp,
  type ApiCall,
} from '@nocobase/app-testing/client';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { IssueChanges } from '../../client/components/issue-changes/index.js';
import enUS from '../../client/locales/en-US.js';
import packageMetadata from '../../package.json' with { type: 'json' };
import { stubMobileViewport } from './helpers/mobile-viewport.js';

stubMobileViewport();

let summary: Record<string, unknown>;
let calls: ApiCall[] = [];

const render = (canComment = true) =>
  renderWithApp(
    <IssueChanges
      pullRequestId='pr1'
      headSha='abc1234'
      canComment={canComment}
    />,
    {
      namespace: packageMetadata.name,
      namespaces: { [packageMetadata.name]: enUS },
      fetch: answerApi((call: ApiCall) => {
        calls.push(call);
        if (call.method === 'POST') return { data: { commentId: 'c1' } };
        return { data: summary };
      }),
    },
  );

beforeEach(() => {
  calls = [];
  summary = {
    pullRequestId: 'pr1',
    number: 7,
    url: 'https://github.test/acme/sandbox/pull/7',
    headSha: 'abc1234',
    files: 3,
    additions: 14,
    deletions: 3,
    groups: [
      { directory: 'server/routes', files: 2, additions: 13, deletions: 2 },
      { directory: '.', files: 1, additions: 1, deletions: 1 },
    ],
    sensitive: ['package.json'],
    verification: { result: 'passed', headSha: 'abc1234', matchesHead: true },
  };
});

describe('IssueChanges', () => {
  it('shows the numbers, the directories, the sensitive files and the verification', async () => {
    await render();
    expect(await screen.findByText(/Changes · #7/u)).toBeTruthy();
    expect(screen.getByText('+14')).toBeTruthy();
    expect(screen.getByText('server/routes')).toBeTruthy();
    expect(
      screen.getByText(/Touches sensitive paths: package\.json/u),
    ).toBeTruthy();
    expect(screen.getByText('Verification passed')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open on GitHub' })).toBeTruthy();
  });

  it('says when the verification is not of the current head', async () => {
    summary = {
      ...summary,
      verification: {
        result: 'passed',
        headSha: 'old0000',
        matchesHead: false,
      },
    };
    await render();
    expect(
      await screen.findByText(/not of the current head commit/u),
    ).toBeTruthy();
  });

  it('sends a request for changes as a comment', async () => {
    const user = userEvent.setup();
    await render();
    await user.click(
      await screen.findByRole('button', { name: 'Request changes' }),
    );
    await user.type(
      screen.getByLabelText('What to change'),
      'Rename the helper.',
    );
    await user.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() =>
      expect(
        calls.some(
          (c) =>
            c.method === 'POST' &&
            String(c.path) === 'pullRequests/pr1/requestChanges' &&
            JSON.stringify(c.json) ===
              JSON.stringify({ note: 'Rename the helper.' }),
        ),
      ).toBe(true),
    );
  });

  it('offers no request for changes to someone who may not comment', async () => {
    await render(false);
    await screen.findByText(/Changes · #7/u);
    expect(
      screen.queryByRole('button', { name: 'Request changes' }),
    ).toBeNull();
  });
});
