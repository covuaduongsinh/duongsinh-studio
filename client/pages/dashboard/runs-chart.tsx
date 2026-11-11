import { useTranslation } from '@nocobase/i18n/client';
import { useState, type ReactElement } from 'react';

import { Button } from '#components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '#components/ui/tooltip';
import type { RunDay } from '#hooks/use-reports';

/** Stacked from the baseline up, in this order: the `--run-*` tokens are checked as a set, adjacent in this order. */
const SERIES = [
  {
    key: 'runsCompleted',
    label: 'completed',
    fill: 'bg-run-completed',
    area: 'fill-run-completed',
  },
  {
    key: 'runsFailed',
    label: 'failed',
    fill: 'bg-run-failed',
    area: 'fill-run-failed',
  },
  {
    key: 'runsOpen',
    label: 'open',
    fill: 'bg-run-open',
    area: 'fill-run-open',
  },
  {
    key: 'runsCancelled',
    label: 'cancelled',
    fill: 'bg-run-cancelled',
    area: 'fill-run-cancelled',
  },
] as const;

const WIDTH = 100;
const HEIGHT = 100;

/**
 * The outline of one series stacked on the ones under it, as an SVG path in a 100 × 100 box: along the top of the
 * series day by day, then back along the top of what lies under it. One day is a flat band across the box.
 */
function areaPath(
  daily: readonly RunDay[],
  index: number,
  top: number,
): string {
  const x = (at: number): number =>
    daily.length > 1 ? (at * WIDTH) / (daily.length - 1) : WIDTH / 2;
  const y = (value: number): number => HEIGHT - (value / top) * HEIGHT;
  const under = (day: RunDay): number =>
    SERIES.slice(0, index).reduce((sum, { key }) => sum + day[key], 0);
  const upper = daily.map(
    (day, at) => `${x(at)},${y(under(day) + day[SERIES[index].key])}`,
  );
  const lower = daily.map((day, at) => `${x(at)},${y(under(day))}`).reverse();
  return `M${[...upper, ...lower].join(' L')}Z`;
}

const totalOf = (day: RunDay): number =>
  SERIES.reduce((sum, { key }) => sum + day[key], 0);

/** The first of 1, 2, 5 × 10ⁿ at or above `value`, so the axis ends on a clean number. */
function ceiling(value: number): number {
  if (value <= 1) return 1;
  const unit = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 5, 10].find((candidate) => candidate * unit >= value);
  return (step ?? 10) * unit;
}

/** Runs queued each day by how they ended so far: stacked areas over the days, with a legend, a tooltip and a table. */
export function RunsChart({
  daily,
  dayText,
}: {
  readonly daily: readonly RunDay[];
  readonly dayText: (day: string) => string;
}): ReactElement {
  const { t } = useTranslation();
  const [asTable, setAsTable] = useState(false);
  const top = ceiling(Math.max(0, ...daily.map(totalOf)));
  const ticks = [top, top / 2, 0];
  // At most six dates along the axis, whatever the period.
  const every = Math.ceil(daily.length / 6);

  return (
    <section
      aria-label={t('dashboard.runs.title')}
      className='flex flex-col gap-3'
    >
      <div className='flex items-start justify-between gap-3'>
        <div>
          <h3 className='text-sm font-medium'>{t('dashboard.runs.title')}</h3>
          <p className='text-sm text-muted-foreground'>
            {t('dashboard.runs.description')}
          </p>
        </div>
        <Button
          aria-pressed={asTable}
          size='sm'
          variant='ghost'
          onClick={() => setAsTable((value) => !value)}
        >
          {t(asTable ? 'dashboard.runs.showChart' : 'dashboard.runs.showTable')}
        </Button>
      </div>

      {asTable ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('dashboard.runs.day')}</TableHead>
              {SERIES.map(({ label }) => (
                <TableHead key={label} className='text-right'>
                  {t(`dashboard.runs.${label}`)}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {daily.map((day) => (
              <TableRow key={day.day}>
                <TableCell>{dayText(day.day)}</TableCell>
                {SERIES.map(({ key }) => (
                  <TableCell key={key} className='text-right tabular-nums'>
                    {day[key]}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <>
          <div className='grid grid-cols-[auto_1fr] gap-x-2'>
            <div className='flex h-48 flex-col justify-between text-right text-xs tabular-nums text-muted-foreground'>
              {ticks.map((tick) => (
                <span key={tick} className='leading-none'>
                  {tick}
                </span>
              ))}
            </div>
            <div className='relative flex h-48 items-stretch border-b'>
              <div
                aria-hidden
                className='absolute inset-x-0 top-0 border-t border-border'
              />
              <div
                aria-hidden
                className='absolute inset-x-0 top-1/2 border-t border-border'
              />
              <svg
                aria-hidden
                className='absolute inset-0 h-full w-full'
                preserveAspectRatio='none'
                viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
              >
                {SERIES.map(({ area, key }, index) =>
                  daily.some((day) => day[key] > 0) ? (
                    <path
                      key={key}
                      className={`${area} opacity-90`}
                      d={areaPath(daily, index, top)}
                      data-testid={`run-area-${key}`}
                      data-values={daily.map((day) => day[key]).join(',')}
                    />
                  ) : null,
                )}
              </svg>
              {daily.map((day) => (
                <Tooltip key={day.day}>
                  <TooltipTrigger
                    render={
                      <div
                        className='relative h-full min-w-0 flex-1'
                        data-testid={`run-day-${day.day}`}
                      />
                    }
                  />
                  <TooltipContent>
                    <p className='font-medium'>{dayText(day.day)}</p>
                    {SERIES.map(({ key, label }) => (
                      <p key={key}>
                        {t(`dashboard.runs.${label}`)}: {day[key]}
                      </p>
                    ))}
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
            <div />
            <div className='mt-1 flex gap-0.5 text-xs text-muted-foreground'>
              {daily.map((day, index) => (
                <span
                  key={day.day}
                  className='min-w-0 flex-1 overflow-visible whitespace-nowrap'
                >
                  {index % every === 0 ? dayText(day.day) : ''}
                </span>
              ))}
            </div>
          </div>
          <ul
            aria-label={t('dashboard.runs.legend')}
            className='flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground'
          >
            {SERIES.map(({ fill, label }) => (
              <li key={label} className='flex items-center gap-1.5'>
                <span aria-hidden className={`size-2 rounded-sm ${fill}`} />
                {t(`dashboard.runs.${label}`)}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
