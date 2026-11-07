import { describe, expect, it } from 'vitest';
import { resolveAppRuntime } from '@nocobase/app-client/runtime';
import { defineAppRuntime } from '@nocobase/app-client/runtime';
import appRuntime from '../../client/runtime.js';
import { createApplicationRoutes } from '../../client/routes.js';
import cliPlugins from '../../cli/plugins.js';
import serverPlugins from '../../server/plugins.js';
import settingsRoutes from '../../client/pages/settings/routes.js';
import {
  buildRouteNavigation,
  buildSettingsCatalog,
} from '../../client/routing/route-navigation.js';

describe('default Foundation integration', () => {
  it('registers the Foundation deployment evidence build hook', () => {
    expect(
      cliPlugins.plugins.filter(
        (plugin) => plugin.packageName === '@nocobase/app-plugin-foundation',
      ),
    ).toHaveLength(1);
  });
  // Dương Sinh Studio registers the Users and Roles settings contribution in client/routes.ts (AGENTS.md: once business
  // capabilities exist); Foundation is one card among them on the System settings home.
  it('registers the settings contribution once, so the runtime resolves without duplicate groups', () => {
    expect(createApplicationRoutes()).toContain(settingsRoutes);
    expect(
      serverPlugins.plugins.filter(
        (plugin) => plugin.packageName === '@nocobase/app-plugin-foundation',
      ),
    ).toHaveLength(1);
  });

  it('keeps Foundation beside business settings without changing its protected URL', async () => {
    const runtime = await resolveAppRuntime(defineAppRuntime(appRuntime));
    const menu = buildRouteNavigation(runtime.routes, new Set());
    expect(menu.some(({ route }) => route.name === 'foundationSettings')).toBe(
      false,
    );
    // One System settings entry opening its home; the cards are the catalog, moved pages keeping their URLs.
    expect(
      menu.filter(({ route }) => route.name === 'settingsHome'),
    ).toHaveLength(1);
    expect(
      buildSettingsCatalog(runtime.routes, new Set()).map((category) => [
        category.route.name,
        category.modules.map(({ route, target }) => [route.name, target.path]),
      ]),
    ).toEqual([
      [
        'settingsAccount',
        [
          ['settingsUsers', '/settings/users'],
          ['permissionManagement', '/settings/roles'],
          ['settingsMyNotifications', '/settings/my-notifications'],
        ],
      ],
      [
        'settingsBusiness',
        [
          ['settingsIssuePrefix', '/settings/issue-prefix'],
          ['settingsIssueLabels', '/settings/issue-labels'],
          ['settingsProjectDefaultSkills', '/settings/project-default-skills'],
        ],
      ],
      [
        'settingsSystem',
        [
          ['settingsGit', '/settings/git'],
          ['settingsOrganizationKeys', '/settings/organization-keys'],
          ['settingsBudgets', '/settings/budgets'],
          ['foundation', '/foundation'],
        ],
      ],
    ]);
  });
});
