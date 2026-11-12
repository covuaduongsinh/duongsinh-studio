import { useSyncServerLocale } from '@nocobase/app-plugin-i18n/client';
import { useMemo, type ReactElement } from 'react';
import type { AppClientRegisteredRoute } from '@nocobase/app-client/plugins';
import { Outlet, useLocation } from 'react-router';

import { BrandWatermark } from '#components/brand-watermark';
import { Breadcrumbs } from '#components/breadcrumbs';
import { StudioChatProvider } from '#components/studio-chat';
import { StudioRealtime } from '#components/studio-realtime';
import { ChatPanel } from '#extensions/nocobase-agent-chat/chat-panel';
import { ChatFloatingButton } from '#extensions/nocobase-agent-chat/launchers';

import { useNavigationCounts } from '#hooks/use-follow-ups';
import {
  isSettingsPath,
  selectedSettingsKey,
  settingsSidebarItems,
} from '#lib/navigation-transform';

import { RouteTreeProvider } from '../routing/route-context.js';
import { RouteLeaveBoundary } from '../routing/route-leave-boundary.js';

import { PageBreadcrumbProvider } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { LayoutHeader } from './components/layout-header.js';
import {
  AppSidebar,
  AppSidebarProvider,
  AppSidebarToggle,
} from './components/app-sidebar.js';
import { NavigationMenu } from './components/navigation-menu.js';
import { HeaderActions } from './components/header-actions.js';
import { SettingsBack } from './components/settings-back.js';
import { useRememberOutsideSettings } from './components/settings-return.js';
import { AppSidebarFooter } from './components/sidebar-footer.js';
import {
  useRouteNavigation,
  buildSettingsCatalog,
  matchRouteTree,
  routeKey,
  selectedNavigationId,
} from '../routing/route-navigation.js';

export interface AppLayoutProps {
  readonly routes: readonly AppClientRegisteredRoute[];
}

export function AppLayout({ routes }: AppLayoutProps): ReactElement {
  // The browser decides what it renders; this tells the server the same language so its messages match.
  useSyncServerLocale();

  const { t } = useTranslation();
  const { items: menuItems, denied, loading } = useRouteNavigation(routes);
  const access = useMemo(() => ({ denied, loading }), [denied, loading]);
  const { pathname } = useLocation();
  const selectedKey = selectedNavigationId(routes, pathname, denied);
  // Dương Sinh: inside Settings the sidebar lists the settings modules instead of the main menu (see
  // `settingsSidebarItems` in `lib/navigation-transform.ts` and `.agents/rules/shell.md`).
  const inSettings = isSettingsPath(pathname);
  useRememberOutsideSettings();
  const settingsCategories = useMemo(
    () => buildSettingsCatalog(routes, denied),
    [routes, denied],
  );
  const settingsItems = useMemo(
    () => settingsSidebarItems(settingsCategories),
    [settingsCategories],
  );
  const settingsKey = selectedSettingsKey(
    settingsCategories,
    (matchRouteTree(routes, pathname) ?? []).map(({ route }) =>
      routeKey(route),
    ),
  );
  // Dương Sinh: what waits on the viewer, beside the entries it belongs to; the shell owns the menu, so it passes them.
  const counts = useNavigationCounts(!loading);
  // One badge, on Today: the same number it shows, instead of the same count on the inbox, issues, sessions and releases.
  const badges = useMemo(() => ({ home: counts.needsYou }), [counts.needsYou]);
  const navigationLabel = t('navigation.label', {
    defaultValue: 'Application navigation',
  });

  return (
    // The shell owns the business route tree used by its pages and navigation.
    <RouteTreeProvider routes={routes} access={access}>
      <StudioChatProvider>
        <StudioRealtime />
        <PageBreadcrumbProvider>
          <AppSidebarProvider>
            <AppSidebar label={navigationLabel} footer={<AppSidebarFooter />}>
              {inSettings ? (
                <>
                  <SettingsBack />
                  <NavigationMenu
                    items={settingsItems}
                    badges={{}}
                    label={navigationLabel}
                    selectedKey={settingsKey}
                  />
                </>
              ) : (
                <NavigationMenu
                  items={menuItems}
                  badges={badges}
                  label={navigationLabel}
                  selectedKey={selectedKey}
                />
              )}
            </AppSidebar>
            <div className='flex min-w-0 flex-1 flex-col'>
              <LayoutHeader className='sticky top-0 z-40 justify-between'>
                <div className='flex min-w-0 items-center gap-3'>
                  <AppSidebarToggle />
                  <div className='h-5 w-px shrink-0 bg-border' />
                  {/* The current page's trail: the route tree's, or the one the page declares (`usePageBreadcrumb`). */}
                  <Breadcrumbs denied={denied} />
                </div>
                <HeaderActions />
              </LayoutHeader>
              {/* The agents' chat panel docks beside main from 1280px and floats over it below, positioned against
            this row (the agent-chat block's README). */}
              <div className='relative flex min-h-0 flex-1'>
                <main className='app-brand-surface relative isolate min-w-0 flex-1 overflow-hidden'>
                  <BrandWatermark className='-z-10' />
                  {/* main only positions; the page scrolls in here, so a child page layer laid over main is neither
              moved by the page's scrolling nor stretched by its height. */}
                  <div className='h-full overflow-y-auto'>
                    <RouteLeaveBoundary hidden={loading}>
                      <Outlet />
                    </RouteLeaveBoundary>
                  </div>
                </main>
                <ChatPanel />
              </div>
              <ChatFloatingButton />
            </div>
          </AppSidebarProvider>
        </PageBreadcrumbProvider>
      </StudioChatProvider>
    </RouteTreeProvider>
  );
}
