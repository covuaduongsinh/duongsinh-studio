/**
 * `/releases`: where Dương Sinh's work is. Previews (pull requests, S5.6), what runs on staging, the versions of each
 * repository's release line with what they bring, and the merged issues still waiting for production. Studio records
 * rather than deploys: an administrator marks staging, the owner marks production after deploying it through Dokploy
 * (anyone else who may deploy asks the owner, who decides in the inbox).
 */
import { useTranslation } from '@nocobase/i18n/client';
import { RefreshCwIcon } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { useNavigate, useSearchParams } from 'react-router';

import { Loading } from '#components/loading';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { Badge } from '#components/ui/badge';
import { Button } from '#components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#components/ui/dialog';
import { Label } from '#components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '#components/ui/tabs';
import { Textarea } from '#components/ui/textarea';
import {
  useMarkVersion,
  usePendingRelease,
  useReleaseEnvironments,
  useReleaseProjects,
  useReleaseVersions,
  useReleasesMe,
  useRequestProduction,
  useSyncReleaseLine,
  type IssueDeploymentMark,
  type IssueWhere,
  type ReleaseVersion,
} from '#hooks/use-releases';

import { PreviewsTab } from './previews.js';

const TABS = ['previews', 'staging', 'releases', 'pending'] as const;
type Tab = (typeof TABS)[number];

const WHERE_VARIANT: Readonly<
  Record<IssueWhere, 'default' | 'secondary' | 'outline'>
> = {
  production: 'default',
  staging: 'secondary',
  released: 'outline',
  merged: 'outline',
};

export function WhereBadge({
  where,
}: {
  readonly where: IssueWhere | 'notDeployed';
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Badge variant={where === 'notDeployed' ? 'outline' : WHERE_VARIANT[where]}>
      {t(`releases.where.${where}`)}
    </Badge>
  );
}

