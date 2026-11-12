/** "Nhịp giao việc": how fast work reaches a pull request, and the readings taken by hand (plan V, "Đo trước"). */
import { useTranslation } from '@nocobase/i18n/client';
import { useState, type ReactElement } from 'react';

import { Button } from '#components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#components/ui/card';
import { Input } from '#components/ui/input';
import { Skeleton } from '#components/ui/skeleton';
import {
  SNAPSHOT_METRICS,
  useFlowReport,
  useRecordSnapshot,
  type MetricSnapshot,
  type SnapshotMetric,
} from '#hooks/use-flow-report';
import type { ReportDays } from '#hooks/use-reports';

function Figure({
  label,
  value,
  note,
}: {
  readonly label: string;
  readonly value: string;
  readonly note: string;
}): ReactElement {
  return (
    <div
      className='flex flex-col gap-1 rounded-lg border p-4'
      role='group'
      aria-label={label}
    >
      <span className='text-sm text-muted-foreground'>{label}</span>
      <span className='text-xl font-semibold'>{value}</span>
      <span className='text-xs text-muted-foreground'>{note}</span>
    </div>
  );
}

function ReadingRow({
  metric,
  latest,
}: {
  readonly metric: SnapshotMetric;
  readonly latest: MetricSnapshot | undefined;
}): ReactElement {
  const { i18n, t } = useTranslation();
  const record = useRecordSnapshot();
  const [value, setValue] = useState('');
  const label = t(`dashboard.flow.metrics.${metric}`);
  const number = new Intl.NumberFormat(i18n.language);
  const shown =
    latest === undefined
      ? t('dashboard.none')
      : t(`dashboard.flow.units.${metric}`, {
          value: number.format(latest.value),
        });
  const parsed = Number(value);
  const valid = value.trim() !== '' && Number.isInteger(parsed) && parsed >= 0;
  return (
    <li className='flex flex-col gap-2 border-t pt-3 first:border-t-0 first:pt-0 sm:flex-row sm:items-center sm:justify-between'>
      <div className='flex flex-col'>
        <span className='text-sm font-medium'>{label}</span>
        <span className='text-xs text-muted-foreground'>
          {t('dashboard.flow.latest', {
            value: shown,
            date: latest
              ? new Intl.DateTimeFormat(i18n.language, {
                  dateStyle: 'short',
                }).format(new Date(latest.takenAt))
              : t('dashboard.none'),
          })}
        </span>
      </div>
      <form
        className='flex gap-2'
        onSubmit={(event) => {
          event.preventDefault();
          if (!valid) return;
          record.mutate(
            { metric, value: parsed },
            { onSuccess: () => setValue('') },
          );
        }}
      >
        <Input
          aria-label={t('dashboard.flow.valueLabel', { metric: label })}
          className='w-32'
          inputMode='numeric'
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
        <Button
          disabled={!valid || record.isPending}
          type='submit'
          variant='outline'
        >
          {t('dashboard.flow.record')}
        </Button>
      </form>
      {record.isError ? (
        <span className='text-xs text-destructive' role='alert'>
          {t('dashboard.flow.recordFailed')}
        </span>
      ) : null}
    </li>
  );
}

export function FlowSection({
  days,
  duration,
}: {
  readonly days: ReportDays;
  readonly duration: (ms: number | null) => string;
}): ReactElement | null {
  const { t } = useTranslation();
  const flow = useFlowReport(days);
  if (flow.isLoading)
    return (
      <Skeleton aria-label={t('dashboard.loading')} className='h-40 w-full' />
    );
  const data = flow.data;
  if (!data) return null;
  const count = (value: number | null): string =>
    value === null ? t('dashboard.none') : String(value);
  const note = t('dashboard.flow.sample', { count: data.sample });
  return (
    <Card aria-label={t('dashboard.flow.title')} role='region'>
      <CardHeader>
        <CardTitle>{t('dashboard.flow.title')}</CardTitle>
        <CardDescription>{t('dashboard.flow.description')}</CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-6'>
        <div className='grid gap-4 sm:grid-cols-2'>
          <Figure
            label={t('dashboard.flow.firstPullRequest')}
            note={note}
            value={t('dashboard.flow.medianAndTail', {
              median: duration(data.firstPullRequestP50Ms),
              tail: duration(data.firstPullRequestP90Ms),
            })}
          />
          <Figure
            label={t('dashboard.flow.runsToPullRequest')}
            note={note}
            value={t('dashboard.flow.medianAndTail', {
              median: count(data.runsToPullRequestP50),
              tail: count(data.runsToPullRequestP90),
            })}
          />
        </div>
        <section className='flex flex-col gap-3'>
          <h3 className='text-sm font-medium'>
            {t('dashboard.flow.readings')}
          </h3>
          <p className='text-xs text-muted-foreground'>
            {t('dashboard.flow.readingsHint')}
          </p>
          <ul className='flex flex-col gap-3'>
            {SNAPSHOT_METRICS.map((metric) => (
              <ReadingRow
                key={metric}
                latest={data.snapshots.find((item) => item.metric === metric)}
                metric={metric}
              />
            ))}
          </ul>
        </section>
      </CardContent>
    </Card>
  );
}
