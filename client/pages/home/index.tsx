/**
 * Today: the signed-in person's one screen (V1.1). In a single column on a phone, without a tap: what needs them (decisions
 * on their issues, conversations asking for them, releases waiting), what the agents are doing now, and what just failed
 * or finished. It replaces the template's introduction to building with a coding agent, and the first version of "my work",
 * which was silent about chat and releases. One read for all of it: `client/hooks/use-today.ts`.
 */
import { useTranslation } from '@nocobase/i18n/client';
import { EyeIcon, InboxIcon, ListTodoIcon } from 'lucide-react';
import type { ReactElement } from 'react';
import { Link } from 'react-router';

import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { Alert, AlertDescription } from '#components/ui/alert';
import { Badge } from '#components/ui/badge';
import { Button, buttonVariants } from '#components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '#components/ui/card';
import { Skeleton } from '#components/ui/skeleton';
import { entryLink, relativeTime } from '#extensions/nocobase-inbox/model';
import {
  needMeTotal,
  releasesWaiting,
  useToday,
  type Today,
} from '#hooks/use-today';

/** Rows shown in each list; the rest are one tap away on the page the list links to. */
const SHOWN = 5;
const RECENT_SHOWN = 3;
const ACTIVITY_CHARS = 80;

const cut = (text: string, length: number): string =>
  text.length > length ? `${text.slice(0, length - 1)}…` : text;

function Row({
  badge,
  title,
  note,
  to,
}: {
  readonly badge: string;
  readonly title: string;
  readonly note?: string | null;
  readonly to: string;
}): ReactElement {
  return (
    <li>
      <Link
        to={to}
        className='flex flex-col gap-1 py-3 hover:bg-muted/50 sm:flex-row sm:items-center sm:gap-3'
      >
        <Badge variant='secondary' className='w-fit shrink-0'>
          {badge}
        </Badge>
        <span className='min-w-0 flex-1'>
          <span className='block truncate font-medium'>{title}</span>
          {note ? (
            <span className='block truncate text-sm text-muted-foreground'>
              {note}
            </span>
          ) : null}
        </span>
      </Link>
    </li>
  );
}

function NeedMe({ today }: { readonly today: Today }): ReactElement {
  const { t } = useTranslation();
  const entries = today.waiting ?? [];
  const chat = today.chat?.needsYou ?? 0;
  const releases = releasesWaiting(today.release);
  const total = needMeTotal(today);
  return (
    <Card>
      <section aria-labelledby='today-need-me'>
        <CardHeader className='flex flex-row items-baseline justify-between gap-2'>
          <CardTitle id='today-need-me'>{t('today.needMe.title')}</CardTitle>
          <span className='text-3xl font-semibold'>{total}</span>
        </CardHeader>
        <CardContent className='flex flex-col gap-3'>
          {total === 0 ? (
            <p className='text-sm text-muted-foreground'>
              {t('today.needMe.none')}
            </p>
          ) : (
            <ul className='flex flex-col divide-y'>
              {entries.slice(0, SHOWN).map((entry) => (
                <Row
                  key={entry.item.id}
                  badge={t(
                    `inboxStudio.type.${entry.notice?.type ?? 'answer'}`,
                  )}
                  note={entry.item.body}
                  title={entry.item.title}
                  to={entryLink(entry) ?? '/inbox'}
                />
              ))}
              {chat > 0 ? (
                <Row
                  badge={t('today.needMe.chatBadge')}
                  title={t('today.needMe.chat', { count: chat })}
                  to='/sessions'
                />
              ) : null}
              {releases > 0 ? (
                <Row
                  badge={t('today.needMe.releaseBadge')}
                  title={t('today.needMe.release', { count: releases })}
                  to='/releases?tab=pending'
                />
              ) : null}
            </ul>
          )}
          {entries.length > SHOWN ? (
            <Link
              to='/inbox?view=todo'
              className='text-sm font-medium underline-offset-4 hover:underline'
            >
              {t('today.needMe.seeAll', { count: entries.length })}
            </Link>
          ) : null}
        </CardContent>
      </section>
    </Card>
  );
}

function AgentsNow({ today }: { readonly today: Today }): ReactElement | null {
  const { i18n, t } = useTranslation();
  const board = today.agents;
  if (board === null) return null;
  const rows = board.rows
    .filter((row) => row.state === 'working' || row.state === 'queued')
    .slice(0, SHOWN);
  return (
    <Card>
      <section aria-labelledby='today-agents'>
        <CardHeader>
          <CardTitle id='today-agents'>{t('today.agents.title')}</CardTitle>
          <p className='text-sm text-muted-foreground'>
            {t('today.agents.summary', {
              working: board.summary.working,
              queued: board.summary.queued,
              waiting: board.summary.waiting,
            })}
          </p>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className='text-sm text-muted-foreground'>
              {t('today.agents.none')}
            </p>
          ) : (
            <ul className='flex flex-col divide-y'>
              {rows.map((row) => {
                const agent = board.agents[row.agentId]?.name ?? '';
                const activity = row.run?.lastActivity?.text;
                const since = row.run?.since
                  ? t('today.agents.since', {
                      time: relativeTime(row.run.since, i18n.language),
                    })
                  : null;
                return (
                  <Row
                    key={`${row.agentId}:${row.issue.id}`}
                    badge={t(
                      row.state === 'working'
                        ? 'today.agents.working'
                        : 'today.agents.queued',
                    )}
                    note={[
                      agent,
                      since,
                      activity ? cut(activity, ACTIVITY_CHARS) : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    title={`${row.issue.identifier} ${row.issue.title}`}
                    to={`/issues/${row.issue.id}`}
                  />
                );
              })}
            </ul>
          )}
        </CardContent>
      </section>
    </Card>
  );
}