function date(value: string | null, locale: string): string {
  return value
    ? new Date(value).toLocaleString(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : '—';
}

function IssueTable({
  marks,
}: {
  readonly marks: readonly IssueDeploymentMark[];
}): ReactElement {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const projects = useReleaseProjects();
  const projectName = (id: string | null) =>
    projects.data?.find((item) => item.project.id === id)?.project.name ?? '—';
  if (marks.length === 0)
    return (
      <p className='text-sm text-muted-foreground'>
        {t('releases.emptyIssues')}
      </p>
    );
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('releases.columns.issue')}</TableHead>
          <TableHead>{t('releases.columns.project')}</TableHead>
          <TableHead>{t('releases.columns.where')}</TableHead>
          <TableHead>{t('releases.columns.updated')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {marks.map((mark) => (
          <TableRow key={mark.issueId}>
            <TableCell>
              <button
                type='button'
                className='text-left hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none'
                onClick={() => {
                  const pending = navigate(
                    `/issues/${mark.issue?.identifier ?? mark.issueId}`,
                  );
                  if (pending) pending.catch(() => undefined);
                }}
              >
                <span className='font-mono text-xs text-muted-foreground'>
                  {mark.issue?.identifier}
                </span>{' '}
                {mark.issue?.title}
              </button>
            </TableCell>
            <TableCell>{projectName(mark.issue?.projectId ?? null)}</TableCell>
            <TableCell>
              <span className='flex flex-wrap items-center gap-1.5'>
                <WhereBadge where={mark.where} />
                {mark.version ? (
                  <span className='font-mono text-xs'>{mark.version.tag}</span>
                ) : null}
              </span>
            </TableCell>
            <TableCell>
              {date(
                mark.production?.at ?? mark.staging?.at ?? mark.mergedAt,
                i18n.language,
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

type MarkAction = {
  readonly type: 'staging' | 'production' | 'rollback' | 'request';
  readonly version: ReleaseVersion;
} | null;

function MarkDialog({
  action,
  onClose,
}: {
  readonly action: MarkAction;
  readonly onClose: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const [note, setNote] = useState('');
  const mark = useMarkVersion();
  const request = useRequestProduction();
  const pending = mark.isPending || request.isPending;
  const failed = mark.error ?? request.error;
  const close = () => {
    setNote('');
    mark.reset();
    request.reset();
    onClose();
  };
  const submit = () => {
    if (!action || !note.trim()) return;
    if (action.type === 'request')
      request.mutate(
        { versionId: action.version.id, note: note.trim() },
        { onSuccess: close },
      );
    else
      mark.mutate(
        {
          versionId: action.version.id,
          environmentKey: action.type === 'staging' ? 'staging' : 'production',
          kind: action.type === 'rollback' ? 'rolledBack' : 'deployed',
          note: note.trim(),
        },
        { onSuccess: close },
      );
  };
  return (
    <Dialog
      open={action !== null}
      onOpenChange={(open: boolean) => (open ? undefined : close())}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {action
              ? t(`releases.mark.${action.type}.title`, {
                  tag: action.version.tag,
                  repo: action.version.repo,
                })
              : ''}
          </DialogTitle>
          <DialogDescription>
            {action ? t(`releases.mark.${action.type}.description`) : ''}
          </DialogDescription>
        </DialogHeader>
        <div className='flex flex-col gap-2'>
          <Label htmlFor='release-mark-note'>{t('releases.mark.note')}</Label>
          <Textarea
            id='release-mark-note'
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={t('releases.mark.notePlaceholder')}
            required
          />
          {failed ? (
            <p role='alert' className='text-sm text-destructive'>
              {t('releases.mark.failed')}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={close}>
            {t('releases.cancel')}
          </Button>
          <Button onClick={submit} disabled={pending || !note.trim()}>
            {t('releases.mark.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReleasesTab({
  projectId,
}: {
  readonly projectId: string | null;
}): ReactElement {
  const { t, i18n } = useTranslation();
  const projects = useReleaseProjects();
  const versions = useReleaseVersions(projectId);
  const me = useReleasesMe();
  const sync = useSyncReleaseLine();
  const [action, setAction] = useState<MarkAction>(null);
  if (projects.error || versions.error)
    return (
      <p role='alert' className='text-sm text-destructive'>
        {t('releases.loadFailed')}
      </p>
    );
  if (!projects.data || !versions.data) return <Loading />;
  const repositories = projects.data
    .filter((item) => !projectId || item.project.id === projectId)
    .flatMap((item) => item.repositories);
  if (repositories.length === 0)
    return (
      <p className='text-sm text-muted-foreground'>
        {t('releases.noRepositories')}
      </p>
    );
  return (
    <div className='flex flex-col gap-6'>
      {repositories.map((repository) => {
        const own = versions.data.filter(
          (version) => version.repositoryId === repository.id,
        );
        const productionIndex = own.findIndex(
          (version) => version.current.production,
        );
        return (
          <section
            key={repository.id}
            aria-labelledby={`release-${repository.id}`}
            className='flex flex-col gap-3'
          >
            <div className='flex flex-wrap items-center justify-between gap-2'>
              <div className='min-w-0'>
                <h2 id={`release-${repository.id}`} className='font-medium'>
                  {repository.repo}
                </h2>
                <p className='text-sm text-muted-foreground'>
                  {t('releases.line', {
                    branch: repository.line.branch,
                    pattern: repository.line.pattern,
                  })}
                  {repository.line.syncedAt
                    ? ` · ${t('releases.synced', { time: date(repository.line.syncedAt, i18n.language) })}`
                    : ''}
                  {repository.line.syncError
                    ? ` · ${t('releases.syncError')}`
                    : ''}
                </p>
              </div>
              {me.data?.admin ? (
                <Button
                  variant='outline'
                  size='sm'
                  disabled={sync.isPending}
                  onClick={() => sync.mutate(repository.id)}
                >
                  <RefreshCwIcon aria-hidden='true' />
                  {t('releases.sync')}
                </Button>
              ) : null}
            </div>
            {own.length === 0 ? (
              <p className='text-sm text-muted-foreground'>
                {t('releases.noVersions')}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('releases.columns.version')}</TableHead>
                    <TableHead>{t('releases.columns.issues')}</TableHead>
                    <TableHead>{t('releases.columns.where')}</TableHead>
                    <TableHead>{t('releases.columns.committed')}</TableHead>
                    <TableHead>
                      <span className='sr-only'>
                        {t('releases.columns.actions')}
                      </span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {own.map((version, index) => (
                    <TableRow key={version.id} aria-disabled={version.deleted}>
                      <TableCell className='font-mono'>
                        {version.tag}
                        {version.deleted ? (
                          <Badge variant='destructive' className='ml-2'>
                            {t('releases.deleted')}
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell>{version.taskCount}</TableCell>
                      <TableCell>
                        <span className='flex flex-wrap gap-1.5'>
                          {version.current.production ? (
                            <WhereBadge where='production' />
                          ) : null}
                          {version.current.staging ? (
                            <WhereBadge where='staging' />
                          ) : null}
                          {!version.current.production &&
                          version.reached.production ? (
                            <Badge variant='outline'>
                              {t('releases.included')}
                            </Badge>
                          ) : null}
                        </span>
                      </TableCell>
                      <TableCell>
                        {date(version.committedAt, i18n.language)}
                      </TableCell>
                      <TableCell className='text-right'>
                        {version.deleted ? null : (
                          <span className='flex flex-wrap justify-end gap-1.5'>
                            {me.data?.admin && !version.current.staging ? (
                              <Button
                                variant='outline'
                                size='sm'
                                onClick={() =>
                                  setAction({ type: 'staging', version })
                                }
                              >
                                {t('releases.actions.staging')}
                              </Button>
                            ) : null}
                            {me.data?.owner && !version.current.production ? (
                              <Button
                                size='sm'
                                onClick={() =>
                                  setAction({
                                    type:
                                      productionIndex >= 0 &&
                                      index > productionIndex
                                        ? 'rollback'
                                        : 'production',
                                    version,
                                  })
                                }
                              >
                                {productionIndex >= 0 && index > productionIndex
                                  ? t('releases.actions.rollback')
                                  : t('releases.actions.production')}
                              </Button>
                            ) : null}
                            {!me.data?.owner &&
                            me.data?.deployer &&
                            !version.current.production ? (
                              <Button
                                size='sm'
                                variant='secondary'
                                onClick={() =>
                                  setAction({ type: 'request', version })
                                }
                              >
                                {t('releases.actions.request')}
                              </Button>
                            ) : null}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </section>
        );
      })}
      <MarkDialog action={action} onClose={() => setAction(null)} />
    </div>
  );
}

export default function ReleasesPage(): ReactElement {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const tab: Tab = (TABS as readonly string[]).includes(params.get('tab') ?? '')
    ? (params.get('tab') as Tab)
    : 'releases';
  const projects = useReleaseProjects();
  const environments = useReleaseEnvironments();
  const pending = usePendingRelease(null);
  const projectId = params.get('project');

  const pendingMarks = (pending.data ?? []).filter(
    (mark) => !projectId || mark.issue?.projectId === projectId,
  );
  const staging = pendingMarks.filter((mark) => mark.where === 'staging');
  const preview = environments.data?.find((env) => env.key === 'preview');
  const counts: Readonly<Record<Tab, number | null>> = {
    previews: null,
    staging: staging.length,
    releases: projects.data
      ? projects.data
          .filter((item) => !projectId || item.project.id === projectId)
          .reduce(
            (sum, item) =>
              sum +
              item.repositories.reduce((n, repo) => n + repo.versionCount, 0),
            0,
          )
      : null,
    pending: pendingMarks.length,
  };

  let body: ReactElement;
  if (tab === 'previews')
    body = (
      <div className='flex flex-col gap-4'>
        {preview?.description ? (
          <p className='text-sm text-muted-foreground'>{preview.description}</p>
        ) : null}
        <PreviewsTab slot='preview' />
      </div>
    );
  else if (tab === 'releases') body = <ReleasesTab projectId={projectId} />;
  else if (pending.error)
    body = (
      <p role='alert' className='text-sm text-destructive'>
        {t('releases.loadFailed')}
      </p>
    );
  else if (!pending.data) body = <Loading />;
  else if (tab === 'staging')
    body = (
      <div className='flex flex-col gap-4'>
        <PreviewsTab slot='staging' />
        <IssueTable marks={staging} />
      </div>
    );
  else body = <IssueTable marks={pendingMarks} />;

  return (
    <PageContainer>
      <PageHeader
        title={t('releases.title')}
        description={t('releases.description')}
      />
      {projects.data && projects.data.length > 1 ? (
        <nav
          aria-label={t('releases.projects')}
          className='flex flex-wrap gap-2'
        >
          <Button
            size='sm'
            variant={projectId ? 'outline' : 'secondary'}
            onClick={() =>
              setParams((current) => (current.delete('project'), current))
            }
          >
            {t('releases.allProjects')}
          </Button>
          {projects.data.map((item) => (
            <Button
              key={item.project.id}
              size='sm'
              variant={projectId === item.project.id ? 'secondary' : 'outline'}
              onClick={() =>
                setParams(
                  (current) => (
                    current.set('project', item.project.id),
                    current
                  ),
                )
              }
            >
              {item.project.name}
            </Button>
          ))}
        </nav>
      ) : null}
      <Tabs
        value={tab}
        onValueChange={(value: string) =>
          setParams((current) => (current.set('tab', value), current))
        }
      >
        <TabsList>
          {TABS.map((item) => (
            <TabsTrigger key={item} value={item}>
              {t(`releases.tabs.${item}`)}
              {counts[item] !== null ? (
                <>
                  {' '}
                  <span className='text-muted-foreground'>{counts[item]}</span>
                </>
              ) : null}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {body}
    </PageContainer>
  );
}
