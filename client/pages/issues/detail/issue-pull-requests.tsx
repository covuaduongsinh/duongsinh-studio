/**
 * The issue's pull requests on its page: each with its state, branch, checks and mergeability, and the actions the
 * application's git API offers (`server/routes/git.ts`): read it from GitHub again, squash-merge it, or merge it anyway
 * past its checks with a reason. The server decides who may merge; the page only hides what it would refuse.
 */
import { useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import {
  CircleAlertIcon,
  ExternalLinkIcon,
  GitMergeIcon,
  GitPullRequestIcon,
  LoaderCircle,
  RefreshCwIcon,
} from 'lucide-react';
import { useState, type FormEvent, type ReactElement } from 'react';

import { Badge } from '#components/ui/badge';
import { Button } from '#components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#components/ui/dialog';
import { Field, FieldError, FieldLabel } from '#components/ui/field';
import { Textarea } from '#components/ui/textarea';
import {
  ISSUE_SECTION_LIST,
  IssueSection,
} from '#extensions/nocobase-issue-detail/issue-detail';
import {
  FORCEABLE_BLOCKERS,
  isForbidden,
  mergeBlockerOf,
  useIssuePullRequests,
  useMergePullRequest,
  useRefreshPullRequest,
  type GitCheck,
  type GitPullRequest,
  type MergeBlocker,
} from '#hooks/use-git';
import { useGitErrorText } from '#hooks/use-git-error-text';
import {
  useIssueAutopilot,
  type AutopilotEvaluation,
} from '#hooks/use-autopilot';

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline';

const OUTCOME_VARIANT: Readonly<Record<GitCheck['outcome'], BadgeVariant>> = {
  success: 'secondary',
  failure: 'destructive',
  pending: 'outline',
};

function stateKey(
  pull: GitPullRequest,
): 'open' | 'draft' | 'closed' | 'merged' {
  if (pull.state === 'open' && pull.draft) return 'draft';
  return pull.state;
}

function ForceMergeDialog({
  open,
  pending,
  onOpenChange,
  onConfirm,
}: {
  readonly open: boolean;
  readonly pending: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onConfirm: (reason: string) => void;
}): ReactElement {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const [missing, setMissing] = useState(false);
  const submit = (event: FormEvent): void => {
    event.preventDefault();
    const text = reason.trim();
    if (!text) {
      setMissing(true);
      return;
    }
    onConfirm(text);
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        if (!next) {
          setReason('');
          setMissing(false);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <form onSubmit={submit} className='flex flex-col gap-4' noValidate>
          <DialogHeader>
            <DialogTitle>{t('git.force.title')}</DialogTitle>
            <DialogDescription>{t('git.force.description')}</DialogDescription>
          </DialogHeader>
          <Field data-invalid={missing || undefined}>
            <FieldLabel htmlFor='git-force-reason'>
              {t('git.force.reason')}
            </FieldLabel>
            <Textarea
              id='git-force-reason'
              value={reason}
              required
              maxLength={500}
              aria-invalid={missing || undefined}
              aria-describedby={missing ? 'git-force-reason-error' : undefined}
              disabled={pending}
              onChange={(event) => {
                setReason(event.target.value);
                if (event.target.value.trim()) setMissing(false);
              }}
            />
            {missing ? (
              <FieldError id='git-force-reason-error'>
                {t('git.force.reasonRequired')}
              </FieldError>
            ) : null}
          </Field>
          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              disabled={pending}
              onClick={() => onOpenChange(false)}
            >
              {t('git.force.cancel')}
            </Button>
            <Button type='submit' variant='destructive' disabled={pending}>
              {pending ? (
                <LoaderCircle
                  data-icon='inline-start'
                  className='animate-spin'
                />
              ) : null}
              {t('git.force.confirm')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PullRequestItem({
  pull,
  issueId,
  canMerge,
  onMerged,
  autopilotEval,
}: {
  readonly pull: GitPullRequest;
  readonly issueId: string;
  readonly canMerge: boolean;
  readonly onMerged: () => void;
  readonly autopilotEval?: AutopilotEvaluation;
}): ReactElement {
  const { t } = useTranslation();
  const toaster = useToaster();
  const errorText = useGitErrorText();
  const merge = useMergePullRequest(issueId);
  const refresh = useRefreshPullRequest(issueId);
  // What the server said when merging was last tried; the stored snapshot otherwise.
  const [refused, setRefused] = useState<MergeBlocker | null>(null);
  const [denied, setDenied] = useState(false);
  const [forcing, setForcing] = useState(false);
  const open = pull.state === 'open';
  const blocker = open ? (refused ?? pull.mergeBlocker) : null;
  const mayMerge = canMerge && open && !denied;
  const state = stateKey(pull);

  const send = (force: boolean, reason?: string): void => {
    merge.mutate(
      { pullRequestId: pull.id, force, ...(reason ? { reason } : {}) },
      {
        onSuccess: () => {
          setRefused(null);
          setForcing(false);
          toaster.show({
            type: 'success',
            title: t('git.pullRequests.merged', { number: pull.number }),
          });
          onMerged();
        },
        onError: (error) => {
          const answered = mergeBlockerOf(error);
          if (answered) {
            setRefused(answered);
            setForcing(false);
            return;
          }
          if (isForbidden(error)) {
            setDenied(true);
            setForcing(false);
            return;
          }
          toaster.show({ type: 'error', title: errorText(error) });
        },
      },
    );
  };

  return (
    <li className='flex flex-col gap-3 px-3 py-3' data-testid='pull-request'>
      <div className='flex flex-wrap items-start justify-between gap-2'>
        <div className='flex min-w-0 flex-col gap-1'>
          <a
            href={pull.url}
            target='_blank'
            rel='noreferrer'
            className='inline-flex min-w-0 items-center gap-1.5 text-sm font-medium hover:underline'
            aria-label={t('git.pullRequests.open', { number: pull.number })}
          >
            <span className='shrink-0 font-mono text-muted-foreground'>
              #{pull.number}
            </span>
            <span className='truncate'>{pull.title}</span>
            <ExternalLinkIcon
              aria-hidden='true'
              className='size-3.5 shrink-0 text-muted-foreground'
            />
          </a>
          <p className='flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground'>
            <span>{pull.repo}</span>
            <span className='font-mono'>
              {t('git.pullRequests.branch', {
                head: pull.headRef,
                base: pull.baseRef,
              })}
            </span>
          </p>
        </div>
        <div className='flex flex-wrap items-center gap-1.5'>
          <Badge variant={state === 'merged' ? 'default' : 'secondary'}>
            {t(`git.states.${state}`)}
          </Badge>
          <Badge
            variant={pull.ciState ? OUTCOME_VARIANT[pull.ciState] : 'outline'}
          >
            {pull.ciState ? t(`git.ci.${pull.ciState}`) : t('git.ci.none')}
          </Badge>
          {open ? (
            <Badge
              variant={
                pull.mergeability === 'conflicts' ? 'destructive' : 'outline'
              }
            >
              {t(`git.mergeability.${pull.mergeability}`)}
            </Badge>
          ) : null}
          {open && autopilotEval ? (
            <Badge
              variant='outline'
              className={
                autopilotEval.eligible
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                  : 'text-muted-foreground'
              }
              title={
                autopilotEval.eligible
                  ? t('autopilot.pr.eligibleHint')
                  : autopilotEval.reasons.join(', ')
              }
            >
              {autopilotEval.eligible
                ? t('autopilot.pr.eligible')
                : t('autopilot.pr.notEligible')}
            </Badge>
          ) : null}
        </div>
      </div>
      <div className='flex flex-col gap-1.5'>
        <p className='text-xs font-medium text-muted-foreground'>
          {t('git.pullRequests.checks')}
        </p>
        {pull.checks.length === 0 ? (
          <p className='text-sm text-muted-foreground'>
            {t('git.pullRequests.noChecks')}
          </p>
        ) : (
          <ul
            className='flex flex-col gap-1'
            aria-label={t('git.pullRequests.checks')}
          >
            {pull.checks.map((check) => (
              <li
                key={`${check.kind}:${check.name}`}
                className='flex items-center justify-between gap-2 text-sm'
              >
                {check.url ? (
                  <a
                    href={check.url}
                    target='_blank'
                    rel='noreferrer'
                    className='min-w-0 truncate hover:underline'
                    aria-label={t('git.pullRequests.openCheck', {
                      name: check.name,
                    })}
                  >
                    {check.name}
                  </a>
                ) : (
                  <span className='min-w-0 truncate'>{check.name}</span>
                )}
                <Badge variant={OUTCOME_VARIANT[check.outcome]}>
                  {t(`git.outcomes.${check.outcome}`)}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </div>
      {blocker ? (
        <p
          role='status'
          className='flex items-start gap-1.5 text-sm text-muted-foreground'
        >
          <CircleAlertIcon
            aria-hidden='true'
            className='mt-0.5 size-4 shrink-0'
          />
          {t('git.pullRequests.blocked', {
            blocker: t(`git.blockers.${blocker}`),
          })}
        </p>
      ) : null}
      {pull.mergeForcedReason ? (
        <p className='text-sm text-muted-foreground'>
          {t('git.pullRequests.forced', { reason: pull.mergeForcedReason })}
        </p>
      ) : null}
      {canMerge && open && denied ? (
        <p role='status' className='text-sm text-muted-foreground'>
          {t('git.pullRequests.mergeDenied')}
        </p>
      ) : null}
      <div className='flex flex-wrap items-center gap-2'>
        <Button
          variant='outline'
          size='sm'
          disabled={refresh.isPending}
          onClick={() =>
            refresh.mutate(pull.id, {
              onSuccess: () => {
                setRefused(null);
                toaster.show({
                  type: 'success',
                  title: t('git.pullRequests.refreshed'),
                });
              },
              onError: (error) =>
                toaster.show({ type: 'error', title: errorText(error) }),
            })
          }
        >
          {refresh.isPending ? (
            <LoaderCircle data-icon='inline-start' className='animate-spin' />
          ) : (
            <RefreshCwIcon data-icon='inline-start' />
          )}
          {t('git.pullRequests.refresh')}
        </Button>
        {mayMerge ? (
          <Button
            size='sm'
            disabled={merge.isPending}
            onClick={() => send(false)}
          >
            {merge.isPending && !forcing ? (
              <LoaderCircle data-icon='inline-start' className='animate-spin' />
            ) : (
              <GitMergeIcon data-icon='inline-start' />
            )}
            {t('git.pullRequests.merge')}
          </Button>
        ) : null}
        {mayMerge && blocker && FORCEABLE_BLOCKERS.includes(blocker) ? (
          <Button
            variant='outline'
            size='sm'
            disabled={merge.isPending}
            onClick={() => setForcing(true)}
          >
            {t('git.pullRequests.mergeAnyway')}
          </Button>
        ) : null}
      </div>
      <ForceMergeDialog
        open={forcing}
        pending={merge.isPending}
        onOpenChange={setForcing}
        onConfirm={(reason) => send(true, reason)}
      />
    </li>
  );
}

export function IssuePullRequests({
  issueId,
  canMerge,
  onMerged,
}: {
  readonly issueId: string;
  /** Whether the viewer may merge (they may close the issue); the server still checks every merge. */
  readonly canMerge: boolean;
  /** After a merge: the issue moved on (to Done), so the page reads it again. */
  readonly onMerged: () => void;
}): ReactElement | null {
  const { t } = useTranslation();
  const query = useIssuePullRequests(issueId);
  const { data: autopilotEval } = useIssueAutopilot(issueId);
  // Nothing to show while loading or when no pull request is linked, as the block's other sections do.
  if (query.error)
    return (
      <IssueSection
        icon={<GitPullRequestIcon />}
        title={t('git.pullRequests.title')}
      >
        <p role='alert' className='text-sm text-destructive'>
          {t('git.pullRequests.loadFailed')}
        </p>
      </IssueSection>
    );
  if (!query.data || query.data.length === 0) return null;
  return (
    <IssueSection
      icon={<GitPullRequestIcon />}
      title={t('git.pullRequests.title')}
      count={query.data.length}
    >
      <ul className={ISSUE_SECTION_LIST}>
        {query.data.map((pull) => (
          <PullRequestItem
            key={pull.id}
            pull={pull}
            issueId={issueId}
            canMerge={canMerge}
            onMerged={onMerged}
            autopilotEval={autopilotEval}
          />
        ))}
      </ul>
    </IssueSection>
  );
}
