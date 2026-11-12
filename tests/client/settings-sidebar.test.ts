// The sidebar while a person is in Settings: the settings modules they may open, by category, in place of the main
// menu; the open module selected; and the main menu's route intact outside Settings.
import {
  resolveAppClientContributions,
  type AppClientRegisteredRoute,
} from '@nocobase/app-client/plugins';
import { describe, expect, it } from 'vitest';

import {
  isSettingsPath,
  selectedSettingsKey,
  settingsSidebarItems,
} from '../../client/lib/navigation-transform.js';
import {
  buildSettingsCatalog,
  matchRouteTree,
  routeKey,
} from '../../client/routing/route-navigation.js';
import { createApplicationRoutes } from '../../client/routes.js';

const app = '@nocobase/app-template-default';
const routes: readonly AppClientRegisteredRoute[] =
  resolveAppClientContributions([
    {
      packageName: app,
      source: 'application',
      routes: createApplicationRoutes({}),
    },
  ]).routes;

const catalog = () => buildSettingsCatalog(routes, new Set());
const matched = (pathname: string) =>
  (matchRouteTree(routes, pathname) ?? []).map(({ route }) => routeKey(route));

describe('the settings sidebar', () => {
  it('knows when a path is in Settings', () => {
    expect(isSettingsPath('/settings')).toBe(true);
    expect(isSettingsPath('/settings/users/new')).toBe(true);
    expect(isSettingsPath('/settingsx')).toBe(false);
    expect(isSettingsPath('/projects/p1/settings')).toBe(false);
  });

  it('groups the modules as Studio names them: workspace, members, integrations, agents, personal', () => {
    const titles = settingsSidebarItems(catalog()).map(
      (section) => section.route.navigation?.title,
    );
    expect(titles).toEqual([
      'settingsStudio.categories.workspace',
      'settingsStudio.categories.members',
      'settingsStudio.categories.integrations',
      'settingsStudio.categories.agents',
      'settingsStudio.categories.personal',
    ]);
    const placed = Object.fromEntries(
      catalog().map((category) => [
        category.route.name,
        category.modules.map((module) => module.route.name),
      ]),
    );
    expect(placed.settingsBusiness).toEqual([
      'settingsIssuePrefix',
      'settingsIssueLabels',
      // Pages that left the sidebar in V1.2, forwarded from Settings.
      'settingsGoProjectMemory',
      'settingsGoProjectSetup',
    ]);
    expect(placed.settingsAccount).toEqual(
      expect.arrayContaining([
        'settingsUsers',
        'permissionManagement',
        'settingsOrganizationKeys',
      ]),
    );
    expect(placed.settingsSystem).toContain('settingsGit');
    expect(placed.settingsAi).toEqual(
      expect.arrayContaining([
        'settingsProjectManager',
        'settingsBudgets',
        'settingsProjectDefaultSkills',
      ]),
    );
    expect(placed.settingsPersonal).toEqual([
      'settingsMyAccount',
      'settingsMyNotifications',
    ]);
  });

  it('selects the module a page belongs to, also one of its tabs or child pages', () => {
    const key = (name: string) => {
      const module = catalog()
        .flatMap((category) => category.modules)
        .find((entry) => entry.route.name === name);
      return module ? routeKey(module.target) : undefined;
    };
    expect(selectedSettingsKey(catalog(), matched('/settings/users'))).toBe(
      key('settingsUsers'),
    );
    expect(
      selectedSettingsKey(catalog(), matched('/settings/roles/create')),
    ).toBe(key('permissionManagement'));
    expect(selectedSettingsKey(catalog(), matched('/issues'))).toBeUndefined();
  });
});
