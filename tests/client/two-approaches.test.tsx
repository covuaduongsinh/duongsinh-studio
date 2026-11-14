// Tests for the "two approaches" button (plan T, T12), at desktop and at 390 px.
import {
  answerApi,
  renderWithApp,
  type ApiCall,
} from '@nocobase/app-testing/client';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import enUS from '../../client/locales/en-US.js';
import { IssueTwoApproaches } from '../../client/pages/issues/detail/issue-two-approaches.js';
import packageMetadata from '../../package.json' with { type: 'json' };
import { stubMobileViewport } from './helpers/mobile-viewport.js';

stubMobileViewport();

let calls: ApiCall[] = [];
const render = (canEdit = true) =>
  renderWithApp(<IssueTwoApproaches issueId='i1' canEdit={canEdit} />, {
    namespace: packageMetadata.name,
    namespaces: { [packageMetadata.name]: enUS },
    fetch: answerApi((call: ApiCall) => {
      calls.push(call);
      return {
        data: { runs: [{ agentName: 'Claude' }, { agentName: 'Codex' }] },
      };
    }),
  });

beforeEach(() => {
  calls = [];
});

describe('IssueTwoApproaches', () => {
  it('asks only when pressed, and says it costs two runs', async () => {
    const user = userEvent.setup();
    await render();
    expect(await screen.findByText(/It costs two runs/u)).toBeTruthy();
    expect(calls).toHaveLength(0);
    await user.click(
      screen.getByRole('button', { name: 'Ask for two approaches' }),
    );
    await waitFor(() =>
      expect(
        calls.some(
          (c) =>
            c.method === 'POST' && String(c.path) === 'issues/i1/twoApproaches',
        ),
      ).toBe(true),
    );
  });

  it('offers nothing to someone who may not edit', async () => {
    const { container } = await render(false);
    expect(container.textContent).toBe('');
  });
});