function Recent({ today }: { readonly today: Today }): ReactElement | null {
  const { t } = useTranslation();
  const attention = today.attention;
  if (attention === null && today.done === null) return null;
  const trouble = [
    ...(attention?.failedRuns.items ?? []).map((run) => ({
      key: `run:${run.id}`,
      badge: t('today.recent.failedRun'),
      title: `${run.issue.identifier} ${run.issue.title}`,
      note: run.agentName,
      to: `/issues/${run.issue.id}`,
    })),
    ...(attention?.blocked.items ?? []).map((issue) => ({
      key: `blocked:${issue.id}`,
      badge: t('today.recent.blocked'),
      title: `${issue.identifier} ${issue.title}`,
      note: null,
      to: `/issues/${issue.id}`,
    })),
  ].slice(0, SHOWN);
  const done = (today.done ?? []).slice(0, RECENT_SHOWN);
  return (
    <Card>
      <section aria-labelledby='today-recent'>
        <CardHeader>
          <CardTitle id='today-recent'>{t('today.recent.title')}</CardTitle>
        </CardHeader>
        <CardContent className='flex flex-col gap-4'>
          {attention !== null ? (
            <div className='flex flex-col gap-1'>
              <h3 className='text-sm font-medium'>
                {t('today.recent.trouble')}
              </h3>
              {trouble.length === 0 ? (
                <p className='text-sm text-muted-foreground'>
                  {t('today.recent.troubleNone')}
                </p>
              ) : (
                <ul className='flex flex-col divide-y'>
                  {trouble.map((item) => (
                    <Row
                      key={item.key}
                      badge={item.badge}
                      note={item.note}
                      title={item.title}
                      to={item.to}
                    />
                  ))}
                </ul>
              )}
            </div>
          ) : null}
          {today.done !== null ? (
            <div className='flex flex-col gap-1'>
              <h3 className='text-sm font-medium'>{t('today.recent.done')}</h3>
              {done.length === 0 ? (
                <p className='text-sm text-muted-foreground'>
                  {t('today.recent.doneNone')}
                </p>
              ) : (
                <ul className='flex flex-col divide-y'>
                  {done.map((row) => (
                    <Row
                      key={row.issue.id}
                      badge={t('today.recent.doneBadge')}
                      title={`${row.issue.identifier} ${row.issue.title}`}
                      to={`/issues/${row.issue.id}`}
                    />
                  ))}
                </ul>
              )}
            </div>
          ) : null}
          <Link
            to='/dashboard'
            className='text-sm font-medium underline-offset-4 hover:underline'
          >
            {t('today.recent.fullReport')}
          </Link>
        </CardContent>
      </section>
    </Card>
  );
}

export default function HomePage(): ReactElement {
  const { t } = useTranslation();
  const today = useToday();
  // Every source failed: nothing can be shown, so say so once and offer a retry.
  const nothing = today.data !== undefined && today.data.failed.length >= 6;
  return (
    <PageContainer className='mx-auto max-w-2xl'>
      <PageHeader
        title={t('today.title')}
        description={t('today.description')}
      />
      {today.isPending ? (
        <Skeleton aria-label={t('today.loading')} className='h-48 w-full' />
      ) : null}
      {today.isError || nothing ? (
        <Alert variant='destructive'>
          <AlertDescription className='flex flex-wrap items-center gap-2'>
            {t('today.failed')}
            <Button
              size='sm'
              variant='outline'
              onClick={() => void today.refetch()}
            >
              {t('today.retry')}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      {today.data && !nothing ? (
        <div className='flex flex-col gap-4'>
          <NeedMe today={today.data} />
          <AgentsNow today={today.data} />
          <Recent today={today.data} />
          {/* Pages that left the sidebar (V1.2) stay one tap from here. */}
          <nav
            aria-label={t('today.links.label')}
            className='flex flex-wrap gap-2'
          >
            <Link
              to='/inbox'
              className={buttonVariants({ variant: 'outline' })}
            >
              <InboxIcon data-icon='inline-start' />
              {t('today.links.inbox')}
            </Link>
            <Link
              to='/my-issues'
              className={buttonVariants({ variant: 'outline' })}
            >
              <ListTodoIcon data-icon='inline-start' />
              {t('today.links.myIssues')}
            </Link>
            <Link
              to='/follow-ups'
              className={buttonVariants({ variant: 'outline' })}
            >
              <EyeIcon data-icon='inline-start' />
              {t('today.links.following')}
            </Link>
          </nav>
        </div>
      ) : null}
    </PageContainer>
  );
}
