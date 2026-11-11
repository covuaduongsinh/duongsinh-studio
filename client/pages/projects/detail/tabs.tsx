/** The row of tabs under a project's header: each is a route under `/projects/:projectId`. */
import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';
import { NavLink } from 'react-router';

import { cn } from 'cn';

export interface ProjectTab {
  readonly key: string;
  readonly count?: number | null;
}

export function ProjectTabs({
  tabs,
}: {
  readonly tabs: readonly ProjectTab[];
}): ReactElement {
  const { t } = useTranslation();
  return (
    <nav
      aria-label={t('projectDetail.tabsLabel')}
      className='flex flex-wrap gap-1 border-b'
    >
      {tabs.map(({ key, count }) => (
        <NavLink
          key={key}
          to={key}
          className={({ isActive }) =>
            cn(
              '-mb-px border-b-2 px-3 py-2 text-sm transition-colors',
              isActive
                ? 'border-primary font-medium text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )
          }
        >
          {t(`projectDetail.tabs.${key}`)}
          {count !== undefined && count !== null && count > 0 ? (
            <>
              {' '}
              <span className='text-xs tabular-nums text-muted-foreground'>
                {count}
              </span>
            </>
          ) : null}
        </NavLink>
      ))}
    </nav>
  );
}
