/**
 * `/releases/register`: registers a NocoBase 3 App for a repository in one form (plan V, V5.3): the release environment of the
 * role, the App, the link to the repository and the one CI workflow file. The owner's page (the server refuses anyone else).
 * What is left after it is not Studio's to do: DNS, the GitHub secret and pushing the workflow file; the page lists them.
 */
import { useTranslation } from '@nocobase/i18n/client';
import { useState, type ReactElement } from 'react';

import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { Alert, AlertDescription } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import { Input } from '#components/ui/input';
import { Label } from '#components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';
import {
  useCheckEnvironment,
  useCreateCiKey,
  useRegisterNb3App,
  useReleaseProjects,
  type EnvironmentKey,
  type Nb3Registration,
} from '#hooks/use-releases';
import { errorReason } from '#hooks/use-git';

const ROLES: readonly EnvironmentKey[] = ['preview', 'staging', 'production'];
const DATABASES = ['sqlite', 'postgres'] as const;
const APP_ID = /^[a-z0-9][a-z0-9-]{0,62}$/u;
const KNOWN_REASONS = new Set([
  'OWNER_ONLY',
  'APP_EXISTS',
  'HOST_TAKEN',
  'DATABASE_MISMATCH',
  'INVALID_HOST',
  'REPOSITORY_NOT_FOUND',
  'ENVIRONMENT_CONFLICT',
  'NO_PUBLIC_URL',
]);
const HOST = /^[a-z0-9][a-z0-9-]*(\.[a-z0-9][a-z0-9-]*)+$/u;

