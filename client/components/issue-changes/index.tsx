import { useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import {
  CircleAlertIcon,
  ExternalLinkIcon,
  LoaderCircle,
  MessageSquareWarningIcon,
} from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { Badge } from '#components/ui/badge';
import { Button, buttonVariants } from '#components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#components/ui/dialog';
import { Textarea } from '#components/ui/textarea';
import { useChangeSummary, useRequestChanges } from '#hooks/use-change-summary';

/**
 * "Thay đổi": what a pull request changes in a few numbers (files, lines, the directories, the files that match the
 * project's sensitive paths, the latest verification), with two actions: ask for changes (a comment that wakes the author)
 * and open the pull request on GitHub. Approving stays the issue's own acceptance (plan T, T7).
 */
export function IssueChangeSummary({
  pullRequestId,
  headSha,
  canComment,
}: {
  readonly pullRequestId: string;
  readonly headSha: string;
  readonly canComment: boolean;
}): ReactElement | null {
  const { t } = useTranslation();
  const toaster = useToaster();
  const summary = useChangeSummary(pullRequestId, headSha);
  const request = useRequestChanges(pullRequestId);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  if (summary.isPending)
    return (
      <div className='flex items-center gap-2 text-sm text-muted-foreground'>
        <LoaderCircle className='size-4 animate-spin' />
        {t('issueChanges.loading')}
      </div>
    );
  if (summary.isError || !summary.data) return null;
  const data = summary.data;
  const send = (): void =>
    request.mutate(note.trim(), {
      onSuccess: () => {
        toaster.show({ type: 'success', title: t('issueChanges.sent') });
        setNote('');
        setOpen(false);
      },
      onError: (error) =>
        toaster.show({
          type: 'error',
          title: t('issueChanges.failed'),
          description: error instanceof Error ? error.message : String(error),
        }),
    });
  return (
    <section
      className='flex flex-col gap-3 rounded-lg border p-4'
      aria-label={t('issueChanges.title')}
    >
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <h3 className='font-medium'>
          {t('issueChanges.title')} · #{data.number}
        </h3>
        <div className='flex flex-wrap items-center gap-2 text-sm'>
          <span>{t('issueChanges.files', { count: data.files })}</span>
          <span className='text-(--status-success)'>+{data.additions}</span>
          <span className='text-destructive'>−{data.deletions}</span>
        </div>
      </div>
      {data.verification ? (
        <div className='flex flex-wrap items-center gap-2 text-sm'>
          <Badge
            variant={
              data.verification.result === 'passed' &&
              data.verification.matchesHead
                ? 'secondary'
                : 'destructive'
            }
          >
            {t(`issueChanges.verification.${data.verification.result}`, {
              defaultValue: data.verification.result,
            })}
          </Badge>
          {!data.verification.matchesHead ? (
            <span className='text-muted-foreground'>
              {t('issueChanges.verification.stale')}
            </span>
          ) : null}
        </div>
      ) : (
        <p className='text-sm text-muted-foreground'>
          {t('issueChanges.verification.none')}
        </p>
      )}
      {data.sensitive.length > 0 ? (
        <div className='flex items-start gap-2 text-sm'>
          <CircleAlertIcon className='mt-0.5 size-4 shrink-0 text-destructive' />
          <span>
            {t('issueChanges.sensitive', { files: data.sensitive.join(', ') })}
          </span>
        </div>
      ) : null}
      <ul className='flex flex-col gap-1 text-sm'>
        {data.groups.map((group) => (
          <li key={group.directory} className='flex justify-between gap-3'>
            <code className='min-w-0 truncate'>{group.directory}</code>
            <span className='shrink-0 text-muted-foreground'>
              {t('issueChanges.files', { count: group.files })} · +
              {group.additions} −{group.deletions}
            </span>
          </li>
        ))}
      </ul>
      <div className='flex flex-wrap gap-2'>
        {canComment ? (
          <Button variant='outline' size='sm' onClick={() => setOpen(true)}>
            <MessageSquareWarningIcon />
            {t('issueChanges.requestChanges')}
          </Button>
        ) : null}
        <a
          href={data.url}
          target='_blank'
          rel='noreferrer'
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
        >
          <ExternalLinkIcon />
          {t('issueChanges.openGithub')}
        </a>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('issueChanges.requestChanges')}</DialogTitle>
            <DialogDescription>
              {t('issueChanges.requestDescription')}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            aria-label={t('issueChanges.note')}
            rows={5}
          />
          <DialogFooter>
            <Button
              disabled={note.trim() === '' || request.isPending}
              onClick={send}
            >
              {request.isPending ? (
                <LoaderCircle className='animate-spin' />
              ) : null}
              {t('issueChanges.send')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
