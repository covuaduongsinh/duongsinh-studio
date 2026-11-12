/** `/dashboard`: how delivery goes, how the agents perform, and what is stuck now. */
import { useTranslation } from '@nocobase/i18n/client';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowDownRight, ArrowUpRight, RefreshCw } from 'lucide-react';
import { useState, type ReactElement, type ReactNode } from 'react';
import { Link } from 'react-router';

import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { Badge } from '#components/ui/badge';
import { Button } from '#components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#components/ui/card';
import { Skeleton } from '#components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#components/ui/table';
import {
  REPORTS_KEY,
  useAgentsReport,
  useAttentionReport,
  useDeliveryReport,
  useProjectsReport,
  type DeliveryReport,
  type ReportDays,
} from '#hooks/use-reports';

import { BudgetUsage } from './budget-usage.js';
import { BenchSection } from './bench-section.js';
import { FlowSection } from './flow-section.js';

import { RunsChart } from './runs-chart.js';
import { Sparkline } from './sparkline.js';

const PERIODS: readonly ReportDays[] = [7, 30, 90];

type Translate = ReturnType<typeof useTranslation>['t'];
type DeltaKind = 'relative' | 'points';

/** A length of time in the largest unit that reads as a whole number. */
function formatDuration(t: Translate, ms: number | null): string {
  if (ms === null) return t('dashboard.none');
  if (ms < 60_000)
    return t('dashboard.duration.seconds', { count: Math.round(ms / 1000) });
  if (ms < 3_600_000)
    return t('dashboard.duration.minutes', {
      count: Math.round(ms / 60_000),
    });
  if (ms < 86_400_000)
    return t('dashboard.duration.hours', { count: Math.round(ms / 3_600_000) });
  return t('dashboard.duration.days', {
    count: Math.round(ms / 8_640_000) / 10,
  });
}

const formatPercent = (t: Translate, value: number | null): string =>
  value === null
    ? t('dashboard.none')
    : t('dashboard.percent', { value: Math.round(value * 100) });

