import {
  resolveAppClientContributions,
  type AppClientRegisteredRoute,
  type AppClientRouteComponentLoader,
} from '@nocobase/app-client/plugins';
import { describe, expect, it } from 'vitest';

import systemSettingsRoutes from '../../client/pages/settings/routes.js';
import applicationRoutes, {
  createApplicationRoutes,
} from '../../client/routes.ts';
import { includeNotificationTemplateRoutes } from '../../client/pages/settings/notification-routes.js';
import { defineAppRoutes } from '@nocobase/app-client/plugins';

describe('app client routes', () => {
  it('joins the settings system category across contributions without moving the log URL', () => {
    const shell = defineAppRoutes([
      {
        name: 'settings',
        path: '/settings',
        navigation: { title: 'Settings' },
        children: [
          {
            name: 'settingsSystem',
            navigation: { title: 'System' },
            children: [],
          },
        ],
      },
    ]);
    const logs = defineAppRoutes([
      {
        name: 'notificationManagement',
        parent: 'settingsSystem',
        navigation: { title: 'Notifications' },
        children: [
          {
            name: 'notificationLogs',
            path: '/notifications/logs',
            auth: 'required',
            authz: {
              resource: { type: 'page', id: 'notification.logs' },
              action: 'access',
            },
            componentLoader: () =>
              import('../../client/pages/settings/notification-templates.js'),
          },
        ],
      },
    ]);
    const routes = includeNotificationTemplateRoutes([shell, logs], true);
    const built = resolveAppClientContributions([
      {
        packageName: '@nocobase/app-template-default',
        source: 'application',
        routes,
      },
    ]);
    expect(pagePaths(built.routes)).toEqual([
      '/settings/notifications/logs',
      '/settings/notifications/templates',
    ]);
    expect(built.routes[0].children[0].children).toHaveLength(1);
    const created = includeNotificationTemplateRoutes([shell], true);
    expect(
      created
        .flatMap((part) => part.routes)
        .find((route) => route.name === 'notificationManagement')?.parent,
    ).toBe('settingsSystem');
  });

  it('exposes configured invitation templates through the real application route factory', async () => {
    const built = resolveAppClientContributions([
      {
        packageName: '@nocobase/app-template-default',
        source: 'application',
        routes: createApplicationRoutes({
          notificationTemplates: { invitationConfigured: true },
        }),
      },
    ]);
    expect(pagePaths(built.routes)).toContain(
      '/settings/notifications/templates',
    );
    expect(pageAuthorizations(built.routes)).toContainEqual({
      name: 'notificationTemplates',
      authorizedAs: 'notification.templates',
    });
    for (const loader of componentLoadersIn(built.routes))
      await expect(loader()).resolves.toMatchObject({
        default: expect.any(Function),
      });
  });

  it('reuses the notification module and preserves its logs and existing grants', () => {
    const existing = defineAppRoutes([
      {
        name: 'settings',
        path: '/settings',
        navigation: { title: 'Settings' },
        children: [
          {
            name: 'notificationManagement',
            navigation: { title: 'Notifications' },
            children: [
              {
                name: 'notificationLogs',
                path: '/notification-logs',
                auth: 'required',
                authz: {
                  resource: { type: 'page', id: 'existing.notification.logs' },
                  action: 'access',
                },
                componentLoader: () =>
                  import('../../client/pages/settings/notification-templates.js'),
              },
            ],
          },
        ],
      },
    ]);
    const once = includeNotificationTemplateRoutes([existing], false);
    expect(includeNotificationTemplateRoutes(once, true)).toBe(once);
    const built = resolveAppClientContributions([
      {
        packageName: '@nocobase/app-template-default',
        source: 'application',
        routes: once,
      },
    ]);
    expect(pagePaths(built.routes)).toEqual([
      '/settings/notification-logs',
      '/settings/notifications/templates',
    ]);
    expect(pageAuthorizations(built.routes)).toEqual([
      { name: 'notificationLogs', authorizedAs: 'existing.notification.logs' },
      { name: 'notificationTemplates', authorizedAs: 'notification.templates' },
    ]);
    expect(built.routes[0].children).toHaveLength(1);
  });

  it('keeps the landing page and the authentication pages', () => {
    // The authentication plugin and this application have to agree on these paths: it sends an unknown visitor to
    // /login, sends a signed-in user who opens a guest page back to /, and mails a reset link to /reset-password,
    // while the sign-in form links to /register and /forgot-password. Only their presence is asserted, so a page the
    // application adds is not a defect. Whether these four are guest pages is not checked here either: app-client
    // refuses any route that claims one of those paths without `auth: 'guest'`.
    expect(pagePaths(resolveRoutes().routes)).toEqual(
      expect.arrayContaining([
        '/',
        '/login',
        '/register',
        '/forgot-password',
        '/reset-password',
        // The page `deviceAuthorization()`'s verificationUri names, where a CLI's sign-in is approved.
        '/device',
      ]),
    );
  });

  // Every page module is transformed on first load, the issue, project and settings pages included, which takes longer
  // than the default timeout on a slow machine.
  it('loads every page component', { timeout: 180_000 }, async () => {
    const resolved = resolveRoutes();
    const loaders = componentLoadersIn(resolved.routes);
    // The tree above is filtered by loader, so an empty list would make the loop below pass without loading
    // anything at all.
    expect(loaders).not.toHaveLength(0);

    for (const componentLoader of loaders) {
      // The registered loader is already the wrapped one, so awaiting it holds every page to the contract that its
      // module default-exports a component. A page that moved or lost its default export fails here.
      await expect(componentLoader()).resolves.toMatchObject({
        default: expect.any(Function),
      });
    }
  });

  it('pins the page authorization of every signed-in page', () => {
    // A stored page grant records the page's `authz` resource id (`authorizedAs`), not its route `name`: changing an
    // id is a data change that has to migrate the grants that reference it, not a refactor — so changing this list
    // deliberately is the point. A new page that requires sign-in adds an entry here, because a page that checks
    // access is a new grant somebody has to be given.
    const resolved = resolveRoutes();

    // The landing page and the inbox opted out of page authorization, so they are reachable by every signed-in user.
    // The issue and project pages check the projects plugin's page grants; the plugin's own overlays (`pm-*`) and the
    // application's issue and project pages under them inherit them.
    expect(pageAuthorizations(resolved.routes)).toEqual([
      { name: 'home', authorizedAs: null },
      { name: 'inbox', authorizedAs: null },
      { name: 'my-issues', authorizedAs: 'pm-my-issues' },
      { name: 'dashboard', authorizedAs: 'reports' },
      { name: 'follow-ups', authorizedAs: 'pm-issues' },
      ...[
        'issues',
        'pm-issue-new',
        'pm-plan',
        'issue-detail',
        'pm-subtask-new',
      ].map((name) => ({ name, authorizedAs: 'pm-issues' })),
      ...[
        'pm-projects',
        'pm-project-new',
        'project-detail',
        'project-memory',
      ].map((name) => ({
        name,
        authorizedAs: 'pm-projects',
      })),
      // Stage S4: the knowledge page, behind the knowledge plugin's own page grant.
      { name: 'knowledge', authorizedAs: 'knowledge' },
      // Stage S5.4: Releases and Hosted environments, behind the releases plugin's page grant.
      { name: 'project-setup', authorizedAs: 'pm-projects' },
      { name: 'releases-hub', authorizedAs: 'rel-apps' },
      { name: 'hosted-environments', authorizedAs: 'rel-apps' },
      // Stage S4: a conversation with an agent as a page, and the links that open the chat panel. The agents plugin
      // answers each person's own conversations only, so they opt out of page authorization like the inbox.
      { name: 'chat-conversation', authorizedAs: null },
      { name: 'chat-link', authorizedAs: null },
      { name: 'chat-link-conversation', authorizedAs: null },
      // The agents plugin's pages (stage S2) check its own page grants; Models stands behind `agents.services`.
      { name: 'agents', authorizedAs: 'agents' },
      { name: 'runtimes', authorizedAs: 'runtimes' },
      { name: 'runtimes-connect', authorizedAs: 'runtimes' },
      { name: 'skills', authorizedAs: 'skills' },
      { name: 'skills-new', authorizedAs: 'skills' },
      { name: 'skills-detail', authorizedAs: 'skills' },
      { name: 'usage', authorizedAs: 'usage' },
      { name: 'models', authorizedAs: 'settings:agents.services' },
      { name: 'settingsHome', authorizedAs: null },
      ...settingsAuthorizations,
    ]);
  });

  it('registers the prepared settings and the projects settings once the application has business capabilities', () => {
    const paths = pagePaths(resolveRoutes().routes);
    expect(paths).toEqual(
      expect.arrayContaining([
        '/settings/users',
        '/settings/roles',
        '/settings/default-access',
        '/settings/issue-prefix',
        '/settings/issue-labels',
        '/settings/git',
      ]),
    );
    // The prepared contribution is registered as it ships, not copied.
    expect(applicationRoutes).toContain(systemSettingsRoutes);
  });

  it('routes the projects plugin pages under the application issue and project pages', () => {
    const paths = pagePaths(resolveRoutes().routes);
    expect(paths).toEqual(
      expect.arrayContaining([
        '/my-issues',
        '/issues',
        '/issues/new',
        '/issues/plans/:planId',
        '/issues/:issueId',
        '/issues/:issueId/new-subtask',
        '/projects',
        '/projects/new',
        '/projects/:projectId',
        '/project-memory',
        '/knowledge',
        '/releases',
        '/environments',
      ]),
    );
  });

  it('puts the inbox in the menu, where every decision waits', () => {
    expect(
      applicationRoutes[0].routes.find((route) => route.name === 'inbox'),
    ).toHaveProperty('navigation');
  });
});

