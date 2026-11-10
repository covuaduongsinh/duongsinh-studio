/**
 * What a person can do about the pull request from the "Needs you" card: merge it, record that it was merged elsewhere,
 * open its changes, and read the Lead Agent's last explanation. The server decides who may merge (`canMerge` only hides
 * what it would refuse); the pull request card under "Code & previews" keeps the detail (checks, "merge anyway").
 */
import { useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { ExternalLinkIcon, GitMergeIcon } from 'lucide-react';
import type { ReactElement } from 'react';

import { Button, buttonVariants } from '#components/ui/button';
import {
  useIssuePullRequests,
  useMarkPullRequestMerged,
  useMergePullRequest,
  type GitPullRequest,
} from '#hooks/use-git';

import { lastAgentComment } from './issue-scroll.js';

function checksKey(pull: GitPullRequest): string | null {
  if (pull.ciState === 'success') return 'checksPassed';
  if (pull.ciState === 'failure') return 'checksFailed';
  if (pull.ciState === 'pending') return 'checksPending';
  return null;
}

export function IssueNeedsYouActions({
  issueId,
  canMerge,
  onChanged,
  onShowActivity,
}: {
  readonly issueId: string;
  readonly canMerge: boolean;
  readonly onChanged: () => void;
  /** Opens the Activity tab, so the explanation the link points at is on the page. */
  readonly onShowActivity: () => void;
}): ReactElement | null {
  const { t } = useTranslation();
  const toaster = useToaster();
  const pulls = useIssuePullRequests(issueId);
  const merge = useMergePullRequest(issueId);
  const mark = useMarkPullRequestMerged(issueId);
  const list = Array.isArray(pulls.data) ? pulls.data : [];
  const open = list.find((pull) => pull.state === 'open');
  const shown = open ?? list[0];
  const checks = shown ? checksKey(shown) : null;
  const failure = (): void => {
    toaster.show({ type: 'error', title: t('issueWork.failed') });
  };
  const done = { onSuccess: onChanged, onError: failure };

  const explain = (): void => {
    const show = (): void =>
      lastAgentComment()?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    if (lastAgentComment()) {
      show();
      return;
    }
    // On another tab the comment is not drawn yet: open Activity, then go to it.
    onShowActivity();
    setTimeout(show, 50);
  };

  return (
    <div className='flex flex-col gap-2' data-testid='needs-you-actions'>
      {checks ? (
        <p className='text-xs text-muted-foreground'>
          {t(`issueWork.needsYouActions.${checks}`)}
        </p>
      ) : null}
      <div>
        <button
          type='button'
          className='text-sm font-medium text-primary underline-offset-4 hover:underline'
          onClick={explain}
        >
          {t('issueWork.needsYouActions.leadExplanation')}
        </button>
      </div>
      <div className='flex flex-wrap gap-2'>
        {canMerge && open && !open.draft ? (
          <>
            <Button
              size='sm'
              disabled={merge.isPending}
              onClick={() =>
                merge.mutate({ pullRequestId: open.id, force: false }, done)
              }
            >
              <GitMergeIcon data-icon='inline-start' />
              {t('issueWork.needsYouActions.merge')}
            </Button>
            <Button
              size='sm'
              variant='outline'
              disabled={mark.isPending}
              onClick={() => mark.mutate({ pullRequestId: open.id }, done)}
            >
              {t('issueWork.needsYouActions.markMerged')}
            </Button>
          </>
        ) : null}
        {shown?.url ? (
          <a
            href={shown.url}
            target='_blank'
            rel='noreferrer'
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            {t('issueWork.needsYouActions.viewChanges')}
            <ExternalLinkIcon data-icon='inline-end' />
          </a>
        ) : null}
      </div>
    </div>
  );
}

/** Just the Merge button, for the header that stays while the page scrolls; the same pull request as the card's. */
export function IssueMergeButton({
  issueId,
  canMerge,
  onChanged,
}: {
  readonly issueId: string;
  readonly canMerge: boolean;
  readonly onChanged: () => void;
}): ReactElement | null {
  const { t } = useTranslation();
  const toaster = useToaster();
  const pulls = useIssuePullRequests(issueId);
  const merge = useMergePullRequest(issueId);
  const open = (Array.isArray(pulls.data) ? pulls.data : []).find(
    (pull) => pull.state === 'open' && !pull.draft,
  );
  if (!canMerge || !open) return null;
  return (
    <Button
      size='sm'
      disabled={merge.isPending}
      onClick={() =>
        merge.mutate(
          { pullRequestId: open.id, force: false },
          {
            onSuccess: onChanged,
            onError: () =>
              toaster.show({ type: 'error', title: t('issueWork.failed') }),
          },
        )
      }
    >
      <GitMergeIcon data-icon='inline-start' />
      {t('issueWork.needsYouActions.merge')}
    </Button>
  );
}
