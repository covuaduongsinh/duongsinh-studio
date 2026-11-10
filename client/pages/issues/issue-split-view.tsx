import {
  flattenIssuePages,
  useIssueDetail,
  useIssuePages,
  type IssueFilters,
} from '@nocobase/app-plugin-projects/client/issues';
import {
  pmKeys,
  PmDetailSkeleton,
  useViewer,
} from '@nocobase/app-plugin-projects/client/kit';
import type { IssueListItem } from '@nocobase/app-plugin-projects/shared/issues';
import {
  IN_PROGRESS_STATUS,
  isTerminalCategory,
  OWNER_NOTIFIED_STATUSES,
  statusCategory,
} from '@nocobase/app-plugin-projects/shared/statuses';
import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon, ListTodoIcon, LoaderCircle } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { IssueStatusBadge } from '#components/issue-table';
import { Badge } from '#components/ui/badge';
import { Button } from '#components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '#components/ui/empty';
import { cn } from 'cn';

import { IssueDetailView } from './detail/index.js';
import { useStatusPresenter } from './presentation.js';

interface IssueGroup {
  readonly key: 'waiting' | 'inProgress' | 'todo' | 'done';
  readonly label: string;
  readonly items: readonly IssueListItem[];
}

export function IssueSplitView({
  filters,
  filtered,
  onClear,
}: {
  readonly filters: IssueFilters;
  readonly filtered: boolean;
  readonly onClear: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const viewer = useViewer();
  const statusPresenter = useStatusPresenter();
  const query = useIssuePages(filters, true);
  const items = flattenIssuePages(query.data?.pages);

  const [selectedIdentifier, setSelectedIdentifier] = useState<string | null>(
    null,
  );

  // Group by the plugin's fixed status keys, never by translated names: Waiting holds what the viewer owns and must
  // decide (`blocked`, `in_review`), then In progress, Todo (backlog) and Done (done, cancelled).
  const myId = viewer?.userId;
  const buckets: Record<IssueGroup['key'], IssueListItem[]> = {
    waiting: [],
    inProgress: [],
    todo: [],
    done: [],
  };
  for (const item of items) {
    if (isTerminalCategory(statusCategory(item.statusKey))) {
      buckets.done.push(item);
    } else if (
      myId &&
      item.ownerUserId === myId &&
      OWNER_NOTIFIED_STATUSES.includes(item.statusKey)
    ) {
      buckets.waiting.push(item);
    } else if (item.statusKey === IN_PROGRESS_STATUS) {
      buckets.inProgress.push(item);
    } else {
      buckets.todo.push(item);
    }
  }
  const groups: IssueGroup[] = [
    {
      key: 'waiting',
      label: t('issues.groups.waitingForYou'),
      items: buckets.waiting,
    },
    {
      key: 'inProgress',
      label: t('issues.groups.inProgress'),
      items: buckets.inProgress,
    },
    { key: 'todo', label: t('issues.groups.backlog'), items: buckets.todo },
    { key: 'done', label: t('issues.groups.done'), items: buckets.done },
  ];

  // The selection falls back to the first issue when nothing is chosen or the chosen one left the list.
  const activeIdentifier = items.some(
    (it) => it.identifier === selectedIdentifier,
  )
    ? selectedIdentifier
    : (items[0]?.identifier ?? null);

  return (
    <div className='flex h-[calc(100vh-12rem)] w-full overflow-hidden rounded-xl border bg-card shadow-xs'>
      {/* Left Pane: Grouped Accordion List */}
      <aside
        className='flex flex-col border-r bg-muted/10 w-80 lg:w-96 shrink-0 h-full overflow-hidden'
        aria-label={t('issues.title')}
      >
        <div className='flex-1 overflow-y-auto p-2 space-y-4'>
          {query.isPending && !query.data ? (
            <div className='space-y-3 p-2'>
              {[0, 1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className='h-16 w-full rounded-lg bg-muted/50 animate-pulse'
                />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className='p-6 text-center text-sm text-muted-foreground'>
              {filtered ? t('issues.noMatchingIssues') : t('issues.noIssues')}
              {filtered && (
                <div className='mt-3'>
                  <Button variant='outline' size='sm' onClick={onClear}>
                    {t('issues.clearFilters')}
                  </Button>
                </div>
              )}
            </div>
          ) : (
            groups.map((grp) => {
              if (grp.items.length === 0) return null;
              return (
                <div key={grp.key} className='space-y-1.5'>
                  <div className='flex items-center justify-between px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground'>
                    <span>{grp.label}</span>
                    <Badge
                      variant='secondary'
                      className='text-[10px] px-1.5 py-0 h-4'
                    >
                      {grp.items.length}
                    </Badge>
                  </div>
                  <div className='space-y-1'>
                    {grp.items.map((item) => {
                      const isSelected = item.identifier === activeIdentifier;
                      const pres = statusPresenter(item.statusKey);

                      return (
                        <button
                          key={item.id}
                          type='button'
                          onClick={() => setSelectedIdentifier(item.identifier)}
                          className={cn(
                            'w-full text-left rounded-lg p-2.5 transition-all flex flex-col gap-1 border',
                            isSelected
                              ? 'bg-accent/80 text-accent-foreground border-primary/40 shadow-xs ring-1 ring-primary/20'
                              : 'bg-card/50 hover:bg-muted/60 border-transparent text-foreground',
                          )}
                        >
                          <div className='flex items-center justify-between gap-2 min-w-0'>
                            <span className='font-mono text-xs font-semibold text-primary truncate'>
                              {item.identifier}
                            </span>
                            <IssueStatusBadge status={pres} />
                          </div>

                          <div className='text-sm font-medium line-clamp-2 break-all'>
                            {item.title}
                          </div>

                          <div className='flex items-center justify-between text-xs text-muted-foreground pt-0.5'>
                            <span className='truncate max-w-[140px]'>
                              {item.executorName || item.owner?.name || ''}
                            </span>
                            {item.priority && (
                              <span className='capitalize text-[11px] font-mono'>
                                {item.priority}
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}

          {query.hasNextPage && (
            <div className='p-2 text-center'>
              <Button
                variant='outline'
                size='sm'
                className='w-full text-xs'
                disabled={query.isFetchingNextPage}
                onClick={() => {
                  query.fetchNextPage().catch(() => undefined);
                }}
              >
                {query.isFetchingNextPage ? (
                  <LoaderCircle className='size-3.5 animate-spin mr-1.5' />
                ) : null}
                {t('issues.loadMore')}
              </Button>
            </div>
          )}
        </div>
      </aside>

      {/* Right Pane: Selected Issue Detail */}
      <main className='flex-1 flex flex-col h-full min-w-0 bg-background overflow-y-auto'>
        {activeIdentifier ? (
          <SplitDetailPane issueId={activeIdentifier} />
        ) : (
          <div className='flex h-full items-center justify-center p-6'>
            <Empty className='max-w-sm'>
              <EmptyHeader>
                <EmptyMedia variant='icon'>
                  <ListTodoIcon className='size-8 text-muted-foreground' />
                </EmptyMedia>
                <EmptyTitle>{t('issues.title')}</EmptyTitle>
                <EmptyDescription>{t('issues.selectToView')}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          </div>
        )}
      </main>
    </div>
  );
}

function SplitDetailPane({
  issueId,
}: {
  readonly issueId: string;
}): ReactElement {
  const { t } = useTranslation();
  const query = useIssueDetail(issueId);

  if (query.data) {
    return (
      <div className='p-4 md:p-6'>
        <IssueDetailView
          detail={query.data}
          detailKey={pmKeys.issue(issueId)}
        />
      </div>
    );
  }

  if (query.error) {
    return (
      <div className='p-6 text-center text-sm text-destructive'>
        <AlertCircleIcon className='size-6 mx-auto mb-2' />
        {t('issueDetail.loadFailed')}
      </div>
    );
  }

  return (
    <div className='p-6'>
      <PmDetailSkeleton />
    </div>
  );
}
