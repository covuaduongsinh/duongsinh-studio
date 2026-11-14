import { useTranslation } from '@nocobase/i18n/client';
import { BotIcon, OctagonAlertIcon } from 'lucide-react';
import type { ReactElement } from 'react';

import { useIssueReactions } from '#hooks/use-reactions';

/** One line for each time Studio woke the agent or stopped for a person on its own (T1.5). */
export function IssueReactions({
  issueId,
}: {
  readonly issueId: string;
}): ReactElement | null {
  const { t, i18n } = useTranslation();
  const reactions = useIssueReactions(issueId);
  if (!reactions.data || reactions.data.length === 0) return null;
  return (
    <section
      className='flex flex-col gap-2'
      aria-label={t('reactions.issue.title')}
    >
      <h3 className='text-sm font-medium'>{t('reactions.issue.title')}</h3>
      <ul className='flex flex-col gap-1 text-sm'>
        {reactions.data.map((item) => (
          <li key={item.id} className='flex items-start gap-2'>
            {item.kind === 'blocked' ? (
              <OctagonAlertIcon className='mt-0.5 size-4 shrink-0 text-destructive' />
            ) : (
              <BotIcon className='mt-0.5 size-4 shrink-0 text-muted-foreground' />
            )}
            <span className='min-w-0'>
              {item.kind === 'blocked'
                ? t('reactions.issue.blocked', { reason: item.reason ?? '' })
                : t('reactions.issue.reacted', {
                    event: item.event
                      ? t(`reactions.events.${item.event}.title`)
                      : '',
                    attempt: item.attempt ?? 1,
                  })}
              <time
                className='ml-2 text-xs text-muted-foreground'
                dateTime={item.createdAt}
              >
                {new Date(item.createdAt).toLocaleString(i18n.language)}
              </time>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
