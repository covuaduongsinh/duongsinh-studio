import type { IssueFilters } from '@nocobase/app-plugin-projects/client/issues';
import { useTranslation } from '@nocobase/i18n/client';
import {
  BellIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  CircleDashedIcon,
  CircleDotIcon,
  CircleSlashIcon,
  ListTodoIcon,
  LoaderCircleIcon,
  OctagonAlertIcon,
  StarIcon,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
} from 'react';
import { useNavigate, useSearchParams } from 'react-router';

import { Badge } from '#components/ui/badge';
import { Button } from '#components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '#components/ui/empty';
import { Kbd } from '#components/ui/kbd';
import { Skeleton } from '#components/ui/skeleton';
import { cn } from 'cn';
import { useFollowUpAction } from '#hooks/use-follow-ups';
import {
  SPLIT_GROUPS,
  useTaskGroups,
  type SplitGroupKey,
  type TaskRow,
} from '#hooks/use-task-groups';

import { IssueStatusBadge } from '#components/issue-table';

import { SplitDetailPane } from './issue-split-detail.js';
import { issueHref, useStatusPresenter } from './presentation.js';

const GROUP_LABEL: Record<SplitGroupKey, string> = {
  wait: 'issues.groups.waitingForYou',
  doing: 'issues.groups.inProgress',
  backlog: 'issues.groups.backlog',
  done: 'issues.groups.done',
};

/** The Done group starts folded: finished work is there to look back on, not to read first. */
const DEFAULT_COLLAPSED: readonly SplitGroupKey[] = ['done'];

const storageKey = (membership: string): string =>
  `studio.myIssues.collapsed.${membership}`;

