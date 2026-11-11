/**
 * Dương Sinh's two shortcuts in the header, as the demo has them: My sessions and the Inbox, each with the number of
 * things waiting for the person (the same counts as the sidebar's badges).
 */
import { useTranslation } from '@nocobase/i18n/client';
import { Inbox, Sparkles } from 'lucide-react';
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
        to='/sessions'
        label={t('navigation.mySessions')}
        count={counts.sessions}
      >
        <Sparkles />
      </QuickLink>
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
