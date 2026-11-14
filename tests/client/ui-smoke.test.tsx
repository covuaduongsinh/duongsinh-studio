// Tests for the interface check section (plan T, T5), at desktop and at 390 px.
import {
  answerApi,
  renderWithApp,
  type ApiCall,
} from '@nocobase/app-testing/client';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import enUS from '../../client/locales/en-US.js';
import { ProjectUiSmoke } from '../../client/pages/projects/project-ui-smoke.js';
import packageMetadata from '../../package.json' with { type: 'json' };
import { stubMobileViewport } from './helpers/mobile-viewport.js';

stubMobileViewport();

let calls: ApiCall[] = [];
const render = (canManage = true) =>
  renderWithApp(<ProjectUiSmoke projectId='p1' canManage={canManage} />, {
    namespace: packageMetadata.name,
    namespaces: { [packageMetadata.name]: enUS },
    fetch: answerApi((call: ApiCall) => {
      calls.push(call);
      return {
        data: {
          branch: 'ci/ds-ui-smoke',
          pullRequest: { number: 3, url: 'https://github.test/pull/3' },
        },
      };
    }),
  });

beforeEach(() => {
  calls = [];
});

describe('ProjectUiSmoke', () => {
  it('says where it runs and proposes the workflow on click', async () => {
    const user = userEvent.setup();
    await render();
    expect(
      await screen.findByText(/never on Studio’s runner, uses no secret/u),
    ).toBeTruthy();
    await user.click(
      screen.getByRole('button', { name: 'Propose the ds-ui-smoke workflow' }),
    );
    await waitFor(() =>
      expect(
        calls.some(
          (c) =>
            c.method === 'POST' && String(c.path) === 'projects/p1/uiSmoke',
        ),
      ).toBe(true),
    );
  });

  it('shows nothing to someone who may not manage the project', async () => {
    const { container } = await render(false);
    expect(container.textContent).toBe('');
  });
});