function Delta({
  before,
  current,
  kind,
  upIsGood,
}: {
  readonly before: number | null;
  readonly current: number | null;
  readonly kind: DeltaKind;
  readonly upIsGood: boolean;
}): ReactElement | null {
  const { t } = useTranslation();
  if (before === null || current === null) return null;
  const change =
    kind === 'points'
      ? Math.round((current - before) * 100)
      : before === 0
        ? null
        : Math.round(((current - before) / before) * 100);
  if (change === null) return null;
  if (change === 0)
    return (
      <span className='text-xs text-muted-foreground'>
        {t('dashboard.noChange')}
      </span>
    );
  const good = change > 0 === upIsGood;
  const Icon = change > 0 ? ArrowUpRight : ArrowDownRight;
  const signed = `${change > 0 ? '+' : '−'}${Math.abs(change)}`;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs ${good ? 'text-primary' : 'text-destructive'}`}
    >
      <Icon aria-hidden className='size-3' />
      {t(
        kind === 'points' ? 'dashboard.deltaPoints' : 'dashboard.deltaPercent',
        {
          value: signed,
        },
      )}
    </span>
  );
}

function StatTile({
  before,
  beforeText,
  current,
  kind,
  label,
  note,
  points,
  upIsGood,
  value,
}: {
  /** Under the figure, after the comparison: what else the figure stands for (the tokens behind a cost). */
  readonly note?: ReactNode;
  readonly before: number | null;
  readonly beforeText: string;
  readonly current: number | null;
  readonly kind: DeltaKind;
  readonly label: string;
  readonly points: readonly { label: string; value: number | null }[];
  readonly upIsGood: boolean;
  readonly value: string;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Card aria-label={label} role='group'>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className='text-2xl font-semibold'>{value}</CardTitle>
        <div className='flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground'>
          <Delta
            before={before}
            current={current}
            kind={kind}
            upIsGood={upIsGood}
          />
          <span>{t('dashboard.before', { value: beforeText })}</span>
        </div>
        {note ? (
          <div className='text-xs text-muted-foreground'>{note}</div>
        ) : null}
      </CardHeader>
      <CardContent>
        <Sparkline points={points} />
      </CardContent>
    </Card>
  );
}

function AgentFigure({
  children,
  label,
  value,
}: {
  readonly children?: ReactNode;
  readonly label: string;
  readonly value: string;
}): ReactElement {
  return (
    <div className='flex flex-col gap-1'>
      <span className='text-sm text-muted-foreground'>{label}</span>
      <span className='text-lg font-semibold'>{value}</span>
      {children}
    </div>
  );
}

function AttentionCard({
  children,
  title,
  more,
  total,
}: {
  readonly children: ReactNode;
  readonly title: string;
  readonly more: number;
  readonly total: number;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Card aria-label={title} role='region'>
      <CardHeader>
        <CardTitle className='flex items-center gap-2 text-sm font-medium'>
          {title}
          <Badge variant='secondary'>{total}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <p className='text-sm text-muted-foreground'>
            {t('dashboard.attention.empty')}
          </p>
        ) : (
          <ul className='flex flex-col divide-y text-sm'>{children}</ul>
        )}
        {more > 0 ? (
          <p className='mt-2 text-xs text-muted-foreground'>
            {t('dashboard.attention.more', { count: more })}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function AttentionRow({
  aside,
  identifier,
  title,
  to,
  href,
}: {
  readonly aside: string;
  readonly identifier: string;
  readonly title: string;
  readonly to?: string;
  readonly href?: string;
}): ReactElement {
  const text = (
    <>
      <span className='mr-2 font-mono text-xs text-muted-foreground'>
        {identifier}
      </span>
      {title}
    </>
  );
  return (
    <li className='flex items-baseline justify-between gap-3 py-2'>
      {to ? (
        <Link
          className='min-w-0 truncate underline-offset-4 hover:underline'
          to={to}
        >
          {text}
        </Link>
      ) : (
        <a
          className='min-w-0 truncate underline-offset-4 hover:underline'
          href={href}
          rel='noreferrer'
          target='_blank'
        >
          {text}
        </a>
      )}
      <span className='shrink-0 text-xs text-muted-foreground'>{aside}</span>
    </li>
  );
}

export default function DashboardPage(): ReactElement {
  const { i18n, t } = useTranslation();
  const queryClient = useQueryClient();
  const [days, setDays] = useState<ReportDays>(30);
  const delivery = useDeliveryReport(days);
  const agents = useAgentsReport(days);
  const projects = useProjectsReport(days);
  const attention = useAttentionReport();

  const day = (value: string): string =>
    new Intl.DateTimeFormat(i18n.language, {
      day: '2-digit',
      month: '2-digit',
      timeZone: 'UTC',
    }).format(new Date(value.length === 10 ? `${value}T00:00:00Z` : value));
  const tokens = (value: number | null): string =>
    value === null
      ? t('dashboard.none')
      : new Intl.NumberFormat(i18n.language, {
          notation: 'compact',
          maximumFractionDigits: 1,
        }).format(value);
  const currency = delivery.data?.currency ?? 'USD';
  const priced = (
    costs: Readonly<Record<string, number>> | null,
  ): number | null => costs?.[currency] ?? null;
  const money = (value: number | null): string =>
    value === null
      ? t('dashboard.none')
      : new Intl.NumberFormat(i18n.language, {
          style: 'currency',
          currency,
          maximumFractionDigits: value < 1 ? 3 : 2,
        }).format(value);
  const waited = (since: string): string =>
    t('dashboard.attention.for', {
      // As of when the list was read, so it stands still between refreshes.
      duration: formatDuration(t, attention.dataUpdatedAt - Date.parse(since)),
    });

  const report = delivery.data;
  const series = (
    pick: (figures: DeliveryReport['buckets'][number]) => number | null,
  ) =>
    (report?.buckets ?? []).map((bucket) => ({
      label:
        bucket.from === bucket.to
          ? day(bucket.from)
          : `${day(bucket.from)} – ${day(bucket.to)}`,
      value: pick(bucket),
    }));

  const failed = delivery.isError || agents.isError || attention.isError;

  return (
    <PageContainer>
      <PageHeader
        title={t('dashboard.title')}
        description={t('dashboard.description')}
        actions={
          <>
            {PERIODS.map((period) => (
              <Button
                key={period}
                aria-pressed={days === period}
                size='sm'
                variant={days === period ? 'default' : 'outline'}
                onClick={() => setDays(period)}
              >
                {t('dashboard.days', { count: period })}
              </Button>
            ))}
            <Button
              aria-label={t('dashboard.refresh')}
              size='icon-sm'
              variant='outline'
              onClick={() =>
                void queryClient.invalidateQueries({ queryKey: REPORTS_KEY })
              }
            >
              <RefreshCw aria-hidden />
            </Button>
          </>
        }
      />
      {failed ? (
        <p className='text-sm text-destructive'>{t('dashboard.failed')}</p>
      ) : null}
      {report && !report.subjects ? (
        <p className='text-sm text-muted-foreground'>
          {t('dashboard.noSubjects')}
        </p>
      ) : null}

      <div className='flex flex-col gap-6'>
        {report ? (
          <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
            <StatTile
              before={report.previous.completed}
              beforeText={String(report.previous.completed)}
              current={report.current.completed}
              kind='relative'
              label={t('dashboard.completed')}
              points={series((figures) => figures.completed)}
              upIsGood
              value={String(report.current.completed)}
            />
            <StatTile
              before={report.previous.cycleTimeP50Ms}
              beforeText={formatDuration(t, report.previous.cycleTimeP50Ms)}
              current={report.current.cycleTimeP50Ms}
              kind='relative'
              label={t('dashboard.cycleTime')}
              points={series((figures) => figures.cycleTimeP50Ms)}
              upIsGood={false}
              value={formatDuration(t, report.current.cycleTimeP50Ms)}
            />
            <StatTile
              before={report.previous.agentShare}
              beforeText={formatPercent(t, report.previous.agentShare)}
              current={report.current.agentShare}
              kind='points'
              label={t('dashboard.agentShare')}
              points={series((figures) => figures.agentShare)}
              upIsGood
              value={formatPercent(t, report.current.agentShare)}
            />
            <StatTile
              before={priced(report.previous.costPerIssue)}
              beforeText={money(priced(report.previous.costPerIssue))}
              current={priced(report.current.costPerIssue)}
              kind='relative'
              label={t('dashboard.costPerIssue')}
              note={
                <>
                  {t('dashboard.tokensNote', {
                    value: tokens(report.current.tokensPerIssue),
                  })}
                  {report.current.costPerIssue === null ? (
                    <>
                      {' · '}
                      <Link
                        className='underline underline-offset-4'
                        to='/usage'
                      >
                        {t('dashboard.setPrices')}
                      </Link>
                    </>
                  ) : null}
                </>
              }
              points={series((figures) => figures.costPerIssue)}
              upIsGood={false}
              value={
                report.current.costPerIssue === null
                  ? t('dashboard.noPrice')
                  : money(priced(report.current.costPerIssue))
              }
            />
          </div>
        ) : delivery.isLoading ? (
          <Skeleton
            aria-label={t('dashboard.loading')}
            className='h-40 w-full'
          />
        ) : null}

        <BudgetUsage />
        <BenchSection />
        <FlowSection days={days} duration={(ms) => formatDuration(t, ms)} />

        {agents.data ? (
          <Card>
            <CardHeader>
              <CardTitle>{t('dashboard.agents.title')}</CardTitle>
              <CardDescription>
                {t('dashboard.agents.description')}
              </CardDescription>
            </CardHeader>
            <CardContent className='flex flex-col gap-6'>
              <div className='grid gap-4 sm:grid-cols-3 xl:grid-cols-5'>
                <AgentFigure
                  label={t('dashboard.agents.successRate')}
                  value={formatPercent(t, agents.data.current.successRate)}
                >
                  <Delta
                    before={agents.data.previous.successRate}
                    current={agents.data.current.successRate}
                    kind='points'
                    upIsGood
                  />
                </AgentFigure>
                <AgentFigure
                  label={t('dashboard.agents.reworkRate')}
                  value={formatPercent(t, agents.data.current.reworkRate)}
                >
                  <Delta
                    before={agents.data.previous.reworkRate}
                    current={agents.data.current.reworkRate}
                    kind='points'
                    upIsGood={false}
                  />
                </AgentFigure>
                <AgentFigure
                  label={t('dashboard.agents.runsPerIssue')}
                  value={
                    agents.data.current.runsPerIssue === null
                      ? t('dashboard.none')
                      : String(Math.round(agents.data.current.runsPerIssue))
                  }
                >
                  <Delta
                    before={agents.data.previous.runsPerIssue}
                    current={agents.data.current.runsPerIssue}
                    kind='relative'
                    upIsGood={false}
                  />
                </AgentFigure>
                <AgentFigure
                  label={t('dashboard.agents.interventionRate')}
                  value={formatPercent(t, agents.data.current.interventionRate)}
                >
                  <Delta
                    before={agents.data.previous.interventionRate}
                    current={agents.data.current.interventionRate}
                    kind='points'
                    upIsGood={false}
                  />
                </AgentFigure>
                <AgentFigure
                  label={t('dashboard.agents.queueWait')}
                  value={formatDuration(t, agents.data.current.queueWaitP50Ms)}
                >
                  <Delta
                    before={agents.data.previous.queueWaitP50Ms}
                    current={agents.data.current.queueWaitP50Ms}
                    kind='relative'
                    upIsGood={false}
                  />
                </AgentFigure>
              </div>
              <RunsChart daily={agents.data.daily} dayText={day} />
            </CardContent>
          </Card>
        ) : null}

        {attention.data ? (
          <section
            aria-label={t('dashboard.attention.title')}
            className='flex flex-col gap-3'
          >
            <div>
              <h2 className='font-heading text-base font-medium'>
                {t('dashboard.attention.title')}
              </h2>
              <p className='text-sm text-muted-foreground'>
                {t('dashboard.attention.description')}
              </p>
            </div>
            <div className='grid gap-4 lg:grid-cols-2'>
              <AttentionCard
                more={
                  attention.data.blocked.total -
                  attention.data.blocked.items.length
                }
                title={t('dashboard.attention.blocked')}
                total={attention.data.blocked.total}
              >
                {attention.data.blocked.items.map((item) => (
                  <AttentionRow
                    key={item.id}
                    aside={waited(item.since)}
                    identifier={item.identifier}
                    title={item.title}
                    to={`/issues/${item.id}`}
                  />
                ))}
              </AttentionCard>
              <AttentionCard
                more={
                  attention.data.overdue.total -
                  attention.data.overdue.items.length
                }
                title={t('dashboard.attention.overdue')}
                total={attention.data.overdue.total}
              >
                {attention.data.overdue.items.map((item) => (
                  <AttentionRow
                    key={item.id}
                    aside={t('dashboard.attention.due', {
                      day: day(item.since),
                    })}
                    identifier={item.identifier}
                    title={item.title}
                    to={`/issues/${item.id}`}
                  />
                ))}
              </AttentionCard>
              <AttentionCard
                more={
                  attention.data.reviewWaits.total -
                  attention.data.reviewWaits.items.length
                }
                title={t('dashboard.attention.reviewWaits')}
                total={attention.data.reviewWaits.total}
              >
                {attention.data.reviewWaits.items.map((item) => (
                  <AttentionRow
                    key={item.id}
                    aside={waited(item.since)}
                    href={item.url}
                    identifier={`${item.repo}#${item.number}`}
                    title={item.title}
                  />
                ))}
              </AttentionCard>
              <AttentionCard
                more={
                  attention.data.failedRuns.total -
                  attention.data.failedRuns.items.length
                }
                title={t('dashboard.attention.failedRuns')}
                total={attention.data.failedRuns.total}
              >
                {attention.data.failedRuns.items.map((item) => (
                  <AttentionRow
                    key={item.id}
                    aside={item.agentName ?? t('dashboard.none')}
                    identifier={item.issue.identifier}
                    title={item.issue.title}
                    to={`/issues/${item.issue.id}`}
                  />
                ))}
              </AttentionCard>
            </div>
          </section>
        ) : null}

        {projects.data && projects.data.projects.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>{t('dashboard.projects.title')}</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('dashboard.projects.name')}</TableHead>
                    <TableHead className='w-48'>
                      {t('dashboard.projects.progress')}
                    </TableHead>
                    <TableHead className='text-right'>
                      {t('dashboard.projects.done')}
                    </TableHead>
                    <TableHead className='text-right'>
                      {t('dashboard.projects.completed')}
                    </TableHead>
                    <TableHead className='text-right'>
                      {t('dashboard.projects.cycleTime')}
                    </TableHead>
                    <TableHead className='text-right'>
                      {t('dashboard.projects.blocked')}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {projects.data.projects.map((project) => (
                    <TableRow key={project.id}>
                      <TableCell>
                        <Link
                          className='underline-offset-4 hover:underline'
                          to={`/projects/${project.id}`}
                        >
                          {project.name}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <div
                          role='progressbar'
                          aria-label={project.name}
                          aria-valuemin={0}
                          aria-valuemax={project.total}
                          aria-valuenow={project.done}
                          className='h-1.5 w-full overflow-hidden rounded-full bg-muted'
                        >
                          <div
                            className='h-full rounded-full bg-primary'
                            style={{
                              width: `${project.total > 0 ? (project.done / project.total) * 100 : 0}%`,
                            }}
                          />
                        </div>
                      </TableCell>
                      <TableCell className='text-right tabular-nums'>
                        {project.done}/{project.total}
                      </TableCell>
                      <TableCell className='text-right tabular-nums'>
                        {project.completed}
                      </TableCell>
                      <TableCell className='text-right tabular-nums'>
                        {formatDuration(t, project.cycleTimeP50Ms)}
                      </TableCell>
                      <TableCell className='text-right tabular-nums'>
                        {project.blocked}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </PageContainer>
  );
}
