// Tests for the issue tier row and the project's default tier (plan T, T10), at desktop and at 390 px.
import {
  answerApi,
  renderWithApp,
  type ApiCall,
} from '@nocobase/app-testing/client';
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import enUS from '../../client/locales/en-US.js';
import { IssueTierRow } from '../../client/pages/issues/detail/issue-tier.js';
import { ProjectDefaultTier } from '../../client/pages/projects/project-default-tier.js';
import packageMetadata from '../../package.json' with { type: 'json' };
import { stubMobileViewport } from './helpers/mobile-viewport.js';

stubMobileViewport();

let tier: Record<string, unknown>;
let calls: ApiCall[] = [];

async function render(element: React.ReactElement) {
  return await renderWithApp(element, {
    namespace: packageMetadata.name,
    namespaces: { [packageMetadata.name]: enUS },
    fetch: answerApi((call: ApiCall) => {
      calls.push(call);
      const path = String(call.path);
      if (path.endsWith('/tier')) return { data: tier };
      if (path.endsWith('/autopilot'))
        return { data: { projectId: 'p1', defaultTier: 'small' } };
      return { data: null };
    }),
  });
}

beforeEach(() => {
  calls = [];
  tier = {
    tier: 'standard',
    source: 'default',
    raisedFrom: null,
    reason: null,
  };
});

describe('IssueTierRow', () => {
  it('shows the tier and where it comes from', async () => {
    await render(<IssueTierRow issueId='i1' canEdit />);
    expect(
      await screen.findByText('Follows the project’s default tier.'),
    ).toBeTruthy();
    expect(screen.getByText('Issue tier')).toBeTruthy();
  });

  it('says so when sensitive paths raised it', async () => {
    tier = {
      tier: 'sensitive',
      source: 'issue',
      raisedFrom: 'small',
      reason: 'x',
    };
    await render(<IssueTierRow issueId='i1' canEdit />);
    expect(
      await screen.findByText(
        /Raised from "Small" because it touches sensitive paths/u,
      ),
    ).toBeTruthy();
  });

  it('is read-only without the right to edit', async () => {
    await render(<IssueTierRow issueId='i1' canEdit={false} />);
    const trigger = await screen.findByRole('combobox', { name: 'Issue tier' });
    expect(
      trigger.hasAttribute('disabled') ||
        trigger.getAttribute('aria-disabled') === 'true' ||
        trigger.hasAttribute('data-disabled'),
    ).toBe(true);
  });
});

describe('ProjectDefaultTier', () => {
  it('shows the project default and what each tier asks for', async () => {
    await render(<ProjectDefaultTier projectId='p1' canManage />);
    expect(await screen.findByText('Default issue tier')).toBeTruthy();
    expect(
      screen.getByText(/Do it directly; no approach needed/u),
    ).toBeTruthy();
    expect(calls.some((c) => String(c.path) === 'projects/p1/autopilot')).toBe(
      true,
    );
  });
});