/** The prepared Users and Roles settings, then the projects plugin's settings appended to the same group. */
const settingsAuthorizations = [
  { name: 'settingsUsers', authorizedAs: 'user:*' },
  { name: 'settingsUserCreate', authorizedAs: 'user:*' },
  { name: 'settingsUser', authorizedAs: 'user:*' },
  { name: 'settingsUserEdit', authorizedAs: 'user:*' },
  {
    name: 'settingsRoles',
    authorizedAs: 'settings:authorization.permission-sets',
  },
  {
    name: 'settingsRoleCreate',
    authorizedAs: 'settings:authorization.permission-sets',
  },
  {
    name: 'settingsRoleEdit',
    authorizedAs: 'settings:authorization.permission-sets',
  },
  ...[
    'settingsDefaultAccess',
    'settingsDefaultAccessCreate',
    'settingsDefaultAccessEdit',
  ].map((name) => ({
    name,
    authorizedAs: 'settings:authorization.default-access',
  })),
  { name: 'settingsMyNotifications', authorizedAs: null },
  { name: 'settingsIssuePrefix', authorizedAs: 'settings:pm.general' },
  { name: 'settingsIssueLabels', authorizedAs: 'settings:pm.labels' },
  {
    name: 'settingsProjectDefaultSkills',
    authorizedAs: 'settings:agents.agents',
  },
  { name: 'settingsGit', authorizedAs: 'settings:pm.members' },
  { name: 'settingsOrganizationKeys', authorizedAs: 'settings:studio.apiKeys' },
  { name: 'settingsBudgets', authorizedAs: 'settings:studio.budgets' },
];

