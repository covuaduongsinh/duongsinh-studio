/**
 * Settings → Git: the connections to GitHub (a fine-grained token each, sent once and never shown again) and the
 * repositories linked through them. Opens with the `pm.members` `define-roles` settings item, the same check every
 * endpoint of `server/routes/git.ts` this page calls makes.
 */
import { useToaster } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import {
  CircleAlertIcon,
  ExternalLinkIcon,
  GithubIcon,
  LoaderCircle,
  PlusIcon,
  RefreshCwIcon,
  Trash2Icon,
} from 'lucide-react';
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactElement,
} from 'react';
import { useSearchParams } from 'react-router';

import { Loading } from '#components/loading';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { Alert, AlertDescription } from '#components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '#components/ui/alert-dialog';
import { Badge } from '#components/ui/badge';
import { Button } from '#components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#components/ui/card';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '#components/ui/field';
import { Input } from '#components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#components/ui/table';
import {
  REPOSITORY_NAME,
  submitAppManifest,
  useCompleteGitApp,
  useCreateGitConnection,
  useDeleteGitConnection,
  useGitConnections,
  useGitRepositories,
  useLinkGitRepository,
  useSetGitAppInstallation,
  useStartGitApp,
  type GitApp,
  type GitConnection,
} from '#hooks/use-git';
import { useGitErrorText } from '#hooks/use-git-error-text';

function LoadFailed(): ReactElement {
  const { t } = useTranslation();
  return (
    <Alert variant='destructive' role='alert'>
      <CircleAlertIcon />
      <AlertDescription>{t('git.settings.loadFailed')}</AlertDescription>
    </Alert>
  );
}

/**
 * Finishes what GitHub sends the person back with: `?code&state` after creating the App from its manifest, and
 * `?githubApp=<connection>&installation_id` after installing it. Each is handled once, then taken out of the address.
 */
function useGitHubReturn(): { readonly busy: boolean } {
  const { t } = useTranslation();
  const toaster = useToaster();
  const errorText = useGitErrorText();
  const [params, setParams] = useSearchParams();
  const complete = useCompleteGitApp();
  const install = useSetGitAppInstallation();
  const handledRef = useRef<string | null>(null);
  const code = params.get('code');
  const state = params.get('state');
  const connectionId = params.get('githubApp');
  const installationId = params.get('installation_id');

  useEffect(() => {
    const key =
      code && state
        ? `code:${state}`
        : connectionId
          ? `app:${connectionId}`
          : null;
    if (!key || handledRef.current === key) return;
    handledRef.current = key;
    setParams({}, { replace: true });
    if (code && state)
      complete.mutate(
        { code, state },
        {
          onSuccess: (connection) =>
            toaster.show({
              type: 'success',
              title: t('git.settings.app.completed', { name: connection.name }),
            }),
          onError: (error) =>
            toaster.show({ type: 'error', title: errorText(error) }),
        },
      );
    else if (connectionId)
      install.mutate(
        {
          connectionId,
          ...(installationId && /^\d+$/u.test(installationId)
            ? { installationId }
            : {}),
        },
        {
          onSuccess: (connection) =>
            toaster.show({
              type: 'success',
              title: t('git.settings.app.installed', {
                account: connection.app?.installationAccount ?? '',
              }),
            }),
          onError: (error) =>
            toaster.show({ type: 'error', title: errorText(error) }),
        },
      );
  }, [
    code,
    state,
    connectionId,
    installationId,
    complete,
    install,
    setParams,
    t,
    toaster,
    errorText,
  ]);

  return { busy: complete.isPending || install.isPending };
}

