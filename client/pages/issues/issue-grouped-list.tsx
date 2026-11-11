/**
 * The Issues page's list: the issues grouped by what they wait for (`GET /api/taskGroups?mode=table&follow=scope`),
 * each group folded or open and counted, with the project of every row and the signs that matter on it: what it waits
 * for from the person, what holds it back, an agent at work, its pull request and checks, its sub-issues.
 */
import type { IssueFilters } from '@nocobase/app-plugin-projects/client/issues';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import { ChevronDownIcon, ChevronRightIcon } from 'lucide-react';
import { useMemo, useState, type ReactElement } from 'react';
import { Link } from 'react-router';

import { IssueStatusBadge } from '#components/issue-table';
import { ListFeedback, ListFeedbackActions } from '#components/list-feedback';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#components/ui/table';
import { usePullRequestMarks, type PullMark } from '#hooks/use-git';
import {
  TABLE_GROUPS,
  useTaskGroups,
  type TableGroupKey,
  type TaskRow,
} from '#hooks/use-task-groups';
import { cn } from 'cn';

import { issueHref, useStatusPresenter } from './presentation.js';

const GROUP_LABEL: Record<TableGroupKey, string> = {
  wait: 'issues.groups.waitingForYou',
  doing: 'issues.groups.inProgress',
  review: 'issues.groups.inReview',
  blocked: 'issues.groups.blocked',
  backlog: 'issues.groups.backlog',
  done: 'issues.groups.done',
  cancelled: 'issues.groups.cancelled',
};

/** Finished work starts folded: it is there to look back on, not to read first. */
const DEFAULT_COLLAPSED: readonly TableGroupKey[] = ['done', 'cancelled'];

const storageKey = (membership: string): string =>
  `studio.issues.collapsed.${membership}`;

/** The groups a person folded, remembered for them in this browser; the default when nothing was stored. */
function readCollapsed(membership: string): ReadonlySet<TableGroupKey> {
  try {
    const stored = window.localStorage.getItem(storageKey(membership));
    if (stored !== null) {
      const parsed: unknown = JSON.parse(stored);
      if (Array.isArray(parsed))
        return new Set(
          parsed.filter((key): key is TableGroupKey =>
            (TABLE_GROUPS as readonly string[]).includes(String(key)),
          ),
        );
    }
  } catch {
    // Storage can be blocked or hold something else: the default is right.
  }
  return new Set(DEFAULT_COLLAPSED);
}

function writeCollapsed(
  membership: string,
  collapsed: ReadonlySet<TableGroupKey>,
): void {
  try {
    window.localStorage.setItem(
      storageKey(membership),
      JSON.stringify([...collapsed]),
    );
  } catch {
    // Not remembered; the group is still folded for this visit.
  }
}

