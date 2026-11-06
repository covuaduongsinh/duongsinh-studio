/** The Agent queue view of the issue pages: what each agent is doing, grouped by what it waits for. */
import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';
import { Link } from 'react-router';

import { Badge } from '#components/ui/badge';
import { Button } from '#components/ui/button';
import { Skeleton } from '#components/ui/skeleton';
import {
  useAgentBoard,
  useStartOnBoard,
  type AgentBoardRow,
} from '#hooks/use-issue-work';

const GROUPS = ['waiting', 'working', 'queued', 'idle'] as const;

function RowDetail({
  row,
}: {
  readonly row: AgentBoardRow;
}): ReactElement | null {
  const { t } = useTranslation();
  if (row.waiting)
    return (
      <span className='text-muted-foreground'>
        {row.waiting.detail ??
          t(
            row.waiting.viewerDecides
              ? `issueWork.queue.waiting.yours.${row.waiting.kind}`
              : `issueWork.queue.waiting.other.${row.waiting.kind}`,
          )}
      </span>
    );
  if (row.queue)
    return (
      <span className='text-muted-foreground'>
        {t(`issueWork.queue.reason.${row.queue.reason}`, {
          defaultValue: row.queue.reason,
          until: row.queue.until
            ? new Date(row.queue.until).toLocaleString()
            : t('issueWork.queue.untilUnknown'),
        })}
      </span>
    );
  if (row.run?.lastActivity?.text)
    return (
      <span className='text-muted-foreground'>{row.run.lastActivity.text}</span>
    );
  if (row.idle)
    return (
      <span className='text-muted-foreground'>
        {t(`issueWork.queue.idle.${row.idle.reason}`)}
      </span>
    );
  return null;
}

export function AgentQueueView({
  filters,
}: {
  readonly filters: Readonly<Record<string, string | undefined>>;
}): ReactElement {
  const { t } = useTranslation();
  const board = useAgentBoard(filters);
  const start = useStartOnBoard();

  if (board.isLoading)
    return (
      <Skeleton
        className='h-40 w-full'
        aria-label={t('issueWork.queue.loading')}
      />
    );
  if (board.isError)
    return (
      <p className='text-sm text-destructive'>{t('issueWork.queue.failed')}</p>
    );
  const rows = board.data?.rows ?? [];
  if (rows.length === 0)
    return (
      <p className='text-sm text-muted-foreground'>
        {t('issueWork.queue.empty')}
      </p>
    );

  return (
    <div className='flex flex-col gap-6' data-testid='agent-queue'>
      {GROUPS.map((group) => {
        const members = rows.filter((row) => row.state === group);
        if (members.length === 0) return null;
        return (
          <section key={group} aria-label={t(`issueWork.queue.group.${group}`)}>
            <h3 className='mb-2 flex items-center gap-2 text-sm font-medium'>
              {t(`issueWork.queue.group.${group}`)}
              <Badge variant='secondary'>{members.length}</Badge>
            </h3>
            <ul className='flex flex-col divide-y rounded-md border'>
              {members.map((row) => (
                <li
                  key={row.issue.id}
                  className='flex flex-wrap items-center gap-x-3 gap-y-1 p-3 text-sm'
                >
                  <Link
                    className='font-medium underline-offset-4 hover:underline'
                    to={`/issues/${row.issue.id}`}
                  >
                    {row.issue.identifier} {row.issue.title}
                  </Link>
                  <span>
                    {board.data?.agents[row.agentId]?.name ?? row.agentId}
                  </span>
                  <RowDetail row={row} />
                  {row.idle?.mayStart ? (
                    <Button
                      className='ml-auto'
                      size='sm'
                      variant='outline'
                      disabled={start.isPending}
                      onClick={() => start.mutate(row.issue.id)}
                    >
                      {t('issueWork.queue.start')}
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