function AppDetails({
  connection,
  app,
}: {
  readonly connection: GitConnection;
  readonly app: GitApp;
}): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const toaster = useToaster();
  const errorText = useGitErrorText();
  const recheck = useSetGitAppInstallation();
  const dateFormat = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const link = (href: string, label: string) => (
    <a
      href={href}
      target='_blank'
      rel='noreferrer'
      className='inline-flex items-center gap-1 text-sm hover:underline'
    >
      {label}
      <ExternalLinkIcon
        aria-hidden='true'
        className='size-3.5 text-muted-foreground'
      />
    </a>
  );

  return (
    <li className='flex flex-col gap-3 rounded-lg border p-4'>
      <div className='flex flex-wrap items-center gap-2'>
        <GithubIcon aria-hidden='true' className='size-4' />
        <a
          href={app.htmlUrl}
          target='_blank'
          rel='noreferrer'
          className='font-medium hover:underline'
        >
          {connection.name}
        </a>
        <Badge variant={app.installationId ? 'secondary' : 'outline'}>
          {app.installationId
            ? t('git.settings.app.installedOn', {
                account: app.installationAccount ?? '—',
              })
            : t('git.settings.app.notInstalled')}
        </Badge>
        {app.ownerLogin ? (
          <span className='text-sm text-muted-foreground'>
            {t('git.settings.app.owner')}: {app.ownerLogin}
          </span>
        ) : null}
      </div>
      {app.missingPermissions.length > 0 ? (
        <Alert variant='destructive' role='alert'>
          <CircleAlertIcon />
          <AlertDescription>
            {t('git.settings.app.missing', {
              list: app.missingPermissions.join(', '),
            })}
          </AlertDescription>
        </Alert>
      ) : null}
      <p className='text-sm text-muted-foreground'>
        <span className='font-medium text-foreground'>
          {t('git.settings.app.webhook')}:
        </span>{' '}
        {app.lastError
          ? t('git.settings.app.lastError', { error: app.lastError })
          : app.lastDeliveryAt
            ? t('git.settings.app.lastDelivery', {
                time: dateFormat.format(new Date(app.lastDeliveryAt)),
                event: app.lastEvent ?? '—',
              })
            : t('git.settings.app.noDelivery')}
      </p>
      <div className='flex flex-wrap items-center gap-4'>
        {link(app.installUrl, t('git.settings.app.install'))}
        {app.permissionsUrl
          ? link(app.permissionsUrl, t('git.settings.app.permissions'))
          : null}
        <Button
          variant='outline'
          size='sm'
          disabled={recheck.isPending}
          onClick={() =>
            recheck.mutate(
              {
                connectionId: connection.id,
                ...(app.installationId
                  ? { installationId: app.installationId }
                  : {}),
              },
              {
                onError: (error) =>
                  toaster.show({ type: 'error', title: errorText(error) }),
              },
            )
          }
        >
          {recheck.isPending ? (
            <LoaderCircle data-icon='inline-start' className='animate-spin' />
          ) : (
            <RefreshCwIcon data-icon='inline-start' />
          )}
          {recheck.isPending
            ? t('git.settings.app.installing')
            : t('git.settings.app.recheck')}
        </Button>
      </div>
    </li>
  );
}