export function IssueGroupedList({
  filters,
  filtered,
  onClear,
}: {
  readonly filters: IssueFilters;
  readonly filtered: boolean;
  readonly onClear: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const { i18n } = useTranslation();
  const { locale } = useLocale();
  const statusPresenter = useStatusPresenter();
  const query = useTaskGroups(
    {
      q: filters.q,
      statusKey: filters.statusKey,
      projectId: filters.projectId,
      labelId: filters.labelId,
      ownerUserId: filters.ownerUserId,
      executorId: filters.executorId,
      involvesUserId: filters.involvesUserId,
    },
    'table',
  );
  const data = query.data;
  const membership = data?.membership ?? '';
  const [chosen, setChosen] = useState<ReadonlySet<TableGroupKey> | null>(null);
  const collapsed = useMemo(
    () => chosen ?? readCollapsed(membership),
    [chosen, membership],
  );
  const toggle = (group: TableGroupKey): void => {
    const next = new Set(collapsed);
    if (next.has(group)) next.delete(group);
    else next.add(group);
    setChosen(next);
    if (membership) writeCollapsed(membership, next);
  };

  const groups = (data?.groups ?? []).filter((group) =>
    (TABLE_GROUPS as readonly string[]).includes(group.group),
  );
  // Pull requests are read for the rows that are drawn, in one request.
  const shownIds = groups.flatMap((group) =>
    collapsed.has(group.group) ? [] : group.data.map((row) => row.issue.id),
  );
  const marks = usePullRequestMarks(shownIds);

  const state = query.error
    ? data
      ? 'refresh-failed'
      : 'failed'
    : !data
      ? 'loading'
      : groups.length === 0
        ? filtered
          ? 'no-results'
          : 'empty'
        : 'ready';

  const hintOf = (row: TaskRow): string | null => {
    const wait = row.waits[0];
    if (wait) return t(`issues.split.waits.${wait}`);
    if (row.dependencyWait && row.blockers[0]) {
      const [first, ...rest] = row.blockers;
      return rest.length === 0
        ? t('issues.split.blockedBy', { identifier: first.identifier })
        : t('issues.split.blockedByMore', {
            identifier: first.identifier,
            count: rest.length,
          });
    }
    if (
      row.issue.executor?.type === 'agent' &&
      row.issue.statusKey === 'in_progress'
    )
      return t('issues.split.agentWorking');
    return null;
  };
  const pullText = (mark: PullMark): string =>
    [
      t(`issues.list.pr.${mark.state}`),
      mark.state === 'open' && mark.ciState
        ? t(`issues.list.ci.${mark.ciState}`)
        : null,
    ]
      .filter(Boolean)
      .join(' · ');

  return (
    <div className='flex flex-col gap-3'>
      <ListFeedback state={state}>
        <div
          className='flex flex-col gap-3'
          role='region'
          aria-label={t('issues.list.group')}
        >
          {groups.map((group) => {
            const key = group.group;
            const label = t(GROUP_LABEL[key]);
            const folded = collapsed.has(key);
            return (
              <section
                key={key}
                aria-label={label}
                className='overflow-hidden rounded-lg border bg-card'
              >
                <button
                  type='button'
                  aria-expanded={!folded}
                  aria-label={t(
                    folded ? 'issues.split.unfold' : 'issues.split.fold',
                    { group: label },
                  )}
                  onClick={() => toggle(key)}
                  className={cn(
                    'flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm font-medium',
                    key === 'wait' && 'bg-(--status-warning)/10',
                  )}
                >
                  {folded ? (
                    <ChevronRightIcon className='size-4 text-muted-foreground' />
                  ) : (
                    <ChevronDownIcon className='size-4 text-muted-foreground' />
                  )}
                  <span>{label}</span>
                  <span className='rounded-full bg-muted px-1.5 text-xs text-muted-foreground tabular-nums'>
                    {group.count}
                  </span>
                </button>
                {folded ? null : (
                  <Table className='table-fixed'>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('issues.table.title')}</TableHead>
                        <TableHead className='w-40'>
                          {t('issues.list.project')}
                        </TableHead>
                        <TableHead className='w-36'>
                          {t('issues.list.status')}
                        </TableHead>
                        <TableHead className='w-44'>
                          {t('issues.list.executor')}
                        </TableHead>
                        <TableHead className='w-28 text-right'>
                          {t('issues.list.updated')}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {group.data.map((row) => {
                        const issue = row.issue;
                        const hint = hintOf(row);
                        const mark = marks.data?.[issue.id];
                        const total = row.progress?.total ?? 0;
                        return (
                          <TableRow key={issue.id}>
                            <TableCell className='max-w-0 min-w-64'>
                              <Link
                                to={issueHref(issue)}
                                className='flex flex-col gap-0.5 hover:underline'
                              >
                                <span className='truncate font-medium'>
                                  {issue.title}
                                </span>
                                <span className='flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground'>
                                  <span className='font-mono'>
                                    {issue.identifier}
                                  </span>
                                  {hint ? (
                                    <span
                                      className={
                                        row.waits.length > 0
                                          ? 'text-(--status-warning)'
                                          : undefined
                                      }
                                    >
                                      {hint}
                                    </span>
                                  ) : null}
                                  {total > 0 ? (
                                    <span>
                                      {t('issues.list.subtasks', {
                                        finished: row.progress?.finished ?? 0,
                                        total,
                                      })}
                                    </span>
                                  ) : null}
                                </span>
                              </Link>
                              {mark ? (
                                <a
                                  href={mark.url}
                                  target='_blank'
                                  rel='noreferrer'
                                  className='text-xs text-muted-foreground hover:underline'
                                >
                                  {pullText(mark)}
                                </a>
                              ) : null}
                            </TableCell>
                            <TableCell className='text-sm text-muted-foreground'>
                              {issue.project?.name ??
                                t('issues.list.noProject')}
                            </TableCell>
                            <TableCell>
                              <IssueStatusBadge
                                status={statusPresenter(issue.statusKey)}
                                size='sm'
                              />
                            </TableCell>
                            <TableCell className='text-sm text-muted-foreground'>
                              {issue.executorName ?? '—'}
                            </TableCell>
                            <TableCell className='text-right text-xs text-muted-foreground tabular-nums'>
                              {issue.updatedAt
                                ? new Date(issue.updatedAt).toLocaleDateString(
                                    locale || i18n.language,
                                  )
                                : ''}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </section>
            );
          })}
        </div>
      </ListFeedback>
      <div className='flex justify-center gap-2 empty:hidden'>
        <ListFeedbackActions
          state={state}
          onClear={onClear}
          onRetry={() => {
            query.refetch().catch(() => undefined);
          }}
          busy={query.isFetching}
        />
      </div>
    </div>
  );
}