/** The groups a person folded, remembered for them in this browser; the default when nothing was stored. */
function readCollapsed(membership: string): ReadonlySet<SplitGroupKey> {
  try {
    const stored = window.localStorage.getItem(storageKey(membership));
    if (stored !== null) {
      const parsed: unknown = JSON.parse(stored);
      if (Array.isArray(parsed))
        return new Set(
          parsed.filter((key): key is SplitGroupKey =>
            (SPLIT_GROUPS as readonly string[]).includes(String(key)),
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
  collapsed: ReadonlySet<SplitGroupKey>,
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

function StatusGlyph({ statusKey }: { readonly statusKey: string }) {
  const className = 'size-4 shrink-0';
  switch (statusKey) {
    case 'in_review':
      return <CircleDotIcon className={cn(className, 'text-primary')} />;
    case 'in_progress':
      return <LoaderCircleIcon className={cn(className, 'text-primary')} />;
    case 'blocked':
      return (
        <OctagonAlertIcon
          className={cn(className, 'text-(--status-warning)')}
        />
      );
    case 'done':
      return (
        <CheckCircle2Icon
          className={cn(className, 'text-(--status-success)')}
        />
      );
    case 'cancelled':
      return (
        <CircleSlashIcon className={cn(className, 'text-muted-foreground')} />
      );
    default:
      return (
        <CircleDashedIcon className={cn(className, 'text-muted-foreground')} />
      );
  }
}

/** Whether a key press belongs to a field or a control that has its own use for it. */
function typingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
  );
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
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const statusPresenter = useStatusPresenter();
  const follow = useFollowUpAction();
  const [params, setParams] = useSearchParams();
  const query = useTaskGroups({
    q: filters.q,
    statusKey: filters.statusKey,
    projectId: filters.projectId,
    labelId: filters.labelId,
    ownerUserId: filters.ownerUserId,
    executorId: filters.executorId,
    involvesUserId: filters.involvesUserId,
  });
  const data = query.data;
  const membership = data?.membership ?? '';

  // Folded groups: what the person chose in this visit, else what was remembered for them, else the default.
  const [chosen, setChosen] = useState<ReadonlySet<SplitGroupKey> | null>(null);
  const collapsed = useMemo(
    () => chosen ?? readCollapsed(membership),
    [chosen, membership],
  );
  const toggleGroup = (group: SplitGroupKey): void => {
    const next = new Set(collapsed);
    if (next.has(group)) next.delete(group);
    else next.add(group);
    setChosen(next);
    if (membership) writeCollapsed(membership, next);
  };

  // Every row in the order the groups show them, folded or not: the stepper and the keys walk this list.
  const ordered = useMemo<readonly TaskRow[]>(
    () =>
      SPLIT_GROUPS.flatMap(
        (key) => data?.groups.find((group) => group.group === key)?.data ?? [],
      ),
    [data],
  );
  const wanted = params.get('issue');
  // The issue named in the URL, else the first of the list; the URL is only written when the person chooses.
  const activeIndex = Math.max(
    0,
    ordered.findIndex((row) => row.issue.id === wanted),
  );
  const active = ordered[activeIndex];

  const select = useCallback(
    (index: number): void => {
      const row = ordered[index];
      if (!row) return;
      setParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          next.set('issue', row.issue.id);
          return next;
        },
        { replace: true },
      );
    },
    [ordered, setParams],
  );
  const open = useCallback(
    (row: TaskRow | undefined): void => {
      if (row) void navigate(issueHref(row.issue));
    },
    [navigate],
  );
  const toggleFollow = useCallback(
    (row: TaskRow | undefined): void => {
      if (row)
        follow.mutate({
          issueId: row.issue.id,
          action: row.followed ? 'unfollow' : 'follow',
        });
    },
    [follow],
  );

  // J and K step through the list, S follows, Enter opens, `/` goes to the search field. Keys typed into a field are
  // text, and a modified key belongs to the browser or the page's own shortcuts.
  const onKey = useCallback(
    (event: KeyboardEvent): void => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (typingTarget(event.target)) return;
      const interactive =
        event.target instanceof HTMLElement &&
        event.target.closest('button, a, [role="button"]') !== null;
      switch (event.key) {
        case 'j':
          select(Math.min(ordered.length - 1, activeIndex + 1));
          break;
        case 'k':
          select(Math.max(0, activeIndex - 1));
          break;
        case 's':
          toggleFollow(active);
          break;
        case 'Enter':
          // A focused control keeps its own Enter.
          if (interactive) return;
          open(active);
          break;
        case '/': {
          const search = document.querySelector<HTMLInputElement>(
            `input[aria-label="${t('issues.search')}"]`,
          );
          if (!search) return;
          search.focus();
          break;
        }
        default:
          return;
      }
      event.preventDefault();
    },
    [active, activeIndex, ordered.length, open, select, toggleFollow, t],
  );
  useEffect(() => {
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onKey]);

  const dayFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        month: 'short',
        day: 'numeric',
      }),
    [i18n.language],
  );
  const timeFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        hour: '2-digit',
        minute: '2-digit',
      }),
    [i18n.language],
  );
  const stamp = (iso: string | undefined): string => {
    if (!iso) return '';
    const date = new Date(iso);
    const today = new Date();
    return date.toDateString() === today.toDateString()
      ? timeFormat.format(date)
      : dayFormat.format(date);
  };

  /** The line under a row's title: what the person must do, what holds it back, or that an agent is on it. */
  const hintOf = (
    row: TaskRow,
  ): { text: string; tone: 'warn' | 'info' | 'plain' } | null => {
    const wait = row.waits[0];
    if (wait) return { text: t(`issues.split.waits.${wait}`), tone: 'warn' };
    if (row.dependencyWait && row.blockers[0]) {
      const [first, ...rest] = row.blockers;
      return {
        text:
          rest.length === 0
            ? t('issues.split.blockedBy', { identifier: first.identifier })
            : t('issues.split.blockedByMore', {
                identifier: first.identifier,
                count: rest.length,
              }),
        tone: 'plain',
      };
    }
    if (
      row.issue.executor?.type === 'agent' &&
      row.issue.statusKey === 'in_progress'
    )
      return { text: t('issues.split.agentWorking'), tone: 'info' };
    return null;
  };

  const keyHints: readonly (readonly [string, string])[] = [
    ['J K', t('issues.split.keySwitch')],
    ['S', t('issues.split.keyFollow')],
    ['Enter', t('issues.split.keyOpen')],
    ['/', t('issues.split.keySearch')],
  ];

  return (
    <div className='flex h-[calc(100vh-12rem)] w-full overflow-hidden rounded-xl border bg-card shadow-xs'>
      <aside
        className='flex h-full w-80 shrink-0 flex-col overflow-hidden border-r bg-muted/10 lg:w-96'
        aria-label={t('issues.title')}
      >
        <div className='flex-1 space-y-2 overflow-y-auto p-2'>
          {query.isPending ? (
            <div className='space-y-3 p-2'>
              {[0, 1, 2, 3, 4].map((index) => (
                <Skeleton key={index} className='h-16 w-full rounded-lg' />
              ))}
            </div>
          ) : query.isError ? (
            <div className='space-y-3 p-6 text-center text-sm text-muted-foreground'>
              <p>{t('issues.split.loadFailed')}</p>
              <Button
                variant='outline'
                size='sm'
                onClick={() => void query.refetch()}
              >
                {t('listFeedback.retry')}
              </Button>
            </div>
          ) : ordered.length === 0 ? (
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
            SPLIT_GROUPS.map((key) => {
              const group = data?.groups.find((entry) => entry.group === key);
              if (!group || group.data.length === 0) return null;
              const label = t(GROUP_LABEL[key]);
              const folded = collapsed.has(key);
              return (
                <section
                  key={key}
                  className={cn(
                    'rounded-lg border bg-card',
                    key === 'wait' &&
                      'border-(--status-warning)/30 bg-(--status-warning-background)',
                  )}
                >
                  <button
                    type='button'
                    aria-expanded={!folded}
                    aria-label={t(
                      folded ? 'issues.split.unfold' : 'issues.split.fold',
                      { group: label },
                    )}
                    onClick={() => toggleGroup(key)}
                    className='flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold'
                  >
                    {key === 'wait' ? (
                      <BellIcon className='size-4 text-(--status-warning)' />
                    ) : (
                      <StatusGlyph
                        statusKey={
                          key === 'doing'
                            ? 'in_progress'
                            : key === 'done'
                              ? 'done'
                              : 'backlog'
                        }
                      />
                    )}
                    <span className='flex-1'>{label}</span>
                    <Badge
                      variant='secondary'
                      className='h-4 px-1.5 py-0 text-[10px]'
                    >
                      {group.count}
                    </Badge>
                    {folded ? (
                      <ChevronRightIcon className='size-4 text-muted-foreground' />
                    ) : (
                      <ChevronDownIcon className='size-4 text-muted-foreground' />
                    )}
                  </button>
                  {!folded && (
                    <ul className='divide-y border-t'>
                      {group.data.map((row) => {
                        const hint = hintOf(row);
                        const isSelected = row.issue.id === active?.issue.id;
                        return (
                          <li key={row.issue.id}>
                            <button
                              type='button'
                              aria-current={isSelected ? 'true' : undefined}
                              onClick={() =>
                                select(
                                  ordered.findIndex(
                                    (entry) => entry.issue.id === row.issue.id,
                                  ),
                                )
                              }
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                  event.preventDefault();
                                  open(row);
                                }
                              }}
                              className={cn(
                                'flex w-full flex-col gap-0.5 px-3 py-2 text-left transition-colors hover:bg-muted/60',
                                isSelected &&
                                  'border-l-2 border-primary bg-accent/80 text-accent-foreground',
                              )}
                            >
                              <span className='flex items-center gap-2'>
                                <StatusGlyph statusKey={row.issue.statusKey} />
                                <span className='line-clamp-1 flex-1 text-sm font-medium'>
                                  {row.issue.title}
                                </span>
                                <span className='shrink-0 text-xs text-muted-foreground'>
                                  {stamp(
                                    row.issue.lastActivityAt ??
                                      row.issue.updatedAt,
                                  )}
                                </span>
                              </span>
                              <span className='flex items-center gap-1.5 pl-6 text-xs'>
                                <span className='font-mono text-muted-foreground'>
                                  {row.issue.identifier}
                                </span>
                                {hint && (
                                  <>
                                    <span
                                      aria-hidden
                                      className='text-muted-foreground'
                                    >
                                      ·
                                    </span>
                                    <span
                                      className={cn(
                                        hint.tone === 'warn' &&
                                          'text-(--status-warning)',
                                        hint.tone === 'info' && 'text-primary',
                                        hint.tone === 'plain' &&
                                          'text-muted-foreground',
                                      )}
                                    >
                                      {hint.text}
                                    </span>
                                  </>
                                )}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              );
            })
          )}
        </div>
        <ul
          aria-label={t('issues.split.keys')}
          className='flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-t px-3 py-2 text-xs text-muted-foreground max-lg:hidden'
        >
          {keyHints.map(([keys, label]) => (
            <li key={keys} className='flex items-center gap-1'>
              {keys.split(' ').map((part) => (
                <Kbd key={part}>{part}</Kbd>
              ))}
              <span>{label}</span>
            </li>
          ))}
        </ul>
      </aside>

      <main className='flex h-full min-w-0 flex-1 flex-col overflow-y-auto bg-background'>
        {active ? (
          <>
            <div className='sticky top-0 z-10 flex items-center gap-2 border-b bg-background/95 px-4 py-2 backdrop-blur'>
              <Button
                variant='ghost'
                size='icon'
                className='size-7'
                aria-label={t('issues.split.previous')}
                disabled={activeIndex === 0}
                onClick={() => select(activeIndex - 1)}
              >
                <ChevronUpIcon />
              </Button>
              <Button
                variant='ghost'
                size='icon'
                className='size-7'
                aria-label={t('issues.split.next')}
                disabled={activeIndex >= ordered.length - 1}
                onClick={() => select(activeIndex + 1)}
              >
                <ChevronDownIcon />
              </Button>
              <span className='text-xs text-muted-foreground'>
                {t('issues.split.position', {
                  index: activeIndex + 1,
                  total: ordered.length,
                })}
              </span>
              <span className='font-mono text-xs'>
                {active.issue.identifier}
              </span>
              {active.issue.project && (
                <span className='truncate text-xs text-muted-foreground'>
                  · {active.issue.project.name}
                </span>
              )}
              <span className='flex-1' />
              <IssueStatusBadge
                status={statusPresenter(active.issue.statusKey)}
              />
              <Button
                variant='outline'
                size='sm'
                aria-pressed={active.followed}
                onClick={() => toggleFollow(active)}
              >
                <StarIcon data-icon='inline-start' />
                {active.followed
                  ? t('issues.split.unfollow')
                  : t('issues.split.follow')}
              </Button>
            </div>
            <SplitDetailPane issueId={active.issue.id} />
          </>
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