function Choice({
  id,
  label,
  value,
  items,
  onChange,
}: {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly items: readonly { readonly value: string; readonly label: string }[];
  readonly onChange: (value: string) => void;
}): ReactElement {
  return (
    <div className='flex min-w-0 flex-col gap-1.5'>
      <Label htmlFor={id}>{label}</Label>
      <Select
        items={[...items]}
        value={value}
        onValueChange={(next: string | null) => next && onChange(next)}
      >
        <SelectTrigger id={id} className='w-full'>
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

function AfterRegistration({
  repositoryId,
  result,
}: {
  readonly repositoryId: string;
  readonly result: Nb3Registration;
}): ReactElement {
  const { t } = useTranslation();
  const check = useCheckEnvironment();
  const key = useCreateCiKey();
  const dns = check.data?.details?.dns?.[result.host];
  return (
    <div className='flex min-w-0 flex-col gap-4' data-testid='register-result'>
      <Alert>
        <AlertDescription>
          {t('releases.register.done', { appId: result.appId })}
        </AlertDescription>
      </Alert>
      <ol className='flex list-decimal flex-col gap-4 ps-5 text-sm'>
        <li className='flex flex-col gap-2'>
          <span>{t('releases.register.stepDns', { host: result.host })}</span>
          <div className='flex flex-wrap items-center gap-2'>
            <Button
              type='button'
              variant='outline'
              size='sm'
              disabled={check.isPending}
              onClick={() => check.mutate(result.environmentId)}
            >
              {t('releases.register.checkDns')}
            </Button>
            {check.data ? (
              <span role='status' className='break-all text-muted-foreground'>
                {dns && dns !== 'unresolved'
                  ? t('releases.register.dnsPoints', { address: dns })
                  : t('releases.register.dnsMissing')}
              </span>
            ) : null}
          </div>
        </li>
        <li className='flex flex-col gap-2'>
          <span>{t('releases.register.stepKey')}</span>
          <div className='flex flex-wrap items-center gap-2'>
            <Button
              type='button'
              variant='outline'
              size='sm'
              disabled={key.isPending}
              onClick={() => key.mutate(repositoryId)}
            >
              {t('releases.register.makeKey')}
            </Button>
          </div>
          {key.data ? (
            <div className='flex min-w-0 flex-col gap-1'>
              <code
                data-testid='ci-secret'
                className='rounded-md bg-muted p-2 text-xs break-all'
              >
                {key.data.secret}
              </code>
              <span className='text-xs text-muted-foreground'>
                {t('releases.register.keyOnce')}
              </span>
            </div>
          ) : null}
          {key.error ? (
            <p role='alert' className='text-sm text-destructive'>
              {t('releases.register.keyFailed')}
            </p>
          ) : null}
        </li>
        <li>
          {t('releases.register.stepSecret', { name: result.secretName })}
        </li>
        <li className='flex min-w-0 flex-col gap-2'>
          <span>
            {t('releases.register.stepWorkflow', {
              path: result.workflow.path,
            })}
          </span>
          <pre className='max-h-80 overflow-auto rounded-md bg-muted p-3 text-xs'>
            {result.workflow.content}
          </pre>
        </li>
      </ol>
    </div>
  );
}

export default function RegisterAppPage(): ReactElement {
  const { t } = useTranslation();
  const projects = useReleaseProjects();
  const register = useRegisterNb3App();
  const repositories = (projects.data ?? []).flatMap((item) =>
    item.repositories.map((repo) => ({ value: repo.id, label: repo.repo })),
  );
  const [repositoryId, setRepositoryId] = useState('');
  const [appId, setAppId] = useState('');
  const [host, setHost] = useState('');
  const [role, setRole] = useState<EnvironmentKey>('preview');
  const [database, setDatabase] = useState<'sqlite' | 'postgres'>('sqlite');
  const valid = repositoryId !== '' && APP_ID.test(appId) && HOST.test(host);
  const reason = register.error ? errorReason(register.error) : undefined;
  const result = register.data;

  return (
    <PageContainer>
      <PageHeader
        title={t('releases.register.title')}
        description={t('releases.register.description')}
      />
      {result ? (
        <AfterRegistration repositoryId={repositoryId} result={result} />
      ) : (
        <form
          className='grid max-w-xl gap-4'
          onSubmit={(event) => {
            event.preventDefault();
            if (valid && !register.isPending)
              register.mutate({ repositoryId, appId, host, role, database });
          }}
        >
          <Choice
            id='register-repository'
            label={t('releases.register.repository')}
            value={repositoryId}
            items={repositories}
            onChange={setRepositoryId}
          />
          <div className='flex flex-col gap-1.5'>
            <Label htmlFor='register-app'>{t('releases.register.appId')}</Label>
            <Input
              id='register-app'
              value={appId}
              autoComplete='off'
              onChange={(event) => setAppId(event.target.value.trim())}
            />
          </div>
          <div className='flex flex-col gap-1.5'>
            <Label htmlFor='register-host'>{t('releases.register.host')}</Label>
            <Input
              id='register-host'
              value={host}
              autoComplete='off'
              placeholder='app.dsc.edu.vn'
              onChange={(event) =>
                setHost(event.target.value.trim().toLowerCase())
              }
            />
          </div>
          <Choice
            id='register-role'
            label={t('releases.register.role')}
            value={role}
            items={ROLES.map((item) => ({
              value: item,
              label: t(`releases.register.roles.${item}`),
            }))}
            onChange={(next) => setRole(next as EnvironmentKey)}
          />
          <Choice
            id='register-database'
            label={t('releases.register.database')}
            value={database}
            items={DATABASES.map((item) => ({
              value: item,
              label: t(`releases.register.databases.${item}`),
            }))}
            onChange={(next) => setDatabase(next as 'sqlite' | 'postgres')}
          />
          {register.error ? (
            <p role='alert' className='text-sm text-destructive'>
              {reason && KNOWN_REASONS.has(reason)
                ? t(`releases.register.errors.${reason}`)
                : t('releases.register.failed')}
            </p>
          ) : null}
          <div>
            <Button type='submit' disabled={!valid || register.isPending}>
              {t('releases.register.submit')}
            </Button>
          </div>
        </form>
      )}
    </PageContainer>
  );
}
