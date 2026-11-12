import { groupFoundationNavigation } from '@nocobase/app-plugin-foundation/client';
import type { AppClientRegisteredRoute } from '@nocobase/app-client/plugins';
import {
  routeKey,
  type RouteNavigationItem,
} from '../routing/route-navigation.js';

/**
 * The settings route group: one sidebar entry opening its home page. Its direct child groups are categories on that
 * page, the entries inside a category are modules (one card each), and the pages of a module group are its tabs.
 */
export const SETTINGS_GROUP = 'settings';
/** The settings home page, a navigation-less child of the settings group. */
export const SETTINGS_HOME = 'settingsHome';
/** The category a module registered directly under the settings group is shown in. */
export const SETTINGS_FALLBACK_CATEGORY = 'settingsSystem';

/**
 * Application-owned navigation structure, before the sidebar folds the settings group into one entry. `routes` is the
 * registered tree the permission-filtered `items` came from.
 */
export function organizeNavigation(
  items: RouteNavigationItem[],
  routes: readonly AppClientRegisteredRoute[],
): RouteNavigationItem[] {
  return groupFoundationNavigation(
    withSettingsGroup(items, routes),
    SETTINGS_GROUP,
  );
}

/** Application-owned navigation customization, applied after permission filtering. */
export function transformNavigation(
  items: RouteNavigationItem[],
  routes: readonly AppClientRegisteredRoute[],
): RouteNavigationItem[] {
  // The menu is eight entries in the order of `navigation.order` (V1.2); nothing is grouped into sections.
  return collapseSettingsNavigation(organizeNavigation(items, routes));
}

/**
 * Permission filtering drops a group with nothing visible in it, which the settings group is until a module joins it.
 * Keep it in place so a plugin's settings entry, such as App Foundation, still has a group to join.
 */
function withSettingsGroup(
  items: RouteNavigationItem[],
  routes: readonly AppClientRegisteredRoute[],
): RouteNavigationItem[] {
  const index = routes.findIndex((route) => settingsHomeRoute(route));
  if (index < 0 || items.some((item) => item.route === routes[index]))
    return items;
  const position = items.filter(
    (item) => routes.indexOf(item.route) < index,
  ).length;
  return [
    ...items.slice(0, position),
    { route: routes[index], children: [] },
    ...items.slice(position),
  ];
}

/** The settings home page of a settings group route, when the application registers one. */
export function settingsHomeRoute(
  route: AppClientRegisteredRoute,
): AppClientRegisteredRoute | undefined {
  if (route.name !== SETTINGS_GROUP || route.componentLoader) return undefined;
  return route.children?.find(
    (child) => child.name === SETTINGS_HOME && child.componentLoader,
  );
}

/**
 * The sidebar shows the settings group as one entry opening its home page; it stays selected on every page below the
 * group. Without a module the viewer may open, the entry disappears. An application without a home page keeps the
 * expanded group.
 */
export function collapseSettingsNavigation(
  items: RouteNavigationItem[],
): RouteNavigationItem[] {
  return items.flatMap((item) => {
    const home = settingsHomeRoute(item.route);
    if (!home) return [item];
    if (item.children.length === 0) return [];
    return [
      {
        route: { ...home, navigation: item.route.navigation },
        children: [],
        activeRouteKeys: [home, ...descendantPages(item.route)].map(
          (route) => `${route.packageName}:${route.path}:${route.id}`,
        ),
      },
    ];
  });
}

function descendantPages(
  route: AppClientRegisteredRoute,
): AppClientRegisteredRoute[] {
  return (route.children ?? []).flatMap((child) => [
    ...(child.componentLoader ? [child] : []),
    ...descendantPages(child),
  ]);
}

/** Whether a location is in System settings, where the sidebar shows the settings modules instead of the main menu. */
export function isSettingsPath(pathname: string): boolean {
  return pathname === '/settings' || pathname.startsWith('/settings/');
}

/**
 * Dương Sinh changes the frame here on purpose: inside Settings the sidebar lists the settings modules by category
 * (with a Back link above them) instead of the main menu, as the NocoBase Studio demo does. The template keeps Settings
 * as one entry opening a home of cards (`collapseSettingsNavigation`) and has no sidebar of its own for it; the built-in
 * path (a module is a card, its pages are tabs) cannot give a sidebar that stays on the module's pages. Each module is
 * one link to its target page, selected on every page below it; routes, ids and grants are untouched.
 */
export function settingsSidebarItems(
  categories: readonly SettingsCategory[],
): RouteNavigationItem[] {
  return categories.map((category) => ({
    route: category.route,
    children: category.modules.map((module) => ({
      route: { ...module.target, navigation: module.route.navigation },
      children: [],
    })),
  }));
}

/** The settings module the matched route keys (the open page and its ancestors) belong to, as its sidebar item's key. */
export function selectedSettingsKey(
  categories: readonly SettingsCategory[],
  matched: readonly string[],
): string | undefined {
  const open = new Set(matched);
  for (const category of categories)
    for (const module of category.modules) {
      const own = [
        module.route,
        module.target,
        ...descendantPages(module.route),
      ];
      if (own.some((route) => open.has(routeKey(route))))
        return routeKey(module.target);
    }
  return undefined;
}

export interface SettingsModule {
  /** The module's own route: a page, or the group whose pages are its tabs. */
  readonly route: AppClientRegisteredRoute;
  /** The page a card opens: the module page, or the first tab the viewer may open. */
  readonly target: AppClientRegisteredRoute;
}

export interface SettingsCategory {
  readonly route: AppClientRegisteredRoute;
  readonly modules: readonly SettingsModule[];
}

/**
 * The settings home's cards, from the permission-filtered navigation (`organizeNavigation` output): one category per
 * child group of the settings group, in route order, and the modules the viewer may open in each. A module registered
 * directly under the settings group joins the fallback category. Empty categories are left out.
 */
export function settingsCatalog(
  items: readonly RouteNavigationItem[],
): SettingsCategory[] {
  const settings = items.find((item) => settingsHomeRoute(item.route));
  if (!settings) return [];
  const categories = settings.children.filter(
    (child) => !child.route.componentLoader,
  );
  const loose = settings.children
    .filter((child) => child.route.componentLoader)
    .flatMap(toModule);
  const result = categories.map((category) => ({
    route: category.route,
    modules: category.children.flatMap(toModule),
  }));
  if (loose.length) {
    const fallback = result.find(
      (category) => category.route.name === SETTINGS_FALLBACK_CATEGORY,
    );
    const declared = settings.route.children?.find(
      (child) => child.name === SETTINGS_FALLBACK_CATEGORY,
    );
    if (fallback)
      result[result.indexOf(fallback)] = {
        ...fallback,
        modules: [...fallback.modules, ...loose],
      };
    else
      result.push({
        route: declared ?? settings.route,
        modules: loose,
      });
  }
  return result.filter((category) => category.modules.length > 0);
}

function toModule(item: RouteNavigationItem): SettingsModule[] {
  if (item.route.componentLoader)
    return [{ route: item.route, target: item.route }];
  const target = firstPage(item);
  return target ? [{ route: item.route, target }] : [];
}

function firstPage(
  item: RouteNavigationItem,
): AppClientRegisteredRoute | undefined {
  for (const child of item.children) {
    if (child.route.componentLoader) return child.route;
    const nested = firstPage(child);
    if (nested) return nested;
  }
  return undefined;
}
