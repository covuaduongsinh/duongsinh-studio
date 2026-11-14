// Tests for the actions on a step of a run's log (plan T, T11), at desktop and at 390 px.
import {
  answerApi,
  renderWithApp,
  type ApiCall,
} from '@nocobase/app-testing/client';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { RunEventActions } from '../../client/components/run-event-actions.js';
import enUS from '../../client/locales/en-US.js';
import packageMetadata from '../../package.json' with { type: 'json' };
import { stubMobileViewport } from './helpers/mobile-viewport.js';

stubMobileViewport();

let calls: ApiCall[] = [];
const render = () =>
  renderWithApp(<RunEventActions runId='run1' seq={4} />, {
    namespace: packageMetadata.name,
    namespaces: { [packageMetadata.name]: enUS },
    fetch: answerApi((call: ApiCall) => {
      calls.push(call);
      return String(call.path).endsWith('continueFrom')
        ? { data: { started: true, skipped: null, runId: 'run2' } }
        : { data: { id: 'l1', status: 'proposed' } };
    }),
  });

beforeEach(() => {
  calls = [];
});

describe('RunEventActions', () => {
  it('continues from the step with a note', async () => {
    const user = userEvent.setup();
    await render();
    await user.click(
      await screen.findByRole('button', { name: 'Continue from step #4' }),
    );
    await user.type(
      screen.getByLabelText('Note for the agent'),
      'Use the other file.',
    );
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() =>
      expect(
        calls.some(
          (c) =>
            c.method === 'POST' &&
            String(c.path) === 'runs/run1/continueFrom' &&
            JSON.stringify(c.json) ===
              JSON.stringify({ seq: 4, note: 'Use the other file.' }),
        ),
      ).toBe(true),
    );
  });

  it('proposes a lesson only once it has a rule and a tag', async () => {
    const user = userEvent.setup();
    await render();
    await user.click(
      await screen.findByRole('button', { name: 'Turn step #4 into a lesson' }),
    );
    const send = screen.getByRole('button', { name: 'Propose lesson' });
    expect((send as HTMLButtonElement).disabled).toBe(true);
    await user.type(
      screen.getByLabelText('The rule it teaches'),
      'Never print tokens.',
    );
    await user.type(screen.getByLabelText('Tag'), 'secrets');
    await user.click(send);
    await waitFor(() =>
      expect(
        calls.some(
          (c) =>
            String(c.path) === 'runs/run1/lesson' &&
            JSON.stringify(c.json) ===
              JSON.stringify({
                seq: 4,
                rule: 'Never print tokens.',
                tag: 'secrets',
                target: 'skill',
              }),
        ),
      ).toBe(true),
    );
  });
});
