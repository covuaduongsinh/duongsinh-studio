/**
 * The "Back" row above the settings modules in the sidebar: it returns to the page the person was on before they
 * opened Settings. The shell remembers that page (`useRememberOutsideSettings`) for as long as the tab lives; without
 * one (a direct link into Settings) Back goes to the home page.
 */
import { useTranslation } from '@nocobase/i18n/client';
import { ArrowLeft } from 'lucide-react';
import type { ReactElement } from 'react';
import { Link } from 'react-router';

import { readSettingsReturn } from './settings-return.js';

export function SettingsBack(): ReactElement {
  const { t } = useTranslation();
  return (
    <Link
      to={readSettingsReturn()}
      className='mx-2 mb-1 flex items-center gap-2 rounded-md px-2 py-2 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent'
    >
      <ArrowLeft aria-hidden='true' className='size-4' />
      {t('settingsStudio.back')}
    </Link>
  );
}
