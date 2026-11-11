/**
 * `/project-memory`: what agents wrote down in each repository's `.nb-studio/memory/` (owner feedback, project
 * decisions, references), as the default branch holds it. Read-only: memories change through pull requests.
 */
import { useSearchParams } from 'react-router';
import { useTranslation } from '@nocobase/i18n/client';
import { BrainIcon, ExternalLinkIcon, SearchIcon } from 'lucide-react';
import { useMemo, useState, type ReactElement } from 'react';

import { Loading } from '#components/loading';
import { MarkdownView } from '#components/markdown-view';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { Badge } from '#components/ui/badge';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '#components/ui/empty';
import { Input } from '#components/ui/input';
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
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '#components/ui/sheet';
import { Tabs, TabsList, TabsTrigger } from '#components/ui/tabs';
import {
  MEMORY_TYPES,
  useMemoryFile,
  useProjectMemoryList,
  useRepositoryMemory,
  type MemorySummary,
  type MemoryType,
} from '#hooks/use-project-memory';

type Tab = 'all' | MemoryType;

const UNITS: readonly (readonly [Intl.RelativeTimeFormatUnit, number])[] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
];

/** "3 minutes ago" in `locale`; "now" under a minute. */
function relativeTime(
  at: string,
  locale: string,
  now: number = Date.now(),
): string {
  const seconds = Math.round((new Date(at).getTime() - now) / 1000);
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  for (const [unit, size] of UNITS)
    if (Math.abs(seconds) >= size)
      return format.format(Math.round(seconds / size), unit);
  return format.format(0, 'second');
}

