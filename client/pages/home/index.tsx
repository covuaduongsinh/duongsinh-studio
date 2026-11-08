/**
 * Home: "my work" for the signed-in person. It answers the two questions they open Studio with, in one screen and without
 * a tap more than needed on a phone: what waits for a decision of mine (each one straight to its issue) and how much of
 * mine is under way. Both read what `/api/inbox/waiting` and `/api/taskGroups/summary` already compute for the inbox and
 * "My issues". Changed from the template's introduction to building with a coding agent, which Studio does not use.
 */
import { useAuthentication } from '@nocobase/app-plugin-authentication/client';
import { useTranslation } from '@nocobase/i18n/client';
import { InboxIcon, ListTodoIcon, FolderKanbanIcon } from 'lucide-react';
import type { ReactElement } from 'react';
import { Link } from 'react-router';

import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { Alert, AlertDescription } from '#components/ui/alert';
import { Badge } from '#components/ui/badge';
import { Button, buttonVariants } from '#components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '#components/ui/card';
import { Skeleton } from '#components/ui/skeleton';
import { entryLink } from '#extensions/nocobase-inbox/model';
import { useMyWorkSummary, useWaitingDecisions } from '#hooks/use-my-work';

/** How many waiting decisions are listed on the page; the rest are in the inbox. */
const SHOWN = 5;

function Waiting(): ReactElement {
  const { t } = useTranslation();
  const summary = useMyWorkSummary();
  const waiting = useWaitingDecisions();
  const entries = waiting.data ?? [];
  // The summary counts every issue that waits; the list can be shorter if some entries cannot be shown.
  const count = summary.data?.waiting ?? entries.length;

  return (
    <Card>
      <section aria-labelledby='home-waiting'>
        <CardHeader className='flex flex-row items-baseline justify-between gap-2'>
          <CardTitle id='home-waiting'>{t('myHome.waiting.title')}</CardTitle>
          {waiting.data ? (
            <span className='text-3xl font-semibold'>{count}</span>
          ) : null}
        </CardHeader>
        <CardContent className='flex flex-col gap-3'>
          {waiting.isPending ? <Skeleton className='h-20 w-full' /> : null}
          {waiting.isError ? (
            <Alert variant='destructive'>
              <AlertDescription className='flex flex-wrap items-center gap-2'>
                {t('myHome.waiting.failed')}
                <Button
                  size='sm'
                  variant='outline'
                  onClick={() => void waiting.refetch()}
                >
                  {t('myHome.retry')}
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}
          {waiting.data && entries.length === 0 ? (
            <p className='text-sm text-muted-foreground'>
              {t('myHome.waiting.none')}
            </p>
          ) : null}
          {entries.length > 0 ? (
            <ul className='flex flex-col divide-y'>
              {entries.slice(0, SHOWN).map((entry) => {
                const href = entryLink(entry) ?? '/inbox';
                return (
                  <li key={entry.item.id}>
                    <Link
                      to={href}
                      className='flex flex-col gap-1 py-3 hover:bg-muted/50 sm:flex-row sm:items-center sm:gap-3'
                    >
                      <Badge variant='secondary' className='w-fit shrink-0'>
                        {t(
                          `inboxStudio.type.${entry.notice?.type ?? 'answer'}`,
                        )}
                      </Badge>
                      <span className='min-w-0 flex-1'>
                        <span className='block truncate font-medium'>
                          {entry.item.title}
                        </span>
                        {entry.item.body ? (
                          <span className='block truncate text-sm text-muted-foreground'>
                            {entry.item.body}
                          </span>
                        ) : null}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : null}
          {entries.length > SHOWN ? (
            <Link
              to='/inbox'
              className='text-sm font-medium underline-offset-4 hover:underline'
            >
              {t('myHome.waiting.seeAll', { count })}
            </Link>
          ) : null}
        </CardContent>
      </section>
    </Card>
  );
}

function UnderWay(): ReactElement {
  const { t } = useTranslation();
  const summary = useMyWorkSummary();
  // Open issues of mine that do not need a decision of mine: the agents are working on them.
  const working = summary.data
    ? Math.max(0, summary.data.mine.open - summary.data.mine.waiting)
    : null;
  return (
    <Card>
      <section aria-labelledby='home-working'>
        <CardHeader className='flex flex-row items-baseline justify-between gap-2'>
          <CardTitle id='home-working'>{t('myHome.working.title')}</CardTitle>
          {working !== null ? (
            <span className='text-3xl font-semibold'>{working}</span>
          ) : null}
        </CardHeader>
        <CardContent className='flex flex-col gap-3'>
          {summary.isPending ? <Skeleton className='h-10 w-full' /> : null}
          {summary.isError ? (
            <p className='text-sm text-destructive'>
              {t('myHome.working.failed')}
            </p>
          ) : null}
          {working !== null ? (
            <p className='text-sm text-muted-foreground'>
              {working === 0
                ? t('myHome.working.none')
                : t('myHome.working.text')}
            </p>
          ) : null}
          <div>
            <Link
              to='/my-issues'
              className={buttonVariants({ variant: 'outline' })}
            >
              {t('myHome.working.open')}
            </Link>
          </div>
        </CardContent>
      </section>
    </Card>
  );
}

export default function HomePage(): ReactElement {
  const { t } = useTranslation();
  const { session } = useAuthentication();
  const name = (session?.user as { name?: string } | undefined)?.name ?? '';
  return (
    <PageContainer className='mx-auto max-w-4xl'>
      <PageHeader
        title={name ? t('myHome.title', { name }) : t('myHome.titleAnonymous')}
        description={t('myHome.description')}
      />
      <nav aria-label={t('myHome.shortcuts')} className='flex flex-wrap gap-2'>
        <Link
          to='/my-issues'
          className={buttonVariants({ variant: 'outline' })}
        >
          <ListTodoIcon data-icon='inline-start' />
          {t('myHome.links.myIssues')}
        </Link>
        <Link to='/inbox' className={buttonVariants({ variant: 'outline' })}>
          <InboxIcon data-icon='inline-start' />
          {t('myHome.links.inbox')}
        </Link>
        <Link to='/projects' className={buttonVariants({ variant: 'outline' })}>
          <FolderKanbanIcon data-icon='inline-start' />
          {t('myHome.links.projects')}
        </Link>
      </nav>
      <div className='grid gap-4 md:grid-cols-[3fr_2fr]'>
        <Waiting />
        <UnderWay />
      </div>
    </PageContainer>
  );
}
