/** Settings → Organization API keys: keys that belong to the organization, for CI and other machines. */
import { useTranslation } from '@nocobase/i18n/client';
import { useState, type FormEvent, type ReactElement } from 'react';

import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { Alert, AlertDescription } from '#components/ui/alert';
import { Badge } from '#components/ui/badge';
import { Button } from '#components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '#components/ui/card';
import { Input } from '#components/ui/input';
import { Label } from '#components/ui/label';
import { Skeleton } from '#components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#components/ui/table';
import {
  useCreateOrganizationKey,
  useKeyScopeOptions,
  useOrganizationKeyAction,
  useOrganizationKeys,
  type KeyGroups,
  type KeyLevel,
  type LocalizedText,
  type OrganizationKey,
} from '#hooks/use-organization-keys';

type Translate = ReturnType<typeof useTranslation>['t'];

const textOf = (t: Translate, text: LocalizedText): string =>
  typeof text === 'string' ? text : t(text.key, { ns: text.ns });

function NewKey({
  onClose,
  onCreated,
}: {
  readonly onClose: () => void;
  readonly onCreated: (secret: string) => void;
}): ReactElement {
  const { t } = useTranslation();
  const options = useKeyScopeOptions(true);
  const create = useCreateOrganizationKey();
  const [name, setName] = useState('');
  const [days, setDays] = useState('90');
  const [groups, setGroups] = useState<KeyGroups>({});
  const chosen = Object.keys(groups).length > 0;

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (!name.trim() || !chosen) return;
    const expiresInDays = Number.parseInt(days, 10);
    create.mutate(
      {
        name: name.trim(),
        expiresInDays:
          Number.isFinite(expiresInDays) && expiresInDays > 0
            ? expiresInDays
            : null,
        scope: { groups },
      },
      { onSuccess: ({ secret }) => onCreated(secret) },
    );
  };

  const choose = (groupId: string, level: KeyLevel | null): void => {
    setGroups((current) => {
      const { [groupId]: _removed, ...others } = current;
      return level ? { ...others, [groupId]: { level } } : others;
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('organizationKeys.new')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form className='flex flex-col gap-4' onSubmit={submit}>
          <div className='grid gap-4 sm:grid-cols-2'>
            <div className='flex flex-col gap-2'>
              <Label htmlFor='org-key-name'>{t('organizationKeys.name')}</Label>
              <Input
                id='org-key-name'
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className='flex flex-col gap-2'>
              <Label htmlFor='org-key-days'>
                {t('organizationKeys.expiresInDays')}
              </Label>
              <Input
                id='org-key-days'
                inputMode='numeric'
                value={days}
                onChange={(event) => setDays(event.target.value)}
              />
            </div>
          </div>
          <fieldset className='flex flex-col gap-2'>
            <legend className='mb-1 text-sm font-medium'>
              {t('organizationKeys.scope')}
            </legend>
            {options.isLoading ? <Skeleton className='h-24 w-full' /> : null}
            {options.data?.groups.map((group) => (
              <div
                key={group.id}
                className='flex flex-wrap items-center justify-between gap-2 text-sm'
              >
                <span>{textOf(t, group.title)}</span>
                <div
                  aria-label={textOf(t, group.title)}
                  className='flex gap-1'
                  role='group'
                >
                  <Button
                    aria-pressed={!groups[group.id]}
                    size='sm'
                    type='button'
                    variant={groups[group.id] ? 'ghost' : 'secondary'}
                    onClick={() => choose(group.id, null)}
                  >
                    {t('organizationKeys.level.none')}
                  </Button>
                  {group.levels.map((level) => (
                    <Button
                      key={level}
                      aria-pressed={groups[group.id]?.level === level}
                      disabled={!group.held[level]}
                      size='sm'
                      type='button'
                      variant={
                        groups[group.id]?.level === level
                          ? 'secondary'
                          : 'ghost'
                      }
                      onClick={() => choose(group.id, level)}
                    >
                      {t(`organizationKeys.level.${level}`)}
                    </Button>
                  ))}
                </div>
              </div>
            ))}
          </fieldset>
          {create.isError ? (
            <p className='text-sm text-destructive'>
              {t('organizationKeys.failed')}
            </p>
          ) : null}
          <div className='flex gap-2'>
            <Button disabled={!chosen || create.isPending} type='submit'>
              {t('organizationKeys.create')}
            </Button>
            <Button type='button' variant='ghost' onClick={onClose}>
              {t('organizationKeys.cancel')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function KeyRow({
  item,
  onRotated,
}: {
  readonly item: OrganizationKey;
  readonly onRotated: (secret: string) => void;
}): ReactElement {
  const { i18n, t } = useTranslation();
  const act = useOrganizationKeyAction();
  // Rotating and deleting cannot be undone, so each asks once more in place.
  const [confirming, setConfirming] = useState<'rotate' | 'delete' | null>(
    null,
  );
  const date = (value: string | null): string =>
    value
      ? new Intl.DateTimeFormat(i18n.language, {
          dateStyle: 'short',
        }).format(new Date(value))
      : t('organizationKeys.never');

  return (
    <TableRow>
      <TableCell>
        <span className='font-medium'>{item.name}</span>
        {item.start ? (
          <span className='ml-2 font-mono text-xs text-muted-foreground'>
            {item.start}…
          </span>
        ) : null}
      </TableCell>
      <TableCell>
        <Badge variant={item.status === 'active' ? 'secondary' : 'outline'}>
          {t(`organizationKeys.status.${item.status}`)}
        </Badge>
      </TableCell>
      <TableCell>
        {item.createdBy?.name ?? t('organizationKeys.never')}
      </TableCell>
      <TableCell>{date(item.expiresAt)}</TableCell>
      <TableCell>{date(item.lastUsedAt)}</TableCell>
      <TableCell className='text-right'>
        <div className='flex justify-end gap-1'>
          {confirming ? (
            <>
              <Button
                disabled={act.isPending}
                size='sm'
                variant={confirming === 'delete' ? 'destructive' : 'default'}
                onClick={() =>
                  act.mutate(
                    { keyId: item.id, action: confirming },
                    {
                      onSuccess: (answer) => {
                        setConfirming(null);
                        if (answer) onRotated(answer.secret);
                      },
                    },
                  )
                }
              >
                {t(`organizationKeys.confirm.${confirming}`)}
              </Button>
              <Button
                size='sm'
                variant='ghost'
                onClick={() => setConfirming(null)}
              >
                {t('organizationKeys.cancel')}
              </Button>
            </>
          ) : (
            <>
              <Button
                size='sm'
                variant='ghost'
                onClick={() => setConfirming('rotate')}
              >
                {t('organizationKeys.rotate')}
              </Button>
              <Button
                disabled={act.isPending}
                size='sm'
                variant='ghost'
                onClick={() =>
                  act.mutate({
                    keyId: item.id,
                    action: item.status === 'disabled' ? 'enable' : 'disable',
                  })
                }
              >
                {t(
                  item.status === 'disabled'
                    ? 'organizationKeys.enable'
                    : 'organizationKeys.disable',
                )}
              </Button>
              <Button
                size='sm'
                variant='ghost'
                onClick={() => setConfirming('delete')}
              >
                {t('organizationKeys.delete')}
              </Button>
            </>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

export default function OrganizationKeysPage(): ReactElement {
  const { t } = useTranslation();
  const keys = useOrganizationKeys();
  const [creating, setCreating] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);

  return (
    <PageContainer>
      <PageHeader
        title={t('organizationKeys.title')}
        description={t('organizationKeys.description')}
        actions={
          creating ? null : (
            <Button
              onClick={() => {
                setSecret(null);
                setCreating(true);
              }}
            >
              {t('organizationKeys.new')}
            </Button>
          )
        }
      />
      <div className='flex flex-col gap-4'>
        {secret ? (
          <Alert>
            <AlertDescription className='flex flex-col gap-2'>
              <span>{t('organizationKeys.secretOnce')}</span>
              <code className='break-all font-mono text-sm'>{secret}</code>
            </AlertDescription>
          </Alert>
        ) : null}
        {creating ? (
          <NewKey
            onClose={() => setCreating(false)}
            onCreated={(value) => {
              setSecret(value);
              setCreating(false);
            }}
          />
        ) : null}
        {keys.isLoading ? (
          <Skeleton className='h-40 w-full' />
        ) : keys.isError ? (
          <p className='text-sm text-destructive'>
            {t('organizationKeys.loadFailed')}
          </p>
        ) : (keys.data ?? []).length === 0 ? (
          <p className='text-sm text-muted-foreground'>
            {t('organizationKeys.empty')}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('organizationKeys.name')}</TableHead>
                <TableHead>{t('organizationKeys.statusLabel')}</TableHead>
                <TableHead>{t('organizationKeys.createdBy')}</TableHead>
                <TableHead>{t('organizationKeys.expiresAt')}</TableHead>
                <TableHead>{t('organizationKeys.lastUsedAt')}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.data?.map((item) => (
                <KeyRow key={item.id} item={item} onRotated={setSecret} />
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </PageContainer>
  );
}