function Picker({
  id,
  label,
  items,
  value,
  onChange,
}: {
  readonly id: string;
  readonly label: string;
  readonly items: readonly { readonly value: string; readonly label: string }[];
  readonly value: string | null;
  readonly onChange: (value: string) => void;
}): ReactElement {
  return (
    <div className='flex min-w-0 flex-col gap-1.5'>
      <label htmlFor={id} className='text-xs font-medium text-muted-foreground'>
        {label}
      </label>
      <Select
        items={[...items]}
        value={value}
        onValueChange={(next: string | null) => next && onChange(next)}
      >
        <SelectTrigger id={id} className='w-full min-w-48'>
          <SelectValue>
            {(current: string | null) =>
              items.find((item) => item.value === current)?.label ?? ''
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function MemoryCard({
  memory,
  onOpen,
}: {
  readonly memory: MemorySummary;
  readonly onOpen: () => void;
}): ReactElement {
  const { t, i18n } = useTranslation();
  return (
    <li>
      <button
        type='button'
        onClick={onOpen}
        className='flex w-full flex-col gap-2 rounded-lg border bg-card p-4 text-left transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none'
      >
        <span className='flex items-start justify-between gap-3'>
          <span className='font-medium'>{memory.name}</span>
          <span className='flex shrink-0 items-center gap-1.5'>
            {memory.oversize ? (
              <Badge variant='destructive'>{t('projectMemory.oversize')}</Badge>
            ) : null}
            <Badge variant='secondary'>
              {memory.type
                ? t(`projectMemory.types.${memory.type}`)
                : t('projectMemory.types.unknown')}
            </Badge>
          </span>
        </span>
        {memory.description ? (
          <span className='text-sm text-muted-foreground'>
            {memory.description}
          </span>
        ) : null}
        <span className='text-xs text-muted-foreground'>
          {memory.modified ? (
            <time dateTime={memory.modified}>
              {relativeTime(memory.modified, i18n.language)}
            </time>
          ) : null}
          {memory.modified ? ' · ' : null}
          <span className='font-mono'>{memory.slug}</span>
        </span>
      </button>
    </li>
  );
}

function MemoryDrawer({
  projectId,
  repoId,
  memory,
  onClose,
}: {
  readonly projectId: string;
  readonly repoId: string;
  readonly memory: MemorySummary | null;
  readonly onClose: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const file = useMemoryFile(projectId, repoId, memory?.path ?? null);
  return (
    <Sheet
      open={memory !== null}
      onOpenChange={(open: boolean) => (open ? undefined : onClose())}
    >
      <SheetContent className='w-full overflow-y-auto sm:max-w-xl'>
        <SheetHeader>
          <SheetTitle>{memory?.name ?? ''}</SheetTitle>
          <SheetDescription>{memory?.description ?? ''}</SheetDescription>
        </SheetHeader>
        <div className='flex flex-col gap-4 px-4 pb-6'>
          {file.error ? (
            <p role='alert' className='text-sm text-destructive'>
              {t('projectMemory.fileFailed')}
            </p>
          ) : file.data ? (
            <MarkdownView content={file.data.body} />
          ) : (
            <Loading />
          )}
          {memory ? (
            <a
              href={memory.webUrl}
              target='_blank'
              rel='noreferrer'
              className='inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline'
            >
              {t('projectMemory.viewFile')}
              <ExternalLinkIcon aria-hidden='true' className='size-3.5' />
            </a>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default function ProjectMemoryPage(): ReactElement {
  const { t } = useTranslation();
  // A project's page links here with its id.
  const [params] = useSearchParams();
  return (
    <PageContainer>
      <PageHeader
        title={t('projectMemory.title')}
        description={t('projectMemory.description')}
      />
      <ProjectMemoryView initialProjectId={params.get('project')} />
    </PageContainer>
  );
}

/**
 * The memories of a project's repositories. `fixedProjectId` pins it to one project, as a project's own Memory tab does
 * (no project picker); otherwise the person picks among the projects they see.
 */
export function ProjectMemoryView({
  initialProjectId = null,
  fixedProjectId,
}: {
  readonly initialProjectId?: string | null;
  readonly fixedProjectId?: string;
}): ReactElement {
  const { t, i18n } = useTranslation();
  const list = useProjectMemoryList();
  const [projectChoice, setProjectChoice] = useState<string | null>(
    fixedProjectId ?? initialProjectId,
  );
  const [repoChoice, setRepoChoice] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('all');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<MemorySummary | null>(null);

  const projects = list.data ?? [];
  const project =
    projects.find((item) => item.project.id === projectChoice) ??
    projects[0] ??
    null;
  const repo =
    project?.repos.find((item) => item.id === repoChoice) ??
    project?.repos[0] ??
    null;
  const memory = useRepositoryMemory(
    project?.project.id ?? null,
    repo?.id ?? null,
  );

  const counts = useMemo(() => {
    const all = memory.data?.memories ?? [];
    return {
      all: all.length,
      feedback: all.filter((item) => item.type === 'feedback').length,
      project: all.filter((item) => item.type === 'project').length,
      reference: all.filter((item) => item.type === 'reference').length,
    };
  }, [memory.data]);
  const shown = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase(i18n.language);
    return (memory.data?.memories ?? []).filter(
      (item) =>
        (tab === 'all' || item.type === tab) &&
        (!needle ||
          `${item.name} ${item.description} ${item.slug}`
            .toLocaleLowerCase(i18n.language)
            .includes(needle)),
    );
  }, [memory.data, tab, search, i18n.language]);

  let body: ReactElement;
  if (list.error)
    body = (
      <p role='alert' className='text-sm text-destructive'>
        {t('projectMemory.loadFailed')}
      </p>
    );
  else if (!list.data) body = <Loading />;
  else if (!project || !repo)
    body = (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant='icon'>
            <BrainIcon />
          </EmptyMedia>
          <EmptyTitle>{t('projectMemory.noRepositories')}</EmptyTitle>
          <EmptyDescription>
            {t('projectMemory.noRepositoriesHint')}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  else
    body = (
      <div className='flex flex-col gap-4'>
        <div className='grid gap-3 sm:grid-cols-2 lg:max-w-2xl'>
          {fixedProjectId ? null : (
            <Picker
              id='project-memory-project'
              label={t('projectMemory.project')}
              items={projects.map((item) => ({
                value: item.project.id,
                label: item.project.name,
              }))}
              value={project.project.id}
              onChange={(value) => {
                setProjectChoice(value);
                setRepoChoice(null);
              }}
            />
          )}
          <Picker
            id='project-memory-repository'
            label={t('projectMemory.repository')}
            items={project.repos.map((item) => ({
              value: item.id,
              label: item.name,
            }))}
            value={repo.id}
            onChange={setRepoChoice}
          />
        </div>
        {memory.error ? (
          <p role='alert' className='text-sm text-destructive'>
            {t('projectMemory.loadFailed')}
          </p>
        ) : !memory.data ? (
          <Loading />
        ) : (
          <>
            <p className='flex flex-wrap items-center gap-x-1.5 text-sm text-muted-foreground'>
              {memory.data.ref ? (
                <span>{t('projectMemory.from', { ref: memory.data.ref })}</span>
              ) : null}
              {memory.data.checkedAt ? (
                <span>
                  ·{' '}
                  {t('projectMemory.checked', {
                    time: relativeTime(memory.data.checkedAt, i18n.language),
                  })}
                </span>
              ) : null}
              <span>
                · {memory.data.memories.length} / {memory.data.limit}
              </span>
              <span>
                ·{' '}
                <a
                  href={memory.data.webUrl}
                  target='_blank'
                  rel='noreferrer'
                  className='inline-flex items-center gap-1 hover:underline'
                >
                  {t('projectMemory.viewRepository')}
                  <ExternalLinkIcon aria-hidden='true' className='size-3.5' />
                </a>
              </span>
            </p>
            {memory.data.unavailable ? (
              <p role='alert' className='text-sm text-destructive'>
                {t(`projectMemory.unavailable.${memory.data.unavailable}`)}
              </p>
            ) : null}
            {memory.data.total > memory.data.limit ? (
              <p className='text-sm text-muted-foreground'>
                {t('projectMemory.overLimit', {
                  total: memory.data.total,
                  limit: memory.data.limit,
                })}
              </p>
            ) : null}
            <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
              <Tabs value={tab} onValueChange={(value: Tab) => setTab(value)}>
                <TabsList
                  variant='line'
                  aria-label={t('projectMemory.typesLabel')}
                >
                  {(['all', ...MEMORY_TYPES] as const).map((key) => (
                    <TabsTrigger key={key} value={key}>
                      {t(`projectMemory.tabs.${key}`)} {counts[key]}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
              <div className='relative sm:w-64'>
                <SearchIcon
                  aria-hidden='true'
                  className='pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground'
                />
                <Input
                  type='search'
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={t('projectMemory.search')}
                  aria-label={t('projectMemory.search')}
                  className='pl-8'
                />
              </div>
            </div>
            {shown.length === 0 ? (
              <p className='text-sm text-muted-foreground'>
                {memory.data.memories.length === 0
                  ? t('projectMemory.empty')
                  : t('projectMemory.noMatch')}
              </p>
            ) : (
              <ul
                className='grid gap-3 md:grid-cols-2'
                aria-label={t('projectMemory.title')}
              >
                {shown.map((item) => (
                  <MemoryCard
                    key={item.path}
                    memory={item}
                    onOpen={() => setOpen(item)}
                  />
                ))}
              </ul>
            )}
            <MemoryDrawer
              projectId={project.project.id}
              repoId={repo.id}
              memory={open}
              onClose={() => setOpen(null)}
            />
          </>
        )}
      </div>
    );

  return body;
}
