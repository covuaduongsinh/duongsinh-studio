/**
 * Dương Sinh's shortcut in the header: the Inbox, with the number of notices that wait for the person. Since V1.2 the
 * sidebar has one badge, on Today; the sessions shortcut left the header with it (Chat has its own button).
 */
import { useTranslation } from '@nocobase/i18n/client';
import { Inbox } from 'lucide-react';
import type { ReactElement } from 'react';
import { Link } from 'react-router';

import { buttonVariants } from '#components/ui/button';
import { useNavigationCounts } from '#hooks/use-follow-ups';

function QuickLink({
  to,
  label,
  count,
  children,
}: {
  readonly to: string;
  readonly label: string;
  readonly count: number;
  readonly children: ReactElement;
}): ReactElement {
  return (
    <Link
      to={to}
      aria-label={count > 0 ? `${label} (${count})` : label}
      title={label}
      className={`${buttonVariants({ variant: 'ghost', size: 'icon' })} relative`}
    >
      {children}
      {count > 0 ? (
        <span
          aria-hidden='true'
          className='absolute -top-1 -right-1 grid min-w-4 place-items-center rounded-full bg-(--status-warning) px-1 text-[10px] leading-4 font-medium text-primary-foreground tabular-nums'
        >
          {count > 99 ? '99+' : count}
        </span>
      ) : null}
    </Link>
  );
}

export function HeaderQuickLinks(): ReactElement {
  const { t } = useTranslation();
  const counts = useNavigationCounts(true);
  return (
    <>
      <QuickLink
        to='/inbox'
        label={t('navigation.inbox')}
        count={counts.decisions}
      >
        <Inbox />
      </QuickLink>
    </>
  );
}
