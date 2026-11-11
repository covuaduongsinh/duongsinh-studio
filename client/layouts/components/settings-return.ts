/** Where Back in the settings sidebar goes: the last page outside Settings, kept for as long as the tab lives. */
import { useEffect } from 'react';
import { useLocation } from 'react-router';

import { isSettingsPath } from '#lib/navigation-transform';

const STORAGE_KEY = 'studio:settings:return';

export function readSettingsReturn(): string {
  try {
    const stored = window.sessionStorage.getItem(STORAGE_KEY);
    // Only a path inside the application: nothing stored from elsewhere is followed.
    return stored?.startsWith('/') && !stored.startsWith('//') ? stored : '/';
  } catch {
    return '/';
  }
}

/** Remembers the last page outside Settings, so Back has somewhere to go. */
export function useRememberOutsideSettings(): void {
  const { pathname, search } = useLocation();
  useEffect(() => {
    if (isSettingsPath(pathname)) return;
    try {
      window.sessionStorage.setItem(STORAGE_KEY, pathname + search);
    } catch {
      // Back falls back to the home page.
    }
  }, [pathname, search]);
}
