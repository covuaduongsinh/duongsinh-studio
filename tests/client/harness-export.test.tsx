// Tests for the harness export section (plan T, T4), at desktop and at 390 px.
import {
  answerApi,
  renderWithApp,
  type ApiCall,
} from '@nocobase/app-testing/client';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import enUS from '../../client/locales/en-US.js';
import { ProjectHarnessExport } from '../../client/pages/projects/project-harness-export.js';
import packageMetadata from '../../package.json' with { type: 'json' };
import { stubMobileViewport } from './helpers/mobile-viewport.js';

stubMobileViewport();

let status: Record<string, unknown>;
let calls: ApiCall[] = [];

const render = (canManage = true) =>
  renderWithApp(<ProjectHarnessExport projectId='p1' canManage={canManage} />, {
    namespace: packageMetadata.name,
    namespaces: { [packageMetadata.name]: enUS },
    fetch: answerApi((call: ApiCall) => {
      calls.push(call);
      if (call.method === 'POST')
        return {
          data: { number: 7, url: 'https://github.test/pull/7', files: 6 },
        };
      return { data: status };
    }),
  });

beforeEach(() => {
  calls = [];
  status = {
    repository: 'acme/sandbox',
    branch: 'main',
    files: 6,
    missing: [],
    edited: [],
    outdated: false,
    state: 'notExported',
  };
});

describe('ProjectHarnessExport', () => {
  it('offers the export when it has never been done and posts it', async () => {
    const user = userEvent.setup();
    await render();
    expect(
      await screen.findByText(
        /Never exported to acme\/sandbox\. 6 files would be written/u,
      ),
    ).toBeTruthy();
    await user.click(
      screen.getByRole('button', { name: 'Export to the repository' }),
    );
    await waitFor(() =>
      expect(
        calls.some(
          (c) =>
            c.method === 'POST' &&
            String(c.path) === 'projects/p1/harnessExport',
        ),
      ).toBe(true),
    );
  });

  it('lists what drifted', async () => {
    status = {
      ...status,
      state: 'drifted',
      edited: ['.nb-studio/harness/lessons.md'],
      missing: ['.nb-studio/harness/criteria-template.md'],
      outdated: true,
    };
    await render();
    expect(
      await screen.findByText(
        /Edited by hand: \.nb-studio\/harness\/lessons\.md/u,
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(/Missing: \.nb-studio\/harness\/criteria-template\.md/u),
    ).toBeTruthy();
    expect(screen.getByText(/Studio has newer content/u)).toBeTruthy();
  });

  it('has nothing to export without a repository or when in sync', async () => {
    status = { ...status, state: 'noRepository', repository: null };
    await render();
    const button = await screen.findByRole('button', {
      name: 'Export to the repository',
    });
    await waitFor(() =>
      expect((button as HTMLButtonElement).disabled).toBe(true),
    );
  });

  it('shows nothing to someone who may not manage the project', async () => {
    const { container } = await render(false);
    expect(container.textContent).toBe('');
  });
});