/** This application's own contribution, registered the way the client runtime registers it. */
function resolveRoutes() {
  return resolveAppClientContributions([
    {
      packageName: '@nocobase/app-template-default',
      routes: applicationRoutes,
      source: 'application',
    },
  ]);
}

/**
 * The paths of the pages a route tree registers. A menu group names no component, so it carries no path of its own
 * and inherits its parent's — filtering on `componentLoader` is what keeps that inherited path out of the list.
 */
function pagePaths(routes: readonly AppClientRegisteredRoute[]): string[] {
  return routes.flatMap((route) => [
    ...(route.componentLoader ? [route.path] : []),
    ...pagePaths(route.children ?? []),
  ]);
}

/** Every page loader in a tree, at any depth. */
function componentLoadersIn(
  routes: readonly AppClientRegisteredRoute[],
): AppClientRouteComponentLoader[] {
  return routes.flatMap((route) => [
    ...(route.componentLoader ? [route.componentLoader] : []),
    ...componentLoadersIn(route.children ?? []),
  ]);
}

/** Page authorization comes directly from the registered tree. */
function pageAuthorizations(
  routes: readonly AppClientRegisteredRoute[],
): { name: string; authorizedAs: string | null }[] {
  return routes.flatMap((route) => [
    ...(route.componentLoader && route.auth === 'required'
      ? [
          {
            name: route.name,
            authorizedAs:
              route.authz === 'skip'
                ? null
                : route.authz === 'unrestricted'
                  ? 'unrestricted'
                  : route.authz.resource.type === 'page'
                    ? route.authz.resource.id
                    : `${route.authz.resource.type}:${route.authz.resource.id}`,
          },
        ]
      : []),
    ...pageAuthorizations(route.children ?? []),
  ]);
}
