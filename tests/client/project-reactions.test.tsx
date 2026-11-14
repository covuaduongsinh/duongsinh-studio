// Tests for the reaction rules section and the issue's list of reactions (plan T, T1.5), at desktop and at 390 px.
import {
  answerApi,
  renderWithApp,
  type ApiCall,
} from '@nocobase/app-testing/client';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import enUS from '../../client/locales/en-US.js';
import { IssueReactions } from '../../client/pages/issues/detail/issue-reactions.js';
import { ProjectReactions } from '../../client/pages/projects/project-reactions.js';
import packageMetadata from '../../package.json' with { type: 'json' };
import { stubMobileViewport } from './helpers/mobile-viewport.js';

stubMobileViewport();

const EVENTS = [
  'ciFailed',
  'conflicts',
  'reviewChanges',
  'runFailed',
  'prLineComment',
  'greenAndApproved',
] as const;

let calls: ApiCall[] = [];

async function render(element: React.ReactElement) {
  return await renderWithApp(element, {
    namespace: packageMetadata.name,
    namespaces: { [packageMetadata.name]: enUS },
    fetch: answerApi((call: ApiCall) => {
      calls.push(call);
      const path = String(call.path);
      if (
        call.method === 'GET' &&
        path.endsWith('/reactions') &&
        path.startsWith('projects/')
      )
        return {
          data: EVENTS.map((event) => ({
            event,
            enabled: true,
            maxAttempts: 2,
            maxPerIssue: 5,
            overridden: event === 'conflicts',
          })),
        };
      if (call.method === 'PUT') return { data: {} };
      if (call.method === 'GET' && path.startsWith('issues/'))
        return {
          data: [
            {
              id: 'e1',
              kind: 'reacted',
              event: 'ciFailed',
              attempt: 1,
              reason: null,
              createdAt: '2026-11-14T08:00:00.000Z',
            },
            {
              id: 'e2',
              kind: 'blocked',
              event: 'ciFailed',
              attempt: null,
              reason: 'ciFailed: 2 attempts on one push did not finish',
              createdAt: '2026-11-14T08:10:00.000Z',
            },
          ],
        };
      return { data: null };
    }),
  });
}

beforeEach(() => {
  calls = [];
});

describe('ProjectReactions', () => {
  it('lists the six rules and turns one off for a manager', async () => {
    const user = userEvent.setup();
    await render(<ProjectReactions projectId='p1' canManage />);
    expect(await screen.findByText('CI failed')).toBeTruthy();
    expect(screen.getByText('Branch conflict')).toBeTruthy();
    expect(screen.getByText('This project’s own')).toBeTruthy();
    await user.click(
      screen.getByRole('switch', {
        name: 'Turn on the reaction for "CI failed"',
      }),
    );
    await waitFor(() =>
      expect(
        calls.some(
          (call) =>
            call.method === 'PUT' &&
            String(call.path) === 'projects/p1/reactions/ciFailed' &&
            JSON.stringify(call.json) === JSON.stringify({ enabled: false }),
        ),
      ).toBe(true),
    );
  });

  it('is read-only for someone who may not manage', async () => {
    await render(<ProjectReactions projectId='p1' canManage={false} />);
    const toggle = await screen.findByRole('switch', {
      name: 'Turn on the reaction for "CI failed"',
    });
    expect(
      (toggle as HTMLButtonElement).disabled ||
        toggle.hasAttribute('data-disabled') ||
        toggle.getAttribute('aria-disabled') === 'true',
    ).toBe(true);
  });
});

describe('IssueReactions', () => {
  it('shows a line for each wake and for the stop', async () => {
    await render(<IssueReactions issueId='i1' />);
    expect(
      await screen.findByText(
        /Woke the agent on its own: CI failed \(attempt 1\)/u,
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(/Stopped to wait for a person: ciFailed/u),
    ).toBeTruthy();
  });
});
