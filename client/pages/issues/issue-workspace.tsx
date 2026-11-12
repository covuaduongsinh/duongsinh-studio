/**
 * The issue list and board, shared by `/issues` and `/my-issues`. Everything the toolbar sets lives in the query string
 * through the projects plugin's filter helpers, so a refresh, the browser's Back and a shared link restore it.
 */
import { ApiClientError, type ListState } from '@nocobase/app-client';
import {
  buildBoardColumns,
  canEditIssues,
  hasIssueFilters,
  readIssueFilters,
  readStoredIssueView,
  resolveIssueView,
  storeIssueView,
  useBoardMove,
  useBoardPages,
  useExecutorOptions,
  useStatusName,
  useUrlSearch,
  withIssueFilter,
  withIssueView,
  withoutIssueFilters,
  type IssueFilterKey,
  type IssueFilters,
} from '@nocobase/app-plugin-projects/client/issues';
import {
  usePlanLookup,
  useViewer,
} from '@nocobase/app-plugin-projects/client/kit';
import type { IssueListItem } from '@nocobase/app-plugin-projects/shared/issues';
import { FIXED_STATUSES } from '@nocobase/app-plugin-projects/shared/statuses';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import {
  BotIcon,
  Columns2Icon,
  KanbanIcon,
  ListIcon,
  LoaderCircle,
  SearchIcon,
  SlidersHorizontalIcon,
} from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { IssueCard } from '#components/issue-card';
import { IssueStatusBadge } from '#components/issue-table';
import {
  KanbanBoard,
  KanbanCard,
  KanbanCards,
  KanbanHeader,
  KanbanProvider,
  type KanbanMove,
} from '#components/kanban';
import { ListFeedback, ListFeedbackActions } from '#components/list-feedback';
import { Button } from '#components/ui/button';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '#components/ui/input-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '#components/ui/sheet';
import { ToggleGroup, ToggleGroupItem } from '#components/ui/toggle-group';
import { useIsMobile } from '#hooks/use-mobile';

import {
  issueHref,
  useIssueRow,
  useKanbanLabels,
  useStatusPresenter,
} from './presentation.js';
import { AgentQueueView } from './agent-queue.js';
import { IssueGroupedList } from './issue-grouped-list.js';
import { IssueSplitView } from './issue-split-view.js';
import { RouterAnchor } from './router-anchor.js';

const VIEWS = ['split', 'list', 'board', 'queue'] as const;
const ALL = '__all__';

/** What a read that has no rows to show says, by why it has none. */
function readState(
  error: unknown,
  hasData: boolean,
  isEmpty: boolean,
  filtered: boolean,
): ListState {
  if (error) {
    if (hasData) return 'refresh-failed';
    const status = error instanceof ApiClientError ? error.status : undefined;
    if (status === 401) return 'unauthenticated';
    if (status === 403) return 'forbidden';
    return 'failed';
  }
  if (!hasData) return 'loading';
  if (isEmpty) return filtered ? 'no-results' : 'empty';
  return 'ready';
}

interface FilterOption {
  readonly value: string;
  readonly label: string;
}

