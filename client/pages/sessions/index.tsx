import {
  CHAT_MOBILE_QUERY,
  CHAT_PANEL_ATTRIBUTE,
  ChatPanelScope,
  useChatPageTracking,
  useChatPanel,
  useConversation,
  useConversationActions,
  useConversationList,
  type ChatPanelValue,
} from '@nocobase/app-plugin-agents/client/chat';
import {
  type ConversationLink,
  type ConversationListQuery,
  type ConversationSummary,
} from '@nocobase/app-plugin-agents/shared/conversations';
import { usePlanLookup } from '@nocobase/app-plugin-projects/client/kit';
import { useTranslation } from '@nocobase/i18n/client';
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  BotIcon,
  ChevronLeftIcon,
  FolderIcon,
  CircleDotIcon,
  ListTodoIcon,
  MoreHorizontalIcon,
  PlusIcon,
  SearchIcon,
  SparklesIcon,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { Link, useNavigate, useParams } from 'react-router';

import { Badge } from '#components/ui/badge';
import { Button } from '#components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '#components/ui/dropdown-menu';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '#components/ui/empty';
import { Input } from '#components/ui/input';
import { Skeleton } from '#components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '#components/ui/tabs';
import { cn } from 'cn';

import {
  useConversationUsage,
  useIssueSummaries,
  type IssueSummary,
} from '#hooks/use-session-panel';

import { AgentLine } from '#extensions/nocobase-agent-chat/agent-status';
import { useChatTranslation } from '#extensions/nocobase-agent-chat/chat-i18n';
import { ConversationView } from '#extensions/nocobase-agent-chat/conversation-view';
import { ConversationTitle } from '#extensions/nocobase-agent-chat/panel-header';
import { useMediaQuery } from '#extensions/nocobase-agent-chat/use-media-query';

import { useStatusPresenter } from '../issues/presentation.js';

const UNITS: readonly [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
  ['second', 1],
];

function formatRelativeTime(
  iso: string | null | undefined,
  locale?: string,
): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size || unit === 'second') {
      return format.format(Math.round(seconds / size), unit);
    }
  }
  return '';
}

function getSessionDateGroup(
  iso: string,
): 'today' | 'yesterday' | 'thisWeek' | 'older' {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'older';
  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const startOfYesterday = startOfToday - 86400000;
  const dayOfWeek = (now.getDay() + 6) % 7;
  const startOfWeek = startOfToday - dayOfWeek * 86400000;

  const t = d.getTime();
  if (t >= startOfToday) return 'today';
  if (t >= startOfYesterday) return 'yesterday';
  if (t >= startOfWeek) return 'thisWeek';
  return 'older';
}

interface IssueProgressStats {
  total: number;
  completed: number;
  inProgress: number;
  todo: number;
  completedPercent: number;
  inProgressPercent: number;
}

/** The ids of the issues a session is tied to. */
function issueIdsOf(links?: readonly ConversationLink[]): string[] {
  return (links ?? [])
    .filter((link) => link.kind === 'issue')
    .map((link) => link.targetId);
}

/** How far the issues a session is tied to have come, by their real status (not by reading the words of a label). */
function computeIssueProgress(
  links: readonly ConversationLink[] | undefined,
  summaries: ReadonlyMap<string, IssueSummary>,
): IssueProgressStats | null {
  const known = issueIdsOf(links)
    .map((id) => summaries.get(id))
    .filter((summary): summary is IssueSummary => summary !== undefined);
  if (known.length === 0) return null;
  const completed = known.filter((issue) =>
    ['done', 'cancelled'].includes(issue.statusKey),
  ).length;
  const inProgress = known.filter((issue) =>
    ['in_progress', 'in_review'].includes(issue.statusKey),
  ).length;
  const total = known.length;
  return {
    total,
    completed,
    inProgress,
    todo: Math.max(0, total - completed - inProgress),
    completedPercent: (completed / total) * 100,
    inProgressPercent: (inProgress / total) * 100,
  };
}

/** A conversation the agent is working in now. */
function isRunning(item: ConversationSummary): boolean {
  return item.execution?.status === 'running' || item.run?.status === 'running';
}

