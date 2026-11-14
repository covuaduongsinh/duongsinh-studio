/**
 * The issue's agent runs, newest first: how long each took, its transcript and the full prompt it was given, and Stop
 * for a run still going and Retry for one that failed or was cancelled. The agents plugin checks who may do each (whoever
 * started or owns the run, or a manager of agents); a refusal comes back as the error shown under the run.
 */
import {
  useRetryRun,
  useRunBrief,
  useStopRun,
} from '@nocobase/app-plugin-agents/client/runs';
import { useRealtimeTopic } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import { HistoryIcon } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '#components/ui/alert-dialog';
import { Badge } from '#components/ui/badge';
import { RunEventActions } from '#components/run-event-actions';
import { Button } from '#components/ui/button';
import { IssueSection } from '#extensions/nocobase-issue-detail/issue-detail';
import { useRealtimeAvailable } from '#hooks/use-realtime';
import { durationText, type Translate } from './duration.js';
import {
  useIssueRuns,
  useRefreshIssueRuns,
  useRunEvents,
  type IssueRun,
} from '#hooks/use-issue-work';

/** A run that a runner may still be working on. */
const ACTIVE = new Set(['queued', 'dispatched', 'running']);
/** A wait shorter than this is the normal pick-up time and not worth a word. */
const WAIT_SHOWN_MS = 30_000;
/** A run that ended without finishing the work, which Retry queues again. */
const RETRYABLE = new Set(['failed', 'cancelled']);

/** How long the run took or has gone; a queued run shows how long it has waited. Null when there is nothing to say. */
function runDuration(t: Translate, run: IssueRun): string | null {
  const now = Date.now();
  if (run.startedAt) {
    const end = run.finishedAt ? Date.parse(run.finishedAt) : now;
    return durationText(t, end - Date.parse(run.startedAt));
  }
  if (run.status === 'queued')
    return t('issueWork.runs.waited', {
      duration: durationText(t, now - Date.parse(run.createdAt)),
    });
  return null;
}

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
          <RunEventActions runId={runId} seq={event.seq} />
        </li>
      ))}
    </ol>
  );
}

/** What the agent was told: the whole prompt of the run's latest attempt. Read only once this is opened. */
function RunPrompt({ runId }: { readonly runId: string }): ReactElement {
  const { t } = useTranslation();
  const brief = useRunBrief(runId, true);
  if (brief.isLoading)
    return (
      <p className='text-sm text-muted-foreground'>
        {t('issueWork.runs.promptLoading')}
      </p>
    );
  if (brief.isError || !brief.data)
    return (
      <p className='text-sm text-muted-foreground'>
        {t('issueWork.runs.promptMissing')}
      </p>
    );
  return (
    <pre
      className='max-h-96 overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap'
      data-testid='run-prompt'
    >
      {brief.data.prompt}
    </pre>
  );
}

function errorText(t: Translate, error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : t('issueWork.runs.actionFailed');
}

/**
 * Listens to one run that a runner may still be working on (`agents:runs:<runId>`, the agents plugin's topic) and reads
 * the issue's panels and runs again when it changes, so Running becomes Completed without waiting for the next poll.
 */
function RunLive({
  runId,
  onChange,
}: {
  readonly runId: string;
  readonly onChange: () => void;
}): null {
  useRealtimeTopic(`agents:runs:${runId}`, () => onChange());
  return null;
}

export function RunRow({
  run,
  issueId,
}: {
  readonly run: IssueRun;
  readonly issueId: string;
}): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const refresh = useRefreshIssueRuns(issueId);
  const stop = useStopRun();
  const retry = useRetryRun();
  const [view, setView] = useState<'transcript' | 'prompt' | null>(null);
  const [confirming, setConfirming] = useState(false);
  const duration = runDuration(t, run);
  // How long it waited for a runner before it started: where an issue was slow shows here, not only while it is queued.
  const waitMs = run.startedAt
    ? Date.parse(run.startedAt) - Date.parse(run.createdAt)
    : 0;
  const waitedBefore =
    waitMs >= WAIT_SHOWN_MS
      ? t('issueWork.runs.waitedBefore', { duration: durationText(t, waitMs) })
      : null;
  const failed = stop.isError ? stop.error : retry.isError ? retry.error : null;
  const toggle = (next: 'transcript' | 'prompt'): void =>
    setView(view === next ? null : next);

  const realtime = useRealtimeAvailable();
  return (
    <li className='flex flex-col gap-2 text-sm'>
      {realtime && ACTIVE.has(run.status) ? (
        <RunLive runId={run.id} onChange={refresh} />
      ) : null}
      <div className='flex flex-wrap items-center gap-2'>
        <Badge variant={run.status === 'failed' ? 'destructive' : 'secondary'}>
          {t(`issueWork.runs.status.${run.status}`)}
        </Badge>
        <span className='font-medium'>{run.agent}</span>
        <span className='text-muted-foreground'>
          {new Date(run.createdAt).toLocaleString(locale)}
        </span>
        {duration ? (
          <span className='text-muted-foreground'>{duration}</span>
        ) : null}
        {waitedBefore ? (
          <span className='text-muted-foreground'>{waitedBefore}</span>
        ) : null}
        <div className='ml-auto flex flex-wrap gap-1'>
          {ACTIVE.has(run.status) ? (
            <Button
              size='sm'
              variant='outline'
              disabled={stop.isPending}
              onClick={() => setConfirming(true)}
            >
              {t('issueWork.runs.stop')}
            </Button>
          ) : null}
          {RETRYABLE.has(run.status) ? (
            <Button
              size='sm'
              variant='outline'
              disabled={retry.isPending}
              onClick={() => retry.mutate(run.id, { onSettled: refresh })}
            >
              {t('issueWork.runs.retry')}
            </Button>
          ) : null}
          <Button
            size='sm'
            variant='ghost'
            aria-expanded={view === 'prompt'}
            onClick={() => toggle('prompt')}
          >
            {t(
              view === 'prompt'
                ? 'issueWork.runs.hidePrompt'
                : 'issueWork.runs.showPrompt',
            )}
          </Button>
          <Button
            size='sm'
            variant='ghost'
            aria-expanded={view === 'transcript'}
            onClick={() => toggle('transcript')}
          >
            {t(
              view === 'transcript'
                ? 'issueWork.runs.hide'
                : 'issueWork.runs.show',
            )}
          </Button>
        </div>
      </div>
      {run.summary || run.failure ? (
        <p className='text-muted-foreground'>{run.failure || run.summary}</p>
      ) : null}
      {failed ? (
        <p role='alert' className='text-destructive'>
          {errorText(t, failed)}
        </p>
      ) : null}
      {view === 'transcript' ? <RunTranscript runId={run.id} /> : null}
      {view === 'prompt' ? <RunPrompt runId={run.id} /> : null}
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('issueWork.runs.stopTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('issueWork.runs.stopBody')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('issueWork.runs.keep')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => stop.mutate(run.id, { onSettled: refresh })}
            >
              {t('issueWork.runs.stopConfirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}

export function IssueRuns({
  issueId,
}: {
  readonly issueId: string;
}): ReactElement | null {
  const { t } = useTranslation();
  const runs = useIssueRuns(issueId);
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
          <RunRow key={run.id} run={run} issueId={issueId} />
        ))}
      </ul>
    </IssueSection>
  );
}
