// Tests for the Routines settings page (plan T, T6), at desktop and at 390 px.
import {
  answerApi,
  renderWithApp,
  type ApiCall,
} from '@nocobase/app-testing/client';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import enUS from '../../client/locales/en-US.js';
import RoutinesPage from '../../client/pages/settings/routines.js';
import packageMetadata from '../../package.json' with { type: 'json' };
import { stubMobileViewport } from './helpers/mobile-viewport.js';

stubMobileViewport();

let calls: ApiCall[] = [];
const routine = {
  id: 'r1',
  name: 'Weekly template check',
  playbookSlug: 'nang-template',
  template: 'Look.',
  cron: '0 8 * * 1',
  enabled: false,
  projectIds: ['p1'],
  lastRunAt: null,
  lastResult: null,
};

const render = () =>
  renderWithApp(<RoutinesPage />, {
    namespace: packageMetadata.name,
    namespaces: { [packageMetadata.name]: enUS },
    fetch: answerApi((call: ApiCall) => {
      calls.push(call);
      const path = String(call.path);
      if (call.method === 'POST' && path.endsWith('/enabled'))
        return { data: { ...routine, enabled: true } };
      if (path === 'routines') return { data: [routine] };
      if (path === 'routineTemplates')
        return {
          data: [
            {
              key: 'licences',
              name: 'Licence scan',
              playbookSlug: null,
              template: 'Scan.',
              cron: '0 9 1 * *',
            },
          ],
        };
      if (path === 'projects') return { data: [{ id: 'p1', name: 'Sandbox' }] };
      return { data: null };
    }),
  });

beforeEach(() => {
  calls = [];
});

describe('RoutinesPage', () => {
  it('lists a routine as off, with its schedule and project, and turns it on', async () => {
    const user = userEvent.setup();
    await render();
    expect(await screen.findByText('Weekly template check')).toBeTruthy();
    expect(screen.getByText('Off')).toBeTruthy();
    await user.click(
      screen.getByRole('switch', { name: 'Turn on "Weekly template check"' }),
    );
    await waitFor(() =>
      expect(
        calls.some(
          (c) =>
            c.method === 'POST' &&
            String(c.path) === 'routines/r1/enabled' &&
            JSON.stringify(c.json) === JSON.stringify({ enabled: true }),
        ),
      ).toBe(true),
    );
  });

  it('offers the ready-made routines and a form that stays shut until it has what it needs', async () => {
    await render();
    expect(await screen.findByText('Licence scan')).toBeTruthy();
    const create = screen.getByRole('button', { name: 'Create (off)' });
    expect((create as HTMLButtonElement).disabled).toBe(true);
  });
});