function FilterSelect({
  label,
  allLabel,
  value,
  options,
  onChange,
}: {
  readonly label: string;
  readonly allLabel: string;
  readonly value: string | undefined;
  readonly options: readonly FilterOption[];
  readonly onChange: (value: string | null) => void;
}): ReactElement {
  const items = [{ value: ALL, label: allLabel }, ...options];
  const selected =
    value && items.some((item) => item.value === value) ? value : ALL;
  return (
    <Select
      items={items}
      value={selected}
      onValueChange={(next: string | null) =>
        onChange(next === null || next === ALL ? null : next)
      }
    >
      <SelectTrigger aria-label={label} className='w-auto min-w-36'>
        <SelectValue />
      </SelectTrigger>
      <SelectContent className='w-auto max-w-[min(var(--container-sm),var(--available-width))] min-w-(--anchor-width)'>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export interface IssueWorkspaceProps {
  /** Where the chosen view is remembered (`issues`, `my-issues`). */
  readonly page: string;
  /** Filters the page always applies, such as My issues' viewer. */
  readonly fixedFilters?: IssueFilters;
  /** Filters the toolbar does not offer. */
  readonly hiddenFilters?: readonly IssueFilterKey[];
}

export function IssueWorkspace({
  page,
  fixedFilters,
  hiddenFilters = [],
}: IssueWorkspaceProps): ReactElement {
  const { t } = useTranslation();
  const {
    params,
    text,
    setText,
    scheduleSearch,
    updateParams,
    resetText,
    searchRef,
  } = useUrlSearch();
  const [storedView] = useState(() => readStoredIssueView(page));
  // My issues opens as the split view and the Issues page as the grouped table, as the demo does (the plugin's own
  // default is the board, which stays one click away).
  // On a phone the split view (a 320 px list beside a detail) and the agent queue do not fit: they fall back to the list,
  // whatever the URL or the remembered view says, and their toggles are not offered.
  const mobile = useIsMobile();
  const chosen = resolveIssueView(
    params,
    storedView,
    VIEWS,
    page === 'my-issues' ? 'split' : 'list',
  );
  const view =
    mobile && (chosen === 'split' || chosen === 'queue') ? 'list' : chosen;
  const ownFilters = readIssueFilters(params, view);
  const filters: IssueFilters = { ...ownFilters, ...fixedFilters };
  const filtered = hasIssueFilters(ownFilters);
  const lookup = usePlanLookup();
  const executors = useExecutorOptions();
  const shown = (key: IssueFilterKey) => !hiddenFilters.includes(key);
  const statusName = useStatusName();

  const setFilter = (key: IssueFilterKey, value: string | null) =>
    updateParams((current) => withIssueFilter(current, key, value));
  const clearFilters = () => {
    resetText();
    updateParams((current) => withoutIssueFilters(current));
  };

  const activeFilters = (
    ['statusKey', 'projectId', 'labelId', 'ownerUserId', 'executorId'] as const
  ).filter((key) => shown(key) && filters[key]).length;
  const filterControls = (
    <>
      {view === 'list' && shown('statusKey') ? (
        <FilterSelect
          label={t('issues.filters.status')}
          allLabel={t('issues.filters.allStatuses')}
          value={filters.statusKey}
          options={FIXED_STATUSES.map((status) => ({
            value: status.key,
            label: statusName(FIXED_STATUSES, status.key),
          }))}
          onChange={(value) => setFilter('statusKey', value)}
        />
      ) : null}
      {shown('projectId') ? (
        <FilterSelect
          label={t('issues.filters.project')}
          allLabel={t('issues.filters.allProjects')}
          value={filters.projectId}
          options={lookup.projects.map((project) => ({
            value: project.id,
            label: project.name,
          }))}
          onChange={(value) => setFilter('projectId', value)}
        />
      ) : null}
      {shown('labelId') ? (
        <FilterSelect
          label={t('issues.filters.issueLabel')}
          allLabel={t('issues.filters.allLabels')}
          value={filters.labelId}
          options={lookup.labels.map((label) => ({
            value: label.id,
            label: label.name,
          }))}
          onChange={(value) => setFilter('labelId', value)}
        />
      ) : null}
      {shown('ownerUserId') ? (
        <FilterSelect
          label={t('issues.filters.owner')}
          allLabel={t('issues.filters.anyOwner')}
          value={filters.ownerUserId}
          options={lookup.members.map((member) => ({
            value: member.userId,
            label: member.name,
          }))}
          onChange={(value) => setFilter('ownerUserId', value)}
        />
      ) : null}
      {shown('executorId') ? (
        <FilterSelect
          label={t('issues.filters.executor')}
          allLabel={t('issues.filters.anyExecutor')}
          value={filters.executorId}
          options={[
            ...executors.map((executor) => ({
              value: executor.id,
              label: executor.name,
            })),
            ...lookup.members.map((member) => ({
              value: member.userId,
              label: member.name,
            })),
          ]}
          onChange={(value) => setFilter('executorId', value)}
        />
      ) : null}
    </>
  );

  return (
    <div className='flex flex-col gap-4'>
      <div
        role='toolbar'
        aria-label={t('issues.filters.label')}
        className='flex flex-wrap items-center gap-2'
      >
        <InputGroup className='w-full sm:max-w-xs'>
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            ref={searchRef}
            value={text}
            aria-label={t('issues.search')}
            placeholder={t('issues.search')}
            onChange={(event) => {
              setText(event.target.value);
              scheduleSearch(event.target.value.trim());
            }}
          />
        </InputGroup>
        {mobile ? (
          <Sheet>
            <SheetTrigger
              render={
                <Button variant='outline' className='shrink-0'>
                  <SlidersHorizontalIcon data-icon='inline-start' />
                  {t('issues.filters.open')}
                  {activeFilters > 0 ? ` (${activeFilters})` : ''}
                </Button>
              }
            />
            <SheetContent
              side='bottom'
              className='max-h-[85vh] overflow-y-auto p-4'
            >
              <SheetHeader className='p-0'>
                <SheetTitle>{t('issues.filters.label')}</SheetTitle>
              </SheetHeader>
              <div className='flex flex-col gap-3 *:w-full [&_[data-slot=select-trigger]]:w-full'>
                {filterControls}
              </div>
            </SheetContent>
          </Sheet>
        ) : (
          filterControls
        )}
        <ToggleGroup
          variant='outline'
          spacing={0}
          aria-label={t('issues.view.label')}
          className='ml-auto'
          value={[view]}
          onValueChange={(values: string[]) => {
            const next = values[0];
            if (!next || next === view) return;
            storeIssueView(page, next);
            updateParams((current) => withIssueView(current, next));
          }}
        >
          {mobile ? null : (
            <ToggleGroupItem value='split' aria-label={t('issues.view.split')}>
              <Columns2Icon data-icon='inline-start' />
              {t('issues.view.split')}
            </ToggleGroupItem>
          )}
          <ToggleGroupItem value='list' aria-label={t('issues.view.list')}>
            <ListIcon data-icon='inline-start' />
            {t('issues.view.list')}
          </ToggleGroupItem>
          <ToggleGroupItem value='board' aria-label={t('issues.view.board')}>
            <KanbanIcon data-icon='inline-start' />
            {t('issues.view.board')}
          </ToggleGroupItem>
          {mobile ? null : (
            <ToggleGroupItem value='queue' aria-label={t('issues.view.queue')}>
              <BotIcon data-icon='inline-start' />
              {t('issues.view.queue')}
            </ToggleGroupItem>
          )}
        </ToggleGroup>
      </div>
      {view === 'split' ? (
        <IssueSplitView
          filters={filters}
          filtered={filtered}
          onClear={clearFilters}
        />
      ) : view === 'queue' ? (
        <AgentQueueView
          filters={{
            q: filters.q,
            projectId: filters.projectId,
            labelId: filters.labelId,
            ownerUserId: filters.ownerUserId,
            executorId: filters.executorId,
            involvesUserId: filters.involvesUserId,
          }}
        />
      ) : view === 'board' ? (
        <IssueBoardView
          filters={filters}
          filtered={filtered}
          onClear={clearFilters}
        />
      ) : (
        <IssueGroupedList
          filters={filters}
          filtered={filtered}
          onClear={clearFilters}
        />
      )}
    </div>
  );
}

interface BoardItem {
  readonly id: string;
  readonly column: string;
  readonly issue: IssueListItem;
}

function IssueBoardView({
  filters,
  filtered,
  onClear,
}: {
  readonly filters: IssueFilters;
  readonly filtered: boolean;
  readonly onClear: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const viewer = useViewer();
  const board = useBoardPages(filters, true);
  const move = useBoardMove();
  const toRow = useIssueRow();
  const status = useStatusPresenter();
  const labels = useKanbanLabels();
  const columns = buildBoardColumns(board.groups ?? [], move.overrides);
  const statuses = columns.map((column) => column.status);
  const items: BoardItem[] = columns.flatMap((column) =>
    column.issues.map((issue) => ({
      id: issue.id,
      column: column.status.key,
      issue,
    })),
  );
  const state = readState(
    board.query.error,
    board.groups !== undefined,
    false,
    filtered,
  );

  const onMove = (change: KanbanMove) => {
    if (change.fromColumn === change.toColumn) return;
    const item = items.find((entry) => entry.id === change.itemId);
    const to = statuses.find((entry) => entry.key === change.toColumn);
    if (item) move.drop(item.issue, to, statuses);
  };

  return (
    <div className='flex flex-col gap-3'>
      <ListFeedback state={state}>
        <div
          className='h-[calc(100svh-17rem)] min-h-96'
          aria-label={t('issues.board.label')}
          role='region'
        >
          <KanbanProvider
            columns={statuses.map((entry) => ({
              id: entry.key,
              name: status(entry.key, statuses).name,
            }))}
            items={items}
            disabled={!canEditIssues(viewer)}
            itemName={(item) => `${item.issue.identifier} ${item.issue.title}`}
            labels={labels}
            onMove={onMove}
          >
            {(column) => {
              const count = items.filter(
                (item) => item.column === column.id,
              ).length;
              const more = board.more[column.id];
              return (
                <KanbanBoard
                  key={column.id}
                  id={column.id}
                  aria-label={column.name}
                >
                  <KanbanHeader>
                    <IssueStatusBadge
                      status={status(column.id, statuses)}
                      size='sm'
                    />
                    <span
                      className='text-muted-foreground tabular-nums'
                      aria-label={t('issues.board.count', { count })}
                    >
                      {count}
                    </span>
                  </KanbanHeader>
                  <KanbanCards<BoardItem>
                    id={column.id}
                    footer={
                      more?.hasMore ? (
                        <Button
                          variant='ghost'
                          size='sm'
                          disabled={more.loading}
                          onClick={more.onLoadMore}
                        >
                          {more.loading ? (
                            <LoaderCircle
                              data-icon='inline-start'
                              className='animate-spin'
                            />
                          ) : null}
                          {t('issues.loadMore')}
                        </Button>
                      ) : null
                    }
                  >
                    {(item) => (
                      <KanbanCard key={item.id} id={item.id}>
                        <IssueCard
                          issue={{ ...toRow(item.issue), status: undefined }}
                          size='card'
                          appearance='plain'
                          href={issueHref(item.issue)}
                          link={RouterAnchor}
                          locale={locale}
                        />
                      </KanbanCard>
                    )}
                  </KanbanCards>
                </KanbanBoard>
              );
            }}
          </KanbanProvider>
        </div>
      </ListFeedback>
      <div className='flex justify-center empty:hidden'>
        <ListFeedbackActions
          state={state}
          onClear={onClear}
          onRetry={() => {
            board.query.refetch().catch(() => undefined);
          }}
          busy={board.query.isFetching}
        />
      </div>
    </div>
  );
}
