/** The issue's agent runs, newest first; a run opens on its transcript. */
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import { HistoryIcon } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { Badge } from '#components/ui/badge';
import { Button } from '#components/ui/button';
import { IssueSection } from '#extensions/nocobase-issue-detail/issue-detail';
import { useIssueRuns, useRunEvents } from '#hooks/use-issue-work';

function RunTranscript({ runId }: { readonly runId: string }): ReactElement {
  const { t } = useTranslation();
  const events = useRunEvents(runId);
  if (events.isLoading)
    return (
      <p className='text-sm text-muted-foreground'>
        {t('issueWork.runs.loading')}
      </p>
    );
  const shown = (events.data ?? []).filter((event) => event.text);
  if (shown.length === 0)
    return (
      <p className='text-sm text-muted-foreground'>
        {t('issueWork.runs.noEvents')}
      </p>
    );
  return (
    <ol
      className='flex max-h-96 flex-col gap-1 overflow-y-auto text-xs'
      data-testid='run-transcript'
    >
      {shown.map((event) => (
        <li key={event.seq} className='flex gap-2'>
          <span className='shrink-0 text-muted-foreground'>
            {event.tool ?? event.type}
          </span>
          <span className='min-w-0 break-words'>{event.text}</span>
        </li>
      ))}
    </ol>
  );
}

export function IssueRuns({
  issueId,
}: {
  readonly issueId: string;
}): ReactElement | null {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const runs = useIssueRuns(issueId);
  const [opened, setOpened] = useState<string | null>(null);
  const items = runs.data ?? [];
  if (items.length === 0) return null;
  return (
    <IssueSection
      icon={<HistoryIcon />}
      title={t('issueWork.runs.title')}
      count={items.length}
      data-testid='issue-runs'
    >
      <ul className='flex flex-col gap-2'>
        {items.map((run) => (
          <li key={run.id} className='flex flex-col gap-2 text-sm'>
            <div className='flex flex-wrap items-center gap-2'>
              <Badge
                variant={run.status === 'failed' ? 'destructive' : 'secondary'}
              >
                {t(`issueWork.runs.status.${run.status}`)}
              </Badge>
              <span className='font-medium'>{run.agent}</span>
              <span className='text-muted-foreground'>
                {new Date(run.createdAt).toLocaleString(locale)}
              </span>
              <Button
                className='ml-auto'
                size='sm'
                variant='ghost'
                aria-expanded={opened === run.id}
                onClick={() => setOpened(opened === run.id ? null : run.id)}
              >
                {t(
                  opened === run.id
                    ? 'issueWork.runs.hide'
                    : 'issueWork.runs.show',
                )}
              </Button>
            </div>
            {run.summary || run.failure ? (
              <p className='text-muted-foreground'>
                {run.failure || run.summary}
              </p>
            ) : null}
            {opened === run.id ? <RunTranscript runId={run.id} /> : null}
          </li>
        ))}
      </ul>
    </IssueSection>
  );
}