/** Messages the person has not read. */
function isUnread(item: ConversationSummary): boolean {
  return (item.lastSeq ?? 0) > (item.seenSeq ?? 0);
}

function finePointer(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: fine)').matches
  );
}

function noop(): void {}

/**
 * Route `/sessions` and `/sessions/:conversationId`:
 * My sessions 2-column workspace matching the NocoBase Studio layout.
 * Left column: session list with filter tabs, grouped by date, and linked issue status.
 * Right column: active conversation with chips, issue progress popup, actions and composer.
 */
export default function SessionsPage(): ReactElement {
  const { conversationId: routeId } = useParams();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const mobile = useMediaQuery(CHAT_MOBILE_QUERY);

  const [activeTab, setActiveTab] = useState<'all' | 'needsMe' | 'inProgress'>(
    'all',
  );
  const [showArchived, setShowArchived] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(
      () => setDebouncedSearch(searchText.trim()),
      300,
    );
    return () => window.clearTimeout(timer);
  }, [searchText]);

  const query: ConversationListQuery = useMemo(
    () => ({
      archived: showArchived,
      q: debouncedSearch || undefined,
      pageSize: 50,
    }),
    [showArchived, debouncedSearch],
  );

  const listQuery = useConversationList(query);
  const allItems = useMemo<ConversationSummary[]>(() => {
    return listQuery.data?.pages.flatMap((page) => [...page.items]) ?? [];
  }, [listQuery.data]);

  // The issues the listed sessions are tied to, read once for the whole list.
  const summaries = useIssueSummaries(
    allItems.flatMap((item) => issueIdsOf(item.links)),
  );
  const needsMeCount = allItems.filter((item) => item.needsYou != null).length;

  // Tab filtering happens here, in the browser, as it does in the demo: the address does not change.
  const filteredItems = useMemo<ConversationSummary[]>(() => {
    if (activeTab === 'needsMe') {
      return allItems.filter((item) => item.needsYou != null);
    }
    if (activeTab === 'inProgress') return allItems.filter(isRunning);
    return allItems;
  }, [allItems, activeTab]);

  // Group by date
  const groupedItems = useMemo(() => {
    const groups: Record<
      'today' | 'yesterday' | 'thisWeek' | 'older',
      ConversationSummary[]
    > = {
      today: [],
      yesterday: [],
      thisWeek: [],
      older: [],
    };

    for (const item of filteredItems) {
      const dateKey = item.lastMessageAt || item.updatedAt || item.createdAt;
      const group = getSessionDateGroup(dateKey);
      groups[group].push(item);
    }

    return groups;
  }, [filteredItems]);

  const activeId = routeId ?? null;

  const handleSelect = useCallback(
    (id: string | null) => {
      if (id === null) {
        void navigate('/sessions');
      } else {
        void navigate(`/sessions/${encodeURIComponent(id)}`);
      }
    },
    [navigate],
  );

  const currentLocale = i18n?.language;

  // Outer chat panel coordination
  const outer = useChatPanel();
  const tracking = useChatPageTracking();
  useEffect(() => tracking?.enter(), [tracking]);

  const focusRef = useRef<(() => void) | null>(null);
  const registerComposer = useCallback((focus: () => void) => {
    focusRef.current = focus;
    if (finePointer()) focus();
    return () => {
      if (focusRef.current === focus) focusRef.current = null;
    };
  }, []);
  const focusComposer = useCallback(() => focusRef.current?.(), []);

  const scoped = useMemo<ChatPanelValue>(
    () => ({
      ...outer,
      open: true,
      mode: 'docked',
      view: 'chat',
      conversationId: activeId,
      newAgentId: null,
      setMode: noop,
      setView: noop,
      selectConversation: handleSelect,
      pinned: [],
      clearPinned: noop,
      draft: null,
      composerRevision: 0,
      source: 'panel',
      resetSource: noop,
      registerComposer,
      focusComposer,
    }),
    [outer, activeId, handleSelect, registerComposer, focusComposer],
  );

  // Left sidebar visibility on mobile
  const showListOnMobile = !mobile || !activeId;
  const showDetailOnMobile = !mobile || Boolean(activeId);

  return (
    <ChatPanelScope value={scoped}>
      <div
        className='flex h-[calc(100vh-var(--header-height,3.5rem))] w-full overflow-hidden'
        {...{ [CHAT_PANEL_ATTRIBUTE]: '' }}
        data-testid='sessions-page'
      >
        {/* Left Column: Sessions List */}
        <aside
          className={cn(
            'flex flex-col border-r bg-sidebar/20 h-full shrink-0 transition-all',
            'w-full md:w-80 lg:w-96',
            showListOnMobile ? 'flex' : 'hidden md:flex',
          )}
          aria-label={t('sessions.title')}
        >
          {/* Header */}
          <div className='flex items-center justify-between gap-2 p-3 border-b'>
            <div className='flex items-center gap-2 min-w-0'>
              <SparklesIcon className='size-5 text-primary shrink-0' />
              <h1 className='text-base font-semibold truncate'>
                {t('sessions.title')}
              </h1>
            </div>
            <div className='flex items-center gap-1'>
              <Button
                variant={showArchived ? 'secondary' : 'ghost'}
                size='icon-sm'
                title={t('sessions.tabs.archived')}
                aria-label={t('sessions.tabs.archived')}
                onClick={() => setShowArchived((v) => !v)}
              >
                {showArchived ? (
                  <ArchiveRestoreIcon className='size-4' />
                ) : (
                  <ArchiveIcon className='size-4' />
                )}
              </Button>
              <Button
                variant='default'
                size='icon-sm'
                title={t('sessions.newSession')}
                aria-label={t('sessions.newSession')}
                onClick={() => handleSelect(null)}
              >
                <PlusIcon className='size-4' />
              </Button>
            </div>
          </div>

          {/* Search bar */}
          <div className='p-3 pb-2'>
            <div className='relative'>
              <SearchIcon className='absolute left-2.5 top-2.5 size-4 text-muted-foreground' />
              <Input
                type='search'
                placeholder={t('sessions.search')}
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className='pl-8 h-9 text-sm'
              />
            </div>
          </div>

          {/* Filter tabs */}
          <div className='px-3 pb-2'>
            <Tabs
              value={activeTab}
              onValueChange={(v) =>
                setActiveTab(v as 'all' | 'needsMe' | 'inProgress')
              }
              className='w-full'
            >
              <TabsList className='grid grid-cols-3 h-8 w-full p-0.5 bg-muted/60'>
                <TabsTrigger value='all' className='text-xs py-1 px-1.5'>
                  {t('sessions.tabs.all')}
                </TabsTrigger>
                <TabsTrigger value='needsMe' className='text-xs py-1 px-1.5'>
                  {t('sessions.tabs.needsMe')}
                  {needsMeCount > 0 ? (
                    <span className='tabular-nums text-(--status-warning)'>
                      {needsMeCount}
                    </span>
                  ) : null}
                </TabsTrigger>
                <TabsTrigger value='inProgress' className='text-xs py-1 px-1.5'>
                  {t('sessions.tabs.inProgress')}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* Session List body */}
          <div className='flex-1 overflow-y-auto px-2 py-1 space-y-4'>
            {listQuery.isPending && !listQuery.data ? (
              <div className='space-y-3 p-2'>
                {[0, 1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className='h-16 w-full rounded-lg' />
                ))}
              </div>
            ) : filteredItems.length === 0 ? (
              <div className='p-6 text-center text-sm text-muted-foreground'>
                {showArchived
                  ? t('sessions.empty.archived')
                  : activeTab === 'needsMe'
                    ? t('sessions.empty.needsMe')
                    : activeTab === 'inProgress'
                      ? t('sessions.empty.inProgress')
                      : t('sessions.empty.all')}
              </div>
            ) : (
              (['today', 'yesterday', 'thisWeek', 'older'] as const).map(
                (groupKey) => {
                  const items = groupedItems[groupKey];
                  if (items.length === 0) return null;

                  return (
                    <div key={groupKey} className='space-y-1.5'>
                      <div className='px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground'>
                        {t(`sessions.groups.${groupKey}`)}
                      </div>
                      <div className='space-y-1'>
                        {items.map((item) => {
                          const isActive = item.id === activeId;
                          const progress = computeIssueProgress(
                            item.links,
                            summaries,
                          );
                          const running = isRunning(item);
                          const unread = isUnread(item) && !isActive;

                          return (
                            <button
                              key={item.id}
                              type='button'
                              onClick={() => handleSelect(item.id)}
                              className={cn(
                                'w-full text-left rounded-lg p-2.5 transition-colors flex flex-col gap-1.5',
                                isActive
                                  ? 'bg-accent text-accent-foreground shadow-xs'
                                  : 'hover:bg-muted/70 text-foreground',
                              )}
                            >
                              <div className='flex items-start justify-between gap-2 min-w-0'>
                                <span className='text-sm font-medium line-clamp-1 break-all'>
                                  {item.title?.trim() || t('sessions.untitled')}
                                </span>
                                {unread ? (
                                  <span
                                    role='img'
                                    aria-label={t('sessions.unread')}
                                    className='mt-1.5 size-2 shrink-0 rounded-full bg-primary'
                                  />
                                ) : null}
                                <span className='text-xs text-muted-foreground shrink-0'>
                                  {formatRelativeTime(
                                    item.lastMessageAt || item.updatedAt,
                                    currentLocale,
                                  )}
                                </span>
                              </div>

                              <div className='flex items-center gap-1.5 flex-wrap text-xs'>
                                {item.needsYou && (
                                  <Badge
                                    variant='outline'
                                    title={item.needsYou.text ?? undefined}
                                    className='border-(--status-warning)/30 bg-(--status-warning-background) text-(--status-warning) text-[10px] px-1.5 py-0'
                                  >
                                    {t('sessions.needsYou')}
                                  </Badge>
                                )}

                                {running && (
                                  <span className='inline-flex items-center gap-1 text-[11px] text-primary animate-pulse'>
                                    <CircleDotIcon className='size-3 animate-spin' />
                                    <span>{t('sessions.tabs.inProgress')}</span>
                                  </span>
                                )}

                                {progress && (
                                  <span className='text-[11px] text-muted-foreground inline-flex items-center gap-1'>
                                    <ListTodoIcon className='size-3' />
                                    {t('sessions.issues.progress', {
                                      completed: progress.completed,
                                      total: progress.total,
                                    })}
                                  </span>
                                )}
                              </div>

                              {progress && (
                                <div className='flex h-1 w-full overflow-hidden rounded-full bg-muted/60 mt-0.5'>
                                  {progress.completedPercent > 0 && (
                                    <div
                                      className='bg-(--status-success) transition-all'
                                      style={{
                                        width: `${progress.completedPercent}%`,
                                      }}
                                    />
                                  )}
                                  {progress.inProgressPercent > 0 && (
                                    <div
                                      className='bg-(--status-warning) transition-all'
                                      style={{
                                        width: `${progress.inProgressPercent}%`,
                                      }}
                                    />
                                  )}
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                },
              )
            )}
          </div>
        </aside>

        {/* Right Column: Active Conversation */}
        <main
          className={cn(
            'flex-1 flex-col h-full min-w-0 bg-background overflow-hidden',
            showDetailOnMobile ? 'flex' : 'hidden md:flex',
          )}
        >
          {activeId ? (
            <SessionDetailView
              conversationId={activeId}
              onBack={() => handleSelect(null)}
              mobile={mobile}
            />
          ) : (
            <div className='flex flex-col h-full'>
              <header className='flex items-center justify-between p-4 border-b'>
                <div className='flex items-center gap-2'>
                  <SparklesIcon className='size-5 text-primary' />
                  <span className='font-semibold text-base'>
                    {t('sessions.newSession')}
                  </span>
                </div>
              </header>
              <div className='flex-1 min-h-0 flex flex-col justify-center items-center p-6'>
                <Empty className='max-w-md border-0'>
                  <EmptyHeader>
                    <EmptyMedia variant='icon'>
                      <SparklesIcon className='size-10 text-primary' />
                    </EmptyMedia>
                    <EmptyTitle>{t('sessions.title')}</EmptyTitle>
                    <EmptyDescription>
                      {allItems.length > 0
                        ? t('sessions.selectConversation')
                        : t('sessions.empty.all')}
                    </EmptyDescription>
                  </EmptyHeader>
                  <EmptyContent>
                    <ConversationView
                      conversationId={null}
                      variant='page'
                      className='w-full'
                    />
                  </EmptyContent>
                </Empty>
              </div>
            </div>
          )}
        </main>
      </div>
    </ChatPanelScope>
  );
}

function SessionDetailView({
  conversationId,
  onBack,
  mobile,
}: {
  readonly conversationId: string;
  readonly onBack: () => void;
  readonly mobile: boolean;
}): ReactElement {
  // `chat.*` keys are the chat plugin's; this page's own `sessions.*` keys are the application's.
  const { t: chat } = useChatTranslation();
  const detail = useConversation(conversationId);
  const conversation = detail.data ?? null;
  const actions = useConversationActions();
  const lookup = usePlanLookup();
  const summaries = useIssueSummaries(issueIdsOf(conversation?.links));
  const project = conversation?.projectId
    ? lookup.projects.find((entry) => entry.id === conversation.projectId)
    : undefined;

  const shownTitle = conversation
    ? conversation.title?.trim() || chat('chat.untitled')
    : '';

  const progress = useMemo(
    () => computeIssueProgress(conversation?.links, summaries),
    [conversation?.links, summaries],
  );

  return (
    <div
      className='flex h-full min-h-0 flex-col'
      data-conversation={conversationId}
    >
      <header className='flex shrink-0 items-center justify-between gap-3 border-b bg-card/40 px-4 py-2.5'>
        <div className='flex min-w-0 flex-1 items-center gap-2'>
          {mobile && (
            <Button
              variant='ghost'
              size='icon-sm'
              onClick={onBack}
              aria-label={chat('chat.history.title')}
              className='shrink-0'
            >
              <ChevronLeftIcon className='size-5' />
            </Button>
          )}

          <div className='flex min-w-0 flex-1 flex-col gap-0.5'>
            <div className='flex min-w-0 items-center gap-2'>
              <ConversationTitle
                conversation={conversation}
                shown={shownTitle}
                level={1}
                className='truncate text-base font-semibold'
              />
            </div>
            {conversation ? (
              <div className='flex flex-wrap items-center gap-x-3 gap-y-1'>
                <AgentLine conversation={conversation} />
                {project ? (
                  <Link
                    to={`/projects/${encodeURIComponent(project.id)}`}
                    className='inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground'
                  >
                    <FolderIcon className='size-3' aria-hidden='true' />
                    {project.name}
                  </Link>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        {conversation && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant='ghost'
                  size='icon-sm'
                  aria-label={chat('chat.more')}
                >
                  <MoreHorizontalIcon className='size-4' />
                </Button>
              }
            />
            <DropdownMenuContent align='end' className='w-44'>
              <DropdownMenuGroup>
                <DropdownMenuItem
                  onClick={() => {
                    const willArchive = !conversation.archivedAt;
                    actions.archive.mutate({
                      id: conversation.id,
                      archived: willArchive,
                    });
                    if (willArchive) onBack();
                  }}
                >
                  {conversation.archivedAt ? (
                    <>
                      <ArchiveRestoreIcon className='mr-2 size-4' />
                      {chat('chat.unarchive')}
                    </>
                  ) : (
                    <>
                      <ArchiveIcon className='mr-2 size-4' />
                      {chat('chat.archive')}
                    </>
                  )}
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </header>

      <div className='flex min-h-0 flex-1'>
        <ConversationView
          conversationId={conversationId}
          variant='page'
          className='min-w-0 flex-1'
        />
        {conversation && !mobile ? (
          <SessionSidePanel
            conversation={conversation}
            summaries={summaries}
            progress={progress}
            projectName={project?.name ?? null}
          />
        ) : null}
      </div>
    </div>
  );
}

function Fact({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div className='flex items-baseline justify-between gap-3 text-xs'>
      <dt className='text-muted-foreground'>{label}</dt>
      <dd className='min-w-0 truncate text-right font-medium'>{children}</dd>
    </div>
  );
}

const numberOf = (value: number, locale?: string): string =>
  new Intl.NumberFormat(locale).format(value);

/** Beside the conversation, from `xl` up: the issues it is tied to, the session's facts and what its runs used. */
function SessionSidePanel({
  conversation,
  summaries,
  progress,
  projectName,
}: {
  readonly conversation: ConversationSummary;
  readonly summaries: ReadonlyMap<string, IssueSummary>;
  readonly progress: IssueProgressStats | null;
  readonly projectName: string | null;
}): ReactElement {
  const { t, i18n } = useTranslation();
  const status = useStatusPresenter();
  const usage = useConversationUsage(conversation.id);
  const locale = i18n?.language;
  const issues = issueIdsOf(conversation.links)
    .map((id) => summaries.get(id))
    .filter((issue): issue is IssueSummary => issue !== undefined);
  const used = usage.data;
  const running = isRunning(conversation);

  return (
    <aside
      aria-label={t('sessions.panel.label')}
      className='hidden w-72 shrink-0 flex-col gap-4 overflow-y-auto border-l bg-sidebar/20 p-3 xl:flex'
    >
      <section aria-label={t('sessions.panel.issues')} className='space-y-2'>
        <div className='flex items-center justify-between'>
          <h2 className='text-xs font-semibold uppercase tracking-wider text-muted-foreground'>
            {t('sessions.panel.issues')}
          </h2>
          {progress ? (
            <span className='text-xs text-muted-foreground tabular-nums'>
              {t('sessions.issues.progress', {
                completed: progress.completed,
                total: progress.total,
              })}
            </span>
          ) : null}
        </div>
        {issues.length === 0 ? (
          <p className='text-xs text-muted-foreground'>
            {t('sessions.panel.noIssues')}
          </p>
        ) : (
          <ul className='space-y-1'>
            {issues.map((issue) => (
              <li key={issue.id}>
                <Link
                  to={`/issues/${encodeURIComponent(issue.identifier)}`}
                  className='flex flex-col gap-0.5 rounded-md p-1.5 text-xs transition-colors hover:bg-muted'
                >
                  <span className='flex items-center justify-between gap-2'>
                    <span className='font-mono font-medium text-primary'>
                      {issue.identifier}
                    </span>
                    <Badge
                      variant='outline'
                      className='px-1.5 py-0 text-[10px]'
                    >
                      {status(issue.statusKey).name}
                    </Badge>
                  </span>
                  <span className='truncate text-foreground'>
                    {issue.title}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label={t('sessions.panel.session')} className='space-y-2'>
        <h2 className='text-xs font-semibold uppercase tracking-wider text-muted-foreground'>
          {t('sessions.panel.session')}
        </h2>
        <dl className='space-y-1.5'>
          <Fact label={t('sessions.panel.agent')}>
            <span className='inline-flex items-center gap-1'>
              <BotIcon className='size-3' aria-hidden='true' />
              {conversation.agent.name}
            </span>
          </Fact>
          {projectName ? (
            <Fact label={t('sessions.panel.project')}>{projectName}</Fact>
          ) : null}
          <Fact label={t('sessions.panel.state')}>
            {running
              ? t('sessions.tabs.inProgress')
              : conversation.needsYou
                ? t('sessions.needsYou')
                : t('sessions.panel.idle')}
          </Fact>
        </dl>
      </section>

      <section aria-label={t('sessions.panel.usage')} className='space-y-2'>
        <h2 className='text-xs font-semibold uppercase tracking-wider text-muted-foreground'>
          {t('sessions.panel.usage')}
        </h2>
        {used ? (
          <dl className='space-y-1.5'>
            <Fact label={t('sessions.panel.input')}>
              {numberOf(used.inputTokens, locale)}
            </Fact>
            <Fact label={t('sessions.panel.cacheRead')}>
              {numberOf(used.cacheReadTokens, locale)}
            </Fact>
            <Fact label={t('sessions.panel.output')}>
              {numberOf(used.outputTokens, locale)}
            </Fact>
            <Fact label={t('sessions.panel.cost')}>
              {used.costUsd === null
                ? t('sessions.panel.noCost')
                : `$${used.costUsd.toFixed(2)}`}
            </Fact>
          </dl>
        ) : (
          <p className='text-xs text-muted-foreground'>
            {usage.isError
              ? t('sessions.panel.usageFailed')
              : t('sessions.panel.loading')}
          </p>
        )}
      </section>
    </aside>
  );
}
