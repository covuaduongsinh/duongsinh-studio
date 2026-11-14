// Tests for the branch protection section (plan T, T3a), at desktop and at 390 px.
import {
  answerApi,
  renderWithApp,
  type ApiCall,
} from '@nocobase/app-testing/client';
import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import enUS from '../../client/locales/en-US.js';
import { ProjectBranchProtection } from '../../client/pages/projects/project-branch-protection.js';
import packageMetadata from '../../package.json' with { type: 'json' };
import { stubMobileViewport } from './helpers/mobile-viewport.js';

stubMobileViewport();

let answer: Record<string, unknown>;

const isOff = (element: HTMLElement): boolean =>
  element.getAttribute('aria-disabled') === 'true' ||
  element.hasAttribute('data-disabled') ||
  Boolean((element as HTMLButtonElement).disabled);

const render = (canManage = true) =>
  renderWithApp(
    <ProjectBranchProtection projectId='p1' canManage={canManage} />,
    {
      namespace: packageMetadata.name,
      namespaces: { [packageMetadata.name]: enUS },
      fetch: answerApi((call: ApiCall) =>
        String(call.path).endsWith('/autopilot')
          ? { data: { projectId: 'p1', autoMergeOnGithub: false } }
          : { data: answer },
      ),
    },
  );

const base = {
  repository: 'acme/sandbox',
  branch: 'main',
  unknowns: [],
  requiredChecks: ['ds-check'],
  rulesReadable: true,
  httpStatus: null,
};

beforeEach(() => {
  answer = {
    ...base,
    status: 'read',
    verdict: 'ok',
    problems: [],
  };
});

describe('ProjectBranchProtection', () => {
  it('says so when the branch is protected as it should be', async () => {
    await render();
    expect(
      await screen.findByText(
        /Branch main of acme\/sandbox is protected as it should be/u,
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/New branch ruleset/u)).toBeNull();
  });

  it('lists what is wrong and the four steps to fix it', async () => {
    answer = {
      ...base,
      status: 'read',
      verdict: 'problem',
      problems: ['noRequiredCheck', 'reviewRequired'],
    };
    await render();
    expect(
      await screen.findByText(
        /The "ds-check" check is not required before merging/u,
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(/cannot approve, so no pull request would ever merge/u),
    ).toBeTruthy();
    expect(screen.getByText(/New branch ruleset/u)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Check again' })).toBeTruthy();
  });

  it('lets GitHub auto-merge be turned on only when the guard is green', async () => {
    await render();
    const toggle = await screen.findByRole('switch', {
      name: 'Let GitHub merge when checks pass',
    });
    await waitFor(() => expect(isOff(toggle)).toBe(false));
  });

  it('keeps the auto-merge switch off while the guard has gaps', async () => {
    answer = {
      ...base,
      status: 'read',
      verdict: 'problem',
      problems: ['pushAllowed'],
    };
    await render();
    const toggle = await screen.findByRole('switch', {
      name: 'Let GitHub merge when checks pass',
    });
    expect(isOff(toggle)).toBe(true);
  });

  it('does not call a refusal a pass or a failure', async () => {
    answer = {
      ...base,
      status: 'unreadable',
      verdict: null,
      problems: [],
      httpStatus: 403,
    };
    await render();
    expect(
      await screen.findByText(
        /would not let Studio read the settings of acme\/sandbox \(status 403\)/u,
      ),
    ).toBeTruthy();
  });

  it('shows nothing to someone who may not manage the project', async () => {
    const { container } = await render(false);
    expect(container.textContent).toBe('');
  });
});
