/** Settings → Run logs: find the text of any run's events, for administrators (plan S, S6). */
import { useTranslation } from '@nocobase/i18n/client';
import { type FormEvent, type ReactElement, useState } from 'react';
import { Link } from 'react-router';

import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { Button } from '#components/ui/button';
import { Input } from '#components/ui/input';
import { Label } from '#components/ui/label';
import { Skeleton } from '#components/ui/skeleton';
import { useRunLogSearch } from '#hooks/use-run-log-search';

const WINDOWS = [7, 30, 90, 365] as const;

export default function RunLogsPage(): ReactElement {
  const { t, i18n } = useTranslation();
  const [draft, setDraft] = useState('');
  const [text, setText] = useState('');
  const [days, setDays] = useState<number>(30);
  const hits = useRunLogSearch(text, days);
  const submit = (event: FormEvent): void => {
    event.preventDefault();
    setText(draft);
  };
  return (
    <PageContainer>
      <PageHeader
        title={t('runLogs.title')}
        description={t('runLogs.description')}
      />
      <div className='flex flex-col gap-4'>
        <form
          className='flex flex-col gap-3 sm:flex-row sm:items-end'
          onSubmit={submit}
        >
          <div className='flex flex-1 flex-col gap-2'>
            <Label htmlFor='run-log-text'>{t('runLogs.text')}</Label>
            <Input
              id='run-log-text'
              value={draft}
              placeholder={t('runLogs.placeholder')}
              onChange={(event) => setDraft(event.target.value)}
            />
          </div>
          <div className='flex flex-col gap-2'>
            <Label htmlFor='run-log-days'>{t('runLogs.window')}</Label>
            <select
              id='run-log-days'
              className='h-9 rounded-md border bg-background px-3 text-sm'
              value={days}
              onChange={(event) => setDays(Number(event.target.value))}
            >
              {WINDOWS.map((value) => (
                <option key={value} value={value}>
                  {t('runLogs.days', { count: value })}
                </option>
              ))}
            </select>
          </div>
          <Button type='submit' disabled={draft.trim().length < 2}>
            {t('runLogs.search')}
          </Button>
        </form>
        {text.trim().length < 2 ? (
          <p className='text-sm text-muted-foreground'>{t('runLogs.hint')}</p>
        ) : hits.isPending ? (
          <Skeleton className='h-24 w-full' aria-label={t('runLogs.loading')} />
        ) : hits.isError ? (
          <p className='text-sm text-destructive'>{t('runLogs.error')}</p>
        ) : hits.data.length === 0 ? (
          <p className='text-sm text-muted-foreground'>{t('runLogs.empty')}</p>
        ) : (
          <ul className='flex flex-col gap-2'>
            {hits.data.map((hit) => (
              <li
                key={`${hit.runId}:${hit.seq}`}
                className='flex flex-col gap-1 rounded-lg border p-3 text-sm'
              >
                <div className='flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground'>
                  <span>
                    {t('runLogs.step', { seq: hit.seq, type: hit.type })}
                  </span>
                  {hit.at ? (
                    <time dateTime={hit.at}>
                      {new Date(hit.at).toLocaleString(i18n.language)}
                    </time>
                  ) : null}
                </div>
                <p className='break-words'>{hit.snippet}</p>
                {hit.subjectKind === 'issue' && hit.subjectId ? (
                  <Link
                    className='text-xs underline'
                    to={`/issues/${hit.subjectId}`}
                  >
                    {t('runLogs.openIssue')}
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </PageContainer>
  );
}
