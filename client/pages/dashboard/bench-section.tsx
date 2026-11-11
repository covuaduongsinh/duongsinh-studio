/** Dashboard harness benchmark section (`client/pages/dashboard/bench-section.tsx`). */
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import {
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Play,
  RotateCcw,
  XCircle,
} from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { Badge } from '#components/ui/badge';
import { Button } from '#components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#components/ui/dialog';
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
  useBenchRun,
  useBenchRuns,
  useBenchStatus,
  useStartBenchRun,
} from '#hooks/use-bench';

const TASK_KEYS = [
  'route_permission',
  'migration_down',
  'i18n_bilingual',
  'csv_dry_run',
  'fix_ci_red',
  'reject_secrets',
  'propose_criteria',
  'unachievable_criteria',
  'runner_no_all_check',
  'reject_forbidden_file',
] as const;

export function BenchSection(): ReactElement | null {
  const { t } = useTranslation();
  const { can: unrestricted } = useCan('unrestricted');
  const [forceDialogOpen, setForceDialogOpen] = useState(false);

  const statusQuery = useBenchStatus(Boolean(unrestricted));
  const runsQuery = useBenchRuns(2, Boolean(unrestricted));
  const startRun = useStartBenchRun();

  const status = statusQuery.data;
  const recentRuns = runsQuery.data ?? [];
  const latestRunSummary = recentRuns[0] ?? null;
  const previousRunSummary = recentRuns[1] ?? null;

  // Fetch full details of the latest run to get individual task results
  const latestRunDetailQuery = useBenchRun(
    latestRunSummary?.id ?? null,
    Boolean(unrestricted && latestRunSummary?.id),
  );
  const latestRun = latestRunDetailQuery.data ?? latestRunSummary;

  if (!unrestricted) return null;

  if (statusQuery.isLoading || runsQuery.isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className='h-6 w-48' />
          <Skeleton className='h-4 w-96' />
        </CardHeader>
        <CardContent>
          <div className='grid gap-4 sm:grid-cols-4'>
            <Skeleton className='h-20 w-full' />
            <Skeleton className='h-20 w-full' />
            <Skeleton className='h-20 w-full' />
            <Skeleton className='h-20 w-full' />
          </div>
        </CardContent>
      </Card>
    );
  }

  const handleStartRun = (force = false) => {
    if (!force && status && status.remainingRuns <= 0) {
      setForceDialogOpen(true);
      return;
    }
    startRun.mutate({ set: 'ds-core', force });
    setForceDialogOpen(false);
  };

  const passRatePoints = latestRun ? Math.round(latestRun.passRate * 100) : 0;
  const prevPassRatePoints = previousRunSummary
    ? Math.round(previousRunSummary.passRate * 100)
    : null;
  const deltaPoints =
    prevPassRatePoints !== null ? passRatePoints - prevPassRatePoints : null;

  const resultsMap = new Map(
    (latestRun?.results ?? []).map((res) => [res.taskKey, res]),
  );

  return (
    <>
      <Card>
        <CardHeader className='flex flex-row items-start justify-between space-y-0 pb-4'>
          <div className='grid gap-1'>
            <CardTitle>{t('bench.title')}</CardTitle>
            <CardDescription>{t('bench.description')}</CardDescription>
          </div>
          <div className='flex items-center gap-2'>
            <Button
              size='sm'
              disabled={startRun.isPending}
              onClick={() => handleStartRun(false)}
            >
              <Play className='mr-1.5 h-3.5 w-3.5' />
              {startRun.isPending ? t('bench.running') : t('bench.runAction')}
            </Button>
          </div>
        </CardHeader>
        <CardContent className='grid gap-6'>
          {/* Key Metric Cards */}
          <div className='grid gap-4 sm:grid-cols-2 md:grid-cols-4'>
            {/* Pass Rate */}
            <div className='rounded-lg border bg-card p-4 text-card-foreground shadow-sm'>
              <div className='text-sm font-medium text-muted-foreground'>
                {t('bench.passRate')}
              </div>
              <div className='mt-1 flex items-baseline justify-between'>
                <div className='text-2xl font-bold'>
                  {latestRun ? `${passRatePoints}%` : '—'}
                </div>
                {deltaPoints !== null && deltaPoints !== 0 && (
                  <span
                    className={`inline-flex items-center text-xs font-semibold ${
                      deltaPoints > 0 ? 'text-primary' : 'text-destructive'
                    }`}
                  >
                    {deltaPoints > 0 ? (
                      <ArrowUpRight className='mr-0.5 h-3.5 w-3.5' />
                    ) : (
                      <ArrowDownRight className='mr-0.5 h-3.5 w-3.5' />
                    )}
                    {deltaPoints > 0 ? `+${deltaPoints}` : deltaPoints} pts
                  </span>
                )}
              </div>
              <div className='mt-1 text-xs text-muted-foreground'>
                {latestRun
                  ? `${latestRun.passedTasks}/${latestRun.totalTasks} ${t('bench.tasksLabel')}`
                  : t('bench.noRunsYet')}
              </div>
            </div>

            {/* Monthly Full Run Limit */}
            <div className='rounded-lg border bg-card p-4 text-card-foreground shadow-sm'>
              <div className='text-sm font-medium text-muted-foreground'>
                {t('bench.monthlyRuns')}
              </div>
              <div className='mt-1 text-2xl font-bold'>
                {status?.monthlyFullRuns ?? 0} / {status?.monthlyLimit ?? 4}
              </div>
              <div className='mt-1 text-xs text-muted-foreground'>
                {t('bench.monthlyLimit', {
                  used: status?.monthlyFullRuns ?? 0,
                  max: status?.monthlyLimit ?? 4,
                })}
              </div>
            </div>

            {/* Studio Commit */}
            <div className='rounded-lg border bg-card p-4 text-card-foreground shadow-sm'>
              <div className='text-sm font-medium text-muted-foreground'>
                {t('bench.studioCommit')}
              </div>
              <div className='mt-1 font-mono text-xl font-bold'>
                {latestRun?.studioCommit
                  ? latestRun.studioCommit.slice(0, 7)
                  : '—'}
              </div>
              <div className='mt-1 text-xs text-muted-foreground'>
                {latestRun?.model || '—'}
              </div>
            </div>

            {/* Total Tokens / Runs */}
            <div className='rounded-lg border bg-card p-4 text-card-foreground shadow-sm'>
              <div className='text-sm font-medium text-muted-foreground'>
                {t('bench.tokens')}
              </div>
              <div className='mt-1 text-2xl font-bold'>
                {latestRun?.results
                  ? latestRun.results
                      .reduce((acc, r) => acc + (r.totalTokens || 0), 0)
                      .toLocaleString()
                  : '—'}
              </div>
              <div className='mt-1 text-xs text-muted-foreground'>
                {latestRun?.results
                  ? `${latestRun.results.reduce((acc, r) => acc + (r.runs || 0), 0)} ${t('bench.runsCount')}`
                  : '—'}
              </div>
            </div>
          </div>

          {/* 10 Standard Tasks Table */}
          <div className='space-y-2'>
            <div className='text-sm font-semibold'>{t('bench.taskTitle')}</div>
            <div className='rounded-md border'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('dashboard.projects.name')}</TableHead>
                    <TableHead className='w-32'>{t('budgets.state')}</TableHead>
                    <TableHead className='text-right'>
                      {t('bench.runsCount')}
                    </TableHead>
                    <TableHead className='text-right'>
                      {t('bench.tokens')}
                    </TableHead>
                    <TableHead className='text-right'>
                      {t('dashboard.cycleTime')}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {TASK_KEYS.map((key) => {
                    const res = resultsMap.get(key);
                    const isPass = res?.result === 'pass';
                    const isFail = res?.result === 'fail';
                    const isPending = !res || res.result === 'pending';

                    return (
                      <TableRow key={key}>
                        <TableCell>
                          <div className='font-medium'>
                            {t(`bench.tasks.${key}`)}
                          </div>
                          {res?.reason && isFail && (
                            <div className='text-xs text-destructive'>
                              {res.reason}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          {isPass && (
                            <Badge
                              variant='default'
                              className='flex w-fit items-center gap-1 bg-emerald-600 hover:bg-emerald-700'
                            >
                              <CheckCircle2 className='h-3 w-3' />
                              {t('bench.status.pass')}
                            </Badge>
                          )}
                          {isFail && (
                            <Badge
                              variant='destructive'
                              className='flex w-fit items-center gap-1'
                            >
                              <XCircle className='h-3 w-3' />
                              {t('bench.status.fail')}
                            </Badge>
                          )}
                          {isPending && (
                            <Badge
                              variant='secondary'
                              className='flex w-fit items-center gap-1 text-muted-foreground'
                            >
                              <Clock className='h-3 w-3' />
                              {t('bench.status.pending')}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className='text-right tabular-nums'>
                          {res ? res.runs : '—'}
                        </TableCell>
                        <TableCell className='text-right tabular-nums'>
                          {res ? res.totalTokens.toLocaleString() : '—'}
                        </TableCell>
                        <TableCell className='text-right tabular-nums'>
                          {res && res.durationMs > 0
                            ? `${Math.round(res.durationMs / 1000)}s`
                            : '—'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Force Run Dialog when monthly quota is reached */}
      <Dialog open={forceDialogOpen} onOpenChange={setForceDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('bench.forceRunConfirm')}</DialogTitle>
            <DialogDescription>
              {t('bench.forceRunPrompt', {
                used: status?.monthlyFullRuns ?? 4,
                max: status?.monthlyLimit ?? 4,
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant='outline' onClick={() => setForceDialogOpen(false)}>
              {t('bench.cancel')}
            </Button>
            <Button variant='destructive' onClick={() => handleStartRun(true)}>
              <RotateCcw className='mr-1.5 h-3.5 w-3.5' />
              {t('bench.forceRunConfirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