function GitHubAppCard(): ReactElement {
  const { t } = useTranslation();
  const toaster = useToaster();
  const errorText = useGitErrorText();
  const connections = useGitConnections();
  const start = useStartGitApp();
  const { busy } = useGitHubReturn();
  const [organization, setOrganization] = useState('');
  const apps = (connections.data ?? []).filter(
    (connection): connection is GitConnection & { app: GitApp } =>
      connection.kind === 'app' && connection.app != null,
  );

  const create = (event: FormEvent): void => {
    event.preventDefault();
    const org = organization.trim();
    start.mutate(org ? { organization: org } : {}, {
      onSuccess: (started) => submitAppManifest(started),
      onError: (error) =>
        toaster.show({ type: 'error', title: errorText(error) }),
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('git.settings.app.title')}</CardTitle>
        <CardDescription>{t('git.settings.app.description')}</CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-6'>
        {busy ? (
          <p className='flex items-center gap-2 text-sm text-muted-foreground'>
            <LoaderCircle aria-hidden='true' className='size-4 animate-spin' />
            {t('git.settings.app.completing')}
          </p>
        ) : null}
        {connections.error ? (
          <LoadFailed />
        ) : !connections.data ? (
          <Loading />
        ) : apps.length === 0 ? (
          <p className='text-sm text-muted-foreground'>
            {t('git.settings.app.empty')}
          </p>
        ) : (
          <ul
            className='flex flex-col gap-3'
            aria-label={t('git.settings.app.title')}
          >
            {apps.map((connection) => (
              <AppDetails
                key={connection.id}
                connection={connection}
                app={connection.app}
              />
            ))}
          </ul>
        )}
        <form
          onSubmit={create}
          noValidate
          className='grid gap-4 md:grid-cols-[1.5fr_auto] md:items-start'
          aria-label={t('git.settings.app.create')}
        >
          <Field>
            <FieldLabel htmlFor='git-app-organization'>
              {t('git.settings.app.organization')}
            </FieldLabel>
            <Input
              id='git-app-organization'
              value={organization}
              maxLength={100}
              spellCheck={false}
              disabled={start.isPending}
              onChange={(event) => setOrganization(event.target.value)}
            />
            <FieldDescription>
              {t('git.settings.app.organizationHint')}
            </FieldDescription>
          </Field>
          <Button type='submit' className='md:mt-6' disabled={start.isPending}>
            {start.isPending ? (
              <LoaderCircle data-icon='inline-start' className='animate-spin' />
            ) : (
              <GithubIcon data-icon='inline-start' />
            )}
            {start.isPending
              ? t('git.settings.app.creating')
              : t('git.settings.app.create')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function AddConnectionForm(): ReactElement {
  const { t } = useTranslation();
  const toaster = useToaster();
  const errorText = useGitErrorText();
  const create = useCreateGitConnection();
  const [name, setName] = useState('');
  const [token, setToken] = useState('');
  const [tried, setTried] = useState(false);
  const nameMissing = tried && !name.trim();
  const tokenMissing = tried && !token.trim();

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    setTried(true);
    if (!name.trim() || !token.trim()) return;
    create.mutate(
      { name: name.trim(), token: token.trim() },
      {
        onSuccess: (connection) => {
          // The token is sent once: the form forgets it as soon as the server kept it.
          setName('');
          setToken('');
          setTried(false);
          toaster.show({
            type: 'success',
            title: t('git.settings.connections.added', {
              name: connection.name,
            }),
          });
        },
        onError: (error) =>
          toaster.show({ type: 'error', title: errorText(error) }),
      },
    );
  };

  return (
    <form
      onSubmit={submit}
      noValidate
      className='grid gap-4 md:grid-cols-[1fr_1.5fr_auto] md:items-start'
      aria-label={t('git.settings.connections.add')}
    >
      <Field data-invalid={nameMissing || undefined}>
        <FieldLabel htmlFor='git-connection-name'>
          {t('git.settings.connections.name')}
        </FieldLabel>
        <Input
          id='git-connection-name'
          value={name}
          maxLength={100}
          placeholder={t('git.settings.connections.namePlaceholder')}
          aria-invalid={nameMissing || undefined}
          disabled={create.isPending}
          onChange={(event) => setName(event.target.value)}
        />
        {nameMissing ? (
          <FieldError>{t('git.settings.connections.nameRequired')}</FieldError>
        ) : null}
      </Field>
      <Field data-invalid={tokenMissing || undefined}>
        <FieldLabel htmlFor='git-connection-token'>
          {t('git.settings.connections.token')}
        </FieldLabel>
        <Input
          id='git-connection-token'
          type='password'
          autoComplete='new-password'
          spellCheck={false}
          value={token}
          maxLength={1000}
          aria-invalid={tokenMissing || undefined}
          disabled={create.isPending}
          onChange={(event) => setToken(event.target.value)}
        />
        {tokenMissing ? (
          <FieldError>{t('git.settings.connections.tokenRequired')}</FieldError>
        ) : (
          <FieldDescription>
            {t('git.settings.connections.tokenHint')}
          </FieldDescription>
        )}
      </Field>
      <Button type='submit' className='md:mt-6' disabled={create.isPending}>
        {create.isPending ? (
          <LoaderCircle data-icon='inline-start' className='animate-spin' />
        ) : (
          <PlusIcon data-icon='inline-start' />
        )}
        {create.isPending
          ? t('git.settings.connections.adding')
          : t('git.settings.connections.add')}
      </Button>
    </form>
  );
}

function ConnectionsCard(): ReactElement {
  const { t } = useTranslation();
  const toaster = useToaster();
  const errorText = useGitErrorText();
  const connections = useGitConnections();
  const remove = useDeleteGitConnection();
  const [deleting, setDeleting] = useState<GitConnection | null>(null);

  let list: ReactElement;
  if (connections.error) list = <LoadFailed />;
  else if (!connections.data) list = <Loading />;
  else if (connections.data.length === 0)
    list = (
      <p className='text-sm text-muted-foreground'>
        {t('git.settings.connections.empty')}
      </p>
    );
  else
    list = (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('git.settings.connections.name')}</TableHead>
            <TableHead>{t('git.settings.connections.account')}</TableHead>
            <TableHead>{t('git.settings.connections.token')}</TableHead>
            <TableHead>{t('git.settings.connections.usedBy')}</TableHead>
            <TableHead className='w-12'>
              <span className='sr-only'>
                {t('git.settings.connections.actions')}
              </span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {connections.data.map((connection) => (
            <TableRow key={connection.id}>
              <TableCell className='font-medium'>{connection.name}</TableCell>
              <TableCell className='text-muted-foreground'>
                {connection.account ?? '—'}
              </TableCell>
              <TableCell>
                <Badge variant={connection.hasToken ? 'secondary' : 'outline'}>
                  {connection.kind === 'app'
                    ? t('git.settings.app.title')
                    : connection.hasToken
                      ? t('git.settings.connections.tokenKept')
                      : t('git.settings.connections.noToken')}
                </Badge>
              </TableCell>
              <TableCell className='tabular-nums'>
                {connection.usedBy}
              </TableCell>
              <TableCell className='text-right'>
                <Button
                  variant='ghost'
                  size='icon-sm'
                  aria-label={t('git.settings.connections.delete', {
                    name: connection.name,
                  })}
                  onClick={() => setDeleting(connection)}
                >
                  <Trash2Icon />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('git.settings.connections.title')}</CardTitle>
        <CardDescription>
          {t('git.settings.connections.description')}
        </CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-6'>
        {list}
        <AddConnectionForm />
      </CardContent>
      <AlertDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open && !remove.isPending) setDeleting(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('git.settings.connections.deleteTitle', {
                name: deleting?.name ?? '',
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('git.settings.connections.deleteDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>
              {t('git.settings.connections.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              variant='destructive'
              disabled={remove.isPending}
              onClick={() => {
                if (!deleting) return;
                const target = deleting;
                remove.mutate(target.id, {
                  onSuccess: () => {
                    setDeleting(null);
                    toaster.show({
                      type: 'success',
                      title: t('git.settings.connections.deleted', {
                        name: target.name,
                      }),
                    });
                  },
                  onError: (error) => {
                    setDeleting(null);
                    toaster.show({ type: 'error', title: errorText(error) });
                  },
                });
              }}
            >
              {t('git.settings.connections.deleteConfirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function LinkRepositoryForm({
  connections,
}: {
  readonly connections: readonly GitConnection[];
}): ReactElement {
  const { t } = useTranslation();
  const toaster = useToaster();
  const errorText = useGitErrorText();
  const link = useLinkGitRepository();
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [repo, setRepo] = useState('');
  const [tried, setTried] = useState(false);
  const connectionMissing = tried && !connectionId;
  const repoInvalid = tried && !REPOSITORY_NAME.test(repo.trim());
  const items = connections.map((connection) => ({
    value: connection.id,
    label: connection.name,
  }));

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    setTried(true);
    const name = repo.trim();
    if (!connectionId || !REPOSITORY_NAME.test(name)) return;
    link.mutate(
      { connectionId, repo: name },
      {
        onSuccess: (linked) => {
          setRepo('');
          setTried(false);
          toaster.show({
            type: 'success',
            title: t('git.settings.repositories.linked', { repo: linked.repo }),
          });
        },
        onError: (error) =>
          toaster.show({ type: 'error', title: errorText(error) }),
      },
    );
  };

  return (
    <form
      onSubmit={submit}
      noValidate
      className='grid gap-4 md:grid-cols-[1fr_1.5fr_auto] md:items-start'
      aria-label={t('git.settings.repositories.link')}
    >
      <Field data-invalid={connectionMissing || undefined}>
        <FieldLabel htmlFor='git-repository-connection'>
          {t('git.settings.repositories.connection')}
        </FieldLabel>
        <Select
          items={items}
          value={connectionId}
          disabled={link.isPending}
          onValueChange={(value: string | null) => setConnectionId(value)}
        >
          <SelectTrigger
            id='git-repository-connection'
            className='w-full'
            aria-invalid={connectionMissing || undefined}
          >
            <SelectValue>
              {(value: string | null) =>
                items.find((item) => item.value === value)?.label ?? (
                  <span className='text-muted-foreground'>
                    {t('git.settings.repositories.chooseConnection')}
                  </span>
                )
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
        {connectionMissing ? (
          <FieldError>
            {t('git.settings.repositories.connectionRequired')}
          </FieldError>
        ) : null}
      </Field>
      <Field data-invalid={repoInvalid || undefined}>
        <FieldLabel htmlFor='git-repository-name'>
          {t('git.settings.repositories.repo')}
        </FieldLabel>
        <Input
          id='git-repository-name'
          value={repo}
          spellCheck={false}
          placeholder={t('git.settings.repositories.repoPlaceholder')}
          aria-invalid={repoInvalid || undefined}
          disabled={link.isPending}
          onChange={(event) => setRepo(event.target.value)}
        />
        {repoInvalid ? (
          <FieldError>{t('git.settings.repositories.repoInvalid')}</FieldError>
        ) : null}
      </Field>
      <Button type='submit' className='md:mt-6' disabled={link.isPending}>
        {link.isPending ? (
          <LoaderCircle data-icon='inline-start' className='animate-spin' />
        ) : (
          <PlusIcon data-icon='inline-start' />
        )}
        {link.isPending
          ? t('git.settings.repositories.linking')
          : t('git.settings.repositories.link')}
      </Button>
    </form>
  );
}

function RepositoriesCard(): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const repositories = useGitRepositories();
  const connections = useGitConnections();
  const dateFormat = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const connectionName = (id: string) =>
    connections.data?.find((connection) => connection.id === id)?.name ?? '—';

  let list: ReactElement;
  if (repositories.error) list = <LoadFailed />;
  else if (!repositories.data) list = <Loading />;
  else if (repositories.data.length === 0)
    list = (
      <p className='text-sm text-muted-foreground'>
        {t('git.settings.repositories.empty')}
      </p>
    );
  else
    list = (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('git.settings.repositories.repo')}</TableHead>
            <TableHead>{t('git.settings.repositories.connection')}</TableHead>
            <TableHead>
              {t('git.settings.repositories.defaultBranch')}
            </TableHead>
            <TableHead>{t('git.settings.repositories.projects')}</TableHead>
            <TableHead>{t('git.settings.repositories.status')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {repositories.data.map((repository) => (
            <TableRow key={repository.id}>
              <TableCell className='font-medium'>
                <a
                  href={repository.webUrl}
                  target='_blank'
                  rel='noreferrer'
                  className='inline-flex items-center gap-1 hover:underline'
                >
                  {repository.repo}
                  <ExternalLinkIcon
                    aria-hidden='true'
                    className='size-3.5 text-muted-foreground'
                  />
                </a>
              </TableCell>
              <TableCell>{connectionName(repository.connectionId)}</TableCell>
              <TableCell className='font-mono text-xs'>
                {repository.defaultBranch}
              </TableCell>
              <TableCell className='tabular-nums'>
                {repository.projects.length}
              </TableCell>
              <TableCell className='text-sm text-muted-foreground'>
                {repository.pollError
                  ? t('git.settings.repositories.pollError', {
                      error: repository.pollError,
                    })
                  : repository.polledAt
                    ? t('git.settings.repositories.polled', {
                        time: dateFormat.format(new Date(repository.polledAt)),
                      })
                    : t('git.settings.repositories.notPolled')}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('git.settings.repositories.title')}</CardTitle>
        <CardDescription>
          {t('git.settings.repositories.description')}
        </CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-6'>
        {list}
        {connections.data && connections.data.length > 0 ? (
          <LinkRepositoryForm connections={connections.data} />
        ) : null}
      </CardContent>
    </Card>
  );
}

export default function GitSettingsPage(): ReactElement {
  const { t } = useTranslation();
  return (
    <PageContainer>
      <PageHeader
        title={t('git.settings.title')}
        description={t('git.settings.description')}
      />
      <GitHubAppCard />
      <ConnectionsCard />
      <RepositoriesCard />
    </PageContainer>
  );
}
