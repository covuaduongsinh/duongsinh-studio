import type { ReactElement } from 'react';
import { Navigate, useLocation } from 'react-router';

/**
 * A settings entry that only forwards to a page which lives elsewhere (`/settings/go/agents` -> `/agents`); see
 * `settingsShortcutRoutes` in `client/routes.ts`. The query string and hash are kept.
 */
export default function SettingsShortcut(): ReactElement {
  const { pathname, search, hash } = useLocation();
  const target = pathname.replace(/^\/settings\/go(?=\/)/u, '');
  return <Navigate replace to={`${target}${search}${hash}`} />;
}
