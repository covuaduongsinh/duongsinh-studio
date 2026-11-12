// The sidebar is eight entries (V1.2) and every page that left it is still reachable.
import { resolveAppClientContributions } from '@nocobase/app-client/plugins';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { describe, expect, it } from 'vitest';

import SettingsShortcut from '../../client/pages/settings/shortcut.js';
import { createApplicationRoutes } from '../../client/routes.js';
import {
  buildRouteNavigation,
  buildSettingsCatalog,
} from '../../client/routing/route-navigation.js';

const app = '@nocobase/app-template-default';
const routes = resolveAppClientContributions([
  {
    packageName: app,
    source: 'application',
    routes: createApplicationRoutes(),
  },
]).routes;

const topLevel = (denied: ReadonlySet<string> = new Set()) =>
  buildRouteNavigation(routes, denied).map(({ route }) => route.name);

describe('sidebar entries', () => {
  it('lists eight entries in a fixed order, with no section rows', () => {
    const names = topLevel();
    expect(names).toEqual([
      'home',
      'issues',
      'my-sessions',
      'pm-projects',
      'releases-hub',
      'knowledge',
      'dashboard',
      // Settings is one entry that opens its home page.
      'settingsHome',
    ]);
    expect(names.length).toBeLessThanOrEqual(8);
    expect(names.some((name) => name.startsWith('section'))).toBe(false);
  });

  it('keeps the old URLs and page grants: nothing was renamed or moved', () => {
    const find = (name: string) => {
      const walk = (
        list: typeof routes,
      ): (typeof routes)[number] | undefined => {
        for (const route of list) {
          if (route.name === name) return route;
          const nested = route.children && walk(route.children);
          if (nested) return nested;
        }
        return undefined;
      };
      return walk(routes);
    };
    const paths = {
      inbox: '/inbox',
      'my-issues': '/my-issues',
      'follow-ups': '/follow-ups',
      'project-memory': '/project-memory',
      'project-setup': '/project-setup',
      'hosted-environments': '/environments',
      agents: '/agents',
      runtimes: '/runtimes',
      skills: '/skills',
      usage: '/usage',
      models: '/models',
    };
    expect(
      Object.fromEntries(
        Object.keys(paths).map((name) => [name, find(name)?.path]),
      ),
    ).toEqual(paths);
  });

  it('leads to the pages that left the sidebar from inside Settings', () => {
    const catalog = buildSettingsCatalog(routes, new Set());
    const shortcuts = catalog
      .flatMap((category) => category.modules)
      .filter(({ route }) => route.name.startsWith('settingsGo'))
      .map(({ target }) => target.path);
    expect(shortcuts.sort()).toEqual([
      '/settings/go/agents',
      '/settings/go/environments',
      '/settings/go/models',
      '/settings/go/project-memory',
      '/settings/go/project-setup',
      '/settings/go/runtimes',
      '/settings/go/skills',
      '/settings/go/usage',
    ]);
  });
});

const Where = () => {
  const { pathname, search } = useLocation();
  return <output>{`${pathname}${search}`}</output>;
};

describe('settings shortcut', () => {
  it('forwards to the page it stands for and keeps the query', async () => {
    render(
      <MemoryRouter initialEntries={['/settings/go/agents?tab=x']}>
        <Routes>
          <Route path='/settings/go/*' element={<SettingsShortcut />} />
          <Route path='/agents' element={<Where />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByRole('status')).toHaveTextContent(
      '/agents?tab=x',
    );
  });
});
