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
import { useTranslation } from '@nocobase/i18n/client';
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  ChevronLeftIcon,
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '#components/ui/popover';
import { Skeleton } from '#components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '#components/ui/tabs';
import { cn } from 'cn';

import { AgentLine } from '#extensions/nocobase-agent-chat/agent-status';
import { useChatTranslation } from '#extensions/nocobase-agent-chat/chat-i18n';
import { ConversationView } from '#extensions/nocobase-agent-chat/conversation-view';
import { ConversationTitle } from '#extensions/nocobase-agent-chat/panel-header';
import { useMediaQuery } from '#extensions/nocobase-agent-chat/use-media-query';

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

function computeIssueProgress(
  links?: readonly ConversationLink[],
): IssueProgressStats | null {
  if (!links || links.length === 0) return null;
  const issueLinks = links.filter(
    (l) => l.kind === 'issue' || l.view?.key != null || l.view?.title,
  );
  if (issueLinks.length === 0) return null;

  let completed = 0;
  let inProgress = 0;

  for (const l of issueLinks) {
    const s = l.view?.status?.toLowerCase() ?? '';
    if (
      s.includes('done') ||
      s.includes('closed') ||
      s.includes('resolved') ||
      s.includes('hoàn thành')
    ) {
      completed++;
    } else if (
      s.includes('progress') ||
      s.includes('doing') ||
      s.includes('review') ||
      s.includes('đang')
    ) {
      inProgress++;
    }
  }

  const total = issueLinks.length;
  const todo = Math.max(0, total - completed - inProgress);
  const completedPercent = total > 0 ? (completed / total) * 100 : 0;
  const inProgressPercent = total > 0 ? (inProgress / total) * 100 : 0;

  return {
    total,
    completed,
    inProgress,
    todo,
    completedPercent,
    inProgressPercent,
  };
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

  // Tab filtering
  const filteredItems = useMemo<ConversationSummary[]>(() => {
    if (activeTab === 'needsMe') {
      return allItems.filter((item) => item.needsYou != null);
    }
    if (activeTab === 'inProgress') {
      return allItems.filter(
        (item) =>
          item.run?.status === 'running' ||
          item.execution?.status === 'running' ||
          item.links?.some((l) =>
            l.view?.status?.toLowerCase().includes('progress'),
          ),
      );
    }
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
                          const progress = computeIssueProgress(item.links);
                          const isRunning =
                            item.run?.status === 'running' ||
                            item.execution?.status === 'running';

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
                                    className='border-(--status-warning)/30 bg-(--status-warning-background) text-(--status-warning) text-[10px] px-1.5 py-0'
                                  >
                                    {t('sessions.needsYou')}
                                  </Badge>
                                )}

                                {isRunning && (
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
                      {t('sessions.empty.all')}
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
  const { t } = useChatTranslation();
  const detail = useConversation(conversationId);
  const conversation = detail.data ?? null;
  const actions = useConversationActions();

  const shownTitle = conversation
    ? conversation.title?.trim() || t('chat.untitled')
    : '';

  const progress = useMemo(
    () => computeIssueProgress(conversation?.links),
    [conversation?.links],
  );

  return (
    <div
      className='flex flex-col h-full min-h-0'
      data-conversation={conversationId}
    >
      {/* Detail Header Bar */}
      <header className='flex shrink-0 items-center justify-between gap-3 px-4 py-2.5 border-b bg-card/40'>
        <div className='flex items-center gap-2 min-w-0 flex-1'>
          {mobile && (
            <Button
              variant='ghost'
              size='icon-sm'
              onClick={onBack}
              aria-label={t('chat.history.title')}
              className='shrink-0'
            >
              <ChevronLeftIcon className='size-5' />
            </Button>
          )}

          <div className='flex min-w-0 flex-1 flex-col gap-0.5'>
            <div className='flex items-center gap-2 min-w-0'>
              <ConversationTitle
                conversation={conversation}
                shown={shownTitle}
                level={1}
                className='text-base font-semibold truncate'
              />
            </div>
            {conversation ? <AgentLine conversation={conversation} /> : null}
          </div>
        </div>

        {/* Chips and status popover */}
        <div className='flex items-center gap-2 shrink-0'>
          {/* Linked Issues Progress Popover */}
          {progress && conversation?.links && (
            <Popover>
              <PopoverTrigger
                render={
                  <Button
                    variant='outline'
                    size='sm'
                    className='h-8 gap-1.5 px-2.5 text-xs font-normal'
                  >
                    <ListTodoIcon className='size-3.5 text-primary' />
                    <span>
                      {t('sessions.issues.progress', {
                        completed: progress.completed,
                        total: progress.total,
                      })}
                    </span>
                    <span className='inline-block w-12 h-1.5 rounded-full overflow-hidden bg-muted ml-1'>
                      <span
                        className='h-full bg-(--status-success) block'
                        style={{ width: `${progress.completedPercent}%` }}
                      />
                    </span>
                  </Button>
                }
              />
              <PopoverContent align='end' className='w-80 p-3'>
                <div className='space-y-2'>
                  <div className='flex items-center justify-between border-b pb-2'>
                    <span className='text-xs font-semibold uppercase tracking-wider text-muted-foreground'>
                      {t('sessions.issues.progress', {
                        completed: progress.completed,
                        total: progress.total,
                      })}
                    </span>
                    <span className='text-xs text-muted-foreground'>
                      {Math.round(progress.completedPercent)}%
                    </span>
                  </div>

                  <div className='flex h-2 w-full overflow-hidden rounded-full bg-muted'>
                    {progress.completedPercent > 0 && (
                      <div
                        className='bg-(--status-success)'
                        style={{ width: `${progress.completedPercent}%` }}
                      />
                    )}
                    {progress.inProgressPercent > 0 && (
                      <div
                        className='bg-(--status-warning)'
                        style={{ width: `${progress.inProgressPercent}%` }}
                      />
                    )}
                  </div>

                  <div className='space-y-1.5 max-h-60 overflow-y-auto pt-1'>
                    {conversation.links.map((link) => {
                      const v = link.view;
                      if (!v) return null;
                      return (
                        <Link
                          key={link.id}
                          to={v.url || `/issues/${link.targetId}`}
                          className='flex items-center justify-between gap-2 p-1.5 rounded-md hover:bg-muted text-xs transition-colors'
                        >
                          <div className='flex items-center gap-1.5 min-w-0'>
                            <span className='font-mono font-medium text-primary shrink-0'>
                              {v.key || link.targetId.slice(0, 8)}
                            </span>
                            <span className='truncate text-foreground'>
                              {v.title}
                            </span>
                          </div>
                          <Badge
                            variant='outline'
                            className='text-[10px] px-1.5 py-0 shrink-0 capitalize'
                          >
                            {v.status || 'open'}
                          </Badge>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          )}

          {/* Action menu */}
          {conversation && (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant='ghost'
                    size='icon-sm'
                    aria-label={t('chat.more')}
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
                        <ArchiveRestoreIcon className='size-4 mr-2' />
                        {t('chat.unarchive')}
                      </>
                    ) : (
                      <>
                        <ArchiveIcon className='size-4 mr-2' />
                        {t('chat.archive')}
                      </>
                    )}
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </header>

      {/* Conversation Messages and Composer */}
      <ConversationView
        conversationId={conversationId}
        variant='page'
        className='flex-1 min-h-0'
      />
    </div>
  );
}
