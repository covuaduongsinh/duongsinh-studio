// Back in the settings sidebar returns to the page the person left to open Settings, and to Home without one.
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, expect, it } from 'vitest';
import {
  TestI18nProvider,
  createTestI18nRuntime,
} from '@nocobase/i18n/testing';

import enUS from '../../client/locales/en-US.js';
import { SettingsBack } from '../../client/layouts/components/settings-back.js';
import { useRememberOutsideSettings } from '../../client/layouts/components/settings-return.js';

const runtime = await createTestI18nRuntime({
  application: { namespace: 'test', resources: enUS },
});

function Shell() {
  useRememberOutsideSettings();
  return <SettingsBack />;
}

function mount(path: string) {
  return render(
    <TestI18nProvider runtime={runtime}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path='*' element={<Shell />} />
        </Routes>
      </MemoryRouter>
    </TestI18nProvider>,
  );
}

beforeEach(() => window.sessionStorage.clear());

it('goes back to the page that was open before Settings', () => {
  const first = mount('/issues?view=board');
  first.unmount();
  mount('/settings/users');
  expect(
    screen.getByRole('link', { name: enUS.settingsStudio.back }),
  ).toHaveAttribute('href', '/issues?view=board');
});

it('goes Home when nothing was open before, and never follows a stored address that leaves the application', () => {
  mount('/settings/users');
  expect(
    screen.getByRole('link', { name: enUS.settingsStudio.back }),
  ).toHaveAttribute('href', '/');
  window.sessionStorage.setItem('studio:settings:return', '//evil.example');
  mount('/settings/roles');
  expect(
    screen.getAllByRole('link', { name: enUS.settingsStudio.back }).at(-1),
  ).toHaveAttribute('href', '/');
});
