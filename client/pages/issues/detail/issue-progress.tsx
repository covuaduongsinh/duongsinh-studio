/**
 * What an issue waits for now, at the top of its page: Current / Next / Needs you, and the decision a person owes when
 * there is one (a failed run, a comment held back by the run limit, an owner handoff, sending the work back).
 */
import { useToaster } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import { ActivityIcon, CircleAlertIcon, ExternalLinkIcon } from 'lucide-react';
import {
  useState,
  type FormEvent,
  type ReactElement,
  type ReactNode,
} from 'react';

import { Alert, AlertDescription, AlertTitle } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#components/ui/dialog';
import { Field, FieldLabel } from '#components/ui/field';
import { Textarea } from '#components/ui/textarea';
import { IssueSection } from '#extensions/nocobase-issue-detail/issue-detail';
import {
  useContinueCommentRuns,
  useDecideFailedRun,
  useDecideHandoff,
  useHandToManager,
  useIssuePanels,
  useSendBack,
} from '#hooks/use-issue-work';

export function IssueProgressPanel({
  issueId,
  revision,
  canEdit,
  onChanged,
  needsYouActions,
}: {
  readonly issueId: string;
  readonly revision: number;
  readonly canEdit: boolean;
  readonly onChanged: () => void;
  /** What the person can do about the pull request, drawn under the "Needs you" line when the issue waits for them. */
  readonly needsYouActions?: ReactNode;
}): ReactElement | null {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const toaster = useToaster();
  const panels = useIssuePanels(issueId);
  const failure = (): void => {
    toaster.show({ type: 'error', title: t('issueWork.failed') });
  };
  const decideRun = useDecideFailedRun(issueId, onChanged);
  const continueRuns = useContinueCommentRuns(issueId, onChanged);
  const decideHandoff = useDecideHandoff(issueId, onChanged);
  const handToManager = useHandToManager(issueId, onChanged);
  const sendBack = useSendBack(issueId, onChanged);
  const [sendingBack, setSendingBack] = useState(false);
  const [reason, setReason] = useState('');

  if (!panels.data) return null;
  const { progress, commentRunLimit, ownerHandoff } = panels.data;
  const failedRunId = progress.failedRunId;
  const handoff = ownerHandoff.handoff;

  const current = progress.agent
    ? t(`issueWork.state.${progress.state}`, { agent: progress.agent.name })
    : t(`issueWork.state.${progress.state}`, { agent: '' });

  const submitSendBack = (event: FormEvent): void => {
    event.preventDefault();
    sendBack.mutate(
      { revision, content: reason.trim() },
      {
        onSuccess: () => {
          setSendingBack(false);
          setReason('');
        },
        onError: failure,
      },
    );
  };

  return (
    <IssueSection
      icon={<ActivityIcon />}
      title={t('issueWork.title')}
      data-testid='issue-progress'
    >
      <dl className='grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[auto_1fr]'>
        <dt className='text-muted-foreground'>{t('issueWork.current')}</dt>
        <dd>
          {current}
          {progress.step ? (
            <span className='text-muted-foreground'> · {progress.step}</span>
          ) : null}
          {progress.since ? (
            <span className='text-muted-foreground'>
              {' · '}
              {new Date(progress.since).toLocaleString(locale)}
            </span>
          ) : null}
          {progress.runner ? (
            <span className='text-muted-foreground'> · {progress.runner}</span>
          ) : null}
        </dd>
        {progress.next ? (
          <>
            <dt className='text-muted-foreground'>{t('issueWork.next')}</dt>
            <dd>{progress.next}</dd>
          </>
        ) : null}
        {progress.needsYou ? (
          <>
            <dt className='font-medium'>{t('issueWork.needsYou')}</dt>
            <dd className='font-medium'>{progress.needsYou}</dd>
          </>
        ) : null}
        {progress.pullRequest ? (
          <>
            <dt className='text-muted-foreground'>
              {t('issueWork.pullRequest')}
            </dt>
            <dd>
              {progress.pullRequest.url ? (
                <a
                  className='inline-flex items-center gap-1 underline underline-offset-4'
                  href={progress.pullRequest.url}
                  target='_blank'
                  rel='noreferrer'
                >
                  #{progress.pullRequest.number}
                  <ExternalLinkIcon className='size-3' aria-hidden='true' />
                </a>
              ) : (
                `#${progress.pullRequest.number}`
              )}
            </dd>
          </>
        ) : null}
      </dl>

      {progress.needsYou ? needsYouActions : null}

      {failedRunId && canEdit ? (
        <Alert variant='destructive' data-testid='failed-run-card'>
          <CircleAlertIcon />
          <AlertTitle>{t('issueWork.failedRun.title')}</AlertTitle>
          <AlertDescription>
            <p>{t('issueWork.failedRun.description')}</p>
            <div className='mt-2 flex flex-wrap gap-2'>
              {(['retry', 'reassign', 'cancel'] as const).map((action) => (
                <Button
                  key={action}
                  size='sm'
                  variant={action === 'retry' ? 'default' : 'outline'}
                  disabled={decideRun.isPending}
                  onClick={() =>
                    decideRun.mutate(
                      { runId: failedRunId, action },
                      { onError: failure },
                    )
                  }
                >
                  {t(`issueWork.failedRun.${action}`)}
                </Button>
              ))}
            </div>
          </AlertDescription>
        </Alert>
      ) : null}

      {commentRunLimit && canEdit ? (
        <Alert data-testid='comment-run-limit'>
          <CircleAlertIcon />
          <AlertTitle>{t('issueWork.limit.title')}</AlertTitle>
          <AlertDescription>
            <p>
              {t('issueWork.limit.description', {
                maxRuns: commentRunLimit.maxRuns,
                windowHours: commentRunLimit.windowHours,
              })}
            </p>
            <Button
              className='mt-2'
              size='sm'
              disabled={continueRuns.isPending}
              onClick={() =>
                continueRuns.mutate(
                  { token: commentRunLimit.token },
                  { onError: failure },
                )
              }
            >
              {t('issueWork.limit.continue')}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {handoff?.waiting && ownerHandoff.canDecide ? (
        <Alert data-testid='owner-handoff'>
          <CircleAlertIcon />
          <AlertTitle>{t('issueWork.handoff.title')}</AlertTitle>
          <AlertDescription>
            <p>{t('issueWork.handoff.description')}</p>
            <div className='mt-2 flex flex-wrap gap-2'>
              {(['accept', 'reject'] as const).map((decision) => (
                <Button
                  key={decision}
                  size='sm'
                  variant={decision === 'accept' ? 'default' : 'outline'}
                  disabled={decideHandoff.isPending}
                  onClick={() =>
                    decideHandoff.mutate(
                      { decision, notificationKey: handoff.notificationKey },
                      { onError: failure },
                    )
                  }
                >
                  {t(`issueWork.handoff.${decision}`)}
                </Button>
              ))}
            </div>
          </AlertDescription>
        </Alert>
      ) : null}

      {canEdit && (progress.handOver || progress.state === 'inReview') ? (
        <div className='flex flex-wrap gap-2'>
          {progress.state === 'inReview' ? (
            <Button
              size='sm'
              variant='outline'
              onClick={() => setSendingBack(true)}
            >
              {t('issueWork.sendBack.action')}
            </Button>
          ) : null}
          {progress.handOver ? (
            <Button
              size='sm'
              variant='outline'
              disabled={handToManager.isPending}
              onClick={() =>
                handToManager.mutate(undefined, { onError: failure })
              }
            >
              {t('issueWork.handToManager')}
            </Button>
          ) : null}
        </div>
      ) : null}

      <Dialog open={sendingBack} onOpenChange={setSendingBack}>
        <DialogContent>
          <form onSubmit={submitSendBack} className='flex flex-col gap-4'>
            <DialogHeader>
              <DialogTitle>{t('issueWork.sendBack.title')}</DialogTitle>
              <DialogDescription>
                {t('issueWork.sendBack.description')}
              </DialogDescription>
            </DialogHeader>
            <Field>
              <FieldLabel htmlFor='send-back-reason'>
                {t('issueWork.sendBack.reason')}
              </FieldLabel>
              <Textarea
                id='send-back-reason'
                required
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </Field>
            <DialogFooter>
              <Button
                type='button'
                variant='outline'
                onClick={() => setSendingBack(false)}
              >
                {t('common.cancel')}
              </Button>
              <Button
                type='submit'
                disabled={sendBack.isPending || !reason.trim()}
              >
                {t('issueWork.sendBack.action')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </IssueSection>
  );
}
