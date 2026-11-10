/**
 * The header that stays at the top while an issue's page scrolls: status, identifier, a shortened title, Merge when
 * there is a pull request to merge, and a way back to the top. It appears once the page's scroll container has moved
 * past the title. The container is found from the scroll event itself (whichever ancestor of the page scrolls), so the
 * page does not depend on how the shell lays its content out.
 */
import { useTranslation } from '@nocobase/i18n/client';
import { ArrowUpIcon } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';

import { Button } from '#components/ui/button';

export function IssueStickyHeader({
  identifier,
  title,
  status,
  actions,
  onTop,
}: {
  readonly identifier: string;
  readonly title: string;
  readonly status: ReactNode;
  /** Beside the way back to the top, such as Merge. */
  readonly actions?: ReactNode;
  readonly onTop: () => void;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <div
      data-testid='issue-sticky-header'
      className='sticky top-0 z-10 -mx-4 flex items-center gap-3 border-b bg-background/95 px-4 py-2 backdrop-blur md:-mx-6 md:px-6'
    >
      {status}
      <span className='shrink-0 font-mono text-xs text-muted-foreground'>
        {identifier}
      </span>
      <span className='min-w-0 flex-1 truncate text-sm font-medium'>
        {title}
      </span>
      {actions}
      <Button
        type='button'
        variant='ghost'
        size='sm'
        onClick={onTop}
        aria-label={t('issueDetail.backToTop')}
      >
        <ArrowUpIcon data-icon='inline-start' />
        {t('issueDetail.backToTop')}
      </Button>
    </div>
  );
}
