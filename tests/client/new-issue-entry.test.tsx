// "New issue" opens on Manual unless the person chose a tab (V0.1); the AI tab stays reachable.
import { render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { describe, expect, it } from 'vitest';

import { withManualDefault } from '../../client/pages/issues/new-issue-entry.js';
import { stubMobileViewport } from './helpers/mobile-viewport.js';

const Page = () => <p>plugin page</p>;
const Entry = withManualDefault(Page);

const Where = () => <output>{useLocation().search}</output>;

const open = (url: string) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Entry />
      <Where />
    </MemoryRouter>,
  );

describe('new issue entry', () => {
  it('redirects to the Manual tab when no tab was chosen', async () => {
    open('/issues/new');
    expect(await screen.findByRole('status')).toHaveTextContent('?tab=manual');
    expect(screen.getByText('plugin page')).toBeInTheDocument();
  });

  it('keeps other parameters, such as a preselected project', async () => {
    open('/issues/new?project=abc');
    const search = (await screen.findByRole('status')).textContent ?? '';
    expect(new URLSearchParams(search).get('project')).toBe('abc');
    expect(new URLSearchParams(search).get('tab')).toBe('manual');
  });

  it.each(['?tab=ai', '?tab=manual', '?draft=d1', '?job=j1'])(
    'leaves %s alone, so the AI tab stays selectable',
    async (search) => {
      open(`/issues/new${search}`);
      expect(await screen.findByRole('status')).toHaveTextContent(search);
      expect(screen.getByText('plugin page')).toBeInTheDocument();
    },
  );
});

describe('new issue entry on a phone', () => {
  stubMobileViewport();

  it('behaves the same at 390 px', async () => {
    open('/issues/new');
    expect(await screen.findByRole('status')).toHaveTextContent('?tab=manual');
    expect(screen.getByText('plugin page')).toBeInTheDocument();
  });
});
