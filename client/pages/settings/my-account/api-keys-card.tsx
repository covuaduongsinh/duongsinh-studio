/**
 * Personal API keys: a key acts as its owner, with every permission they hold, so a script or the `ds-studio` CLI can call
 * Studio without a browser. The secret is shown once, when the key is made; afterwards only its name, its first
 * characters and its dates are known. A key cannot be edited: "rotate" makes a replacement with the same name first and
 * removes the old key only once that worked, so a failure never leaves the person without a key.
 */
import { copyText } from '@nocobase/app-client';
import {
  API_KEY_EXPIRY_CHOICES,
  expiryChoiceToSeconds,
  formatKeyHint,
  isExpired,
  type ApiKeyExpiryChoice,
  type ApiKeySummary,
} from '@nocobase/app-plugin-api-keys/client';
import { useAuthentication } from '@nocobase/app-plugin-authentication/client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CopyIcon, KeyRoundIcon, PlusIcon } from 'lucide-react';
import { useState, type FormEvent, type ReactElement } from 'react';

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
import { Alert, AlertDescription } from '#components/ui/alert';
import { Badge } from '#components/ui/badge';
import { Button } from '#components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '#components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#components/ui/dialog';
import { Input } from '#components/ui/input';
import { Label } from '#components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';
import { Skeleton } from '#components/ui/skeleton';

const KEYS = ['my-api-keys'] as const;
const DEFAULT_EXPIRY: ApiKeyExpiryChoice = '90';

/** What the dialog is for: a new key, or the replacement of an existing one (which is removed after). */
type Making = { readonly replaces: ApiKeySummary | null };

function useKeys() {
  const { client } = useAuthentication();
  return useQuery({
    queryKey: KEYS,
    queryFn: async () => {
      const result = await client.apiKey.list();
      if (result.error) throw new Error(result.error.message);
      return result.data?.apiKeys ?? [];
    },
  });
}

function MakeKeyDialog({
  making,
  onClose,
}: {
  readonly making: Making | null;
  readonly onClose: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const { client } = useAuthentication();
  const queryClient = useQueryClient();
  const [name, setName] = useState(making?.replaces?.name ?? '');
  const [expiry, setExpiry] = useState<ApiKeyExpiryChoice>(DEFAULT_EXPIRY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [secret, setSecret] = useState<string>();
  const [warning, setWarning] = useState<string>();
  const [copied, setCopied] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (name.trim() === '' || busy || secret) return;
    setBusy(true);
    setError(undefined);
    try {
      const seconds = expiryChoiceToSeconds(expiry);
      const made = await client.apiKey.create({
        name: name.trim(),
        ...(seconds === undefined ? {} : { expiresIn: seconds }),
      });
      if (made.error || !made.data) {
        // Nothing was made, so nothing is removed.
        setError(made.error?.message || t('myAccount.failed'));
        return;
      }
      setSecret(made.data.key);
      if (making?.replaces) {
        const removed = await client.apiKey.delete({
          keyId: making.replaces.id,
        });
        if (removed.error)
          setWarning(
            removed.error.message || t('myAccount.keys.oldNotRemoved'),
          );
      }
      await queryClient.invalidateQueries({ queryKey: KEYS });
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : t('myAccount.failed'),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => (!open && !busy ? onClose() : undefined)}
    >
      <DialogContent>
        <form
          className='flex flex-col gap-4'
          onSubmit={(event) => void submit(event)}
        >
          <DialogHeader>
            <DialogTitle>
              {making?.replaces
                ? t('myAccount.keys.rotateTitle', {
                    name: making.replaces.name,
                  })
                : t('myAccount.keys.newTitle')}
            </DialogTitle>
            <DialogDescription>
              {making?.replaces
                ? t('myAccount.keys.rotateHint')
                : t('myAccount.keys.newHint')}
            </DialogDescription>
          </DialogHeader>
          {secret ? (
            <div className='flex flex-col gap-2'>
              <Alert>
                <AlertDescription>
                  {t('myAccount.keys.onceWarning')}
                </AlertDescription>
              </Alert>
              <div className='flex items-center gap-2'>
                <code className='min-w-0 flex-1 rounded-md bg-muted px-3 py-2 text-sm break-all'>
                  {secret}
                </code>
                <Button
                  type='button'
                  variant='outline'
                  aria-label={t('myAccount.keys.copy')}
                  onClick={() => void copyText(secret).then(setCopied)}
                >
                  <CopyIcon />
                </Button>
              </div>
              {copied ? (
                <p className='text-xs text-muted-foreground'>
                  {t('myAccount.keys.copied')}
                </p>
              ) : null}
              {warning ? (
                <p role='alert' className='text-sm text-destructive'>
                  {warning}
                </p>
              ) : null}
            </div>
          ) : (
            <>
              <div className='grid gap-2'>
                <Label htmlFor='api-key-name'>{t('myAccount.keys.name')}</Label>
                <Input
                  id='api-key-name'
                  value={name}
                  disabled={busy}
                  placeholder={t('myAccount.keys.namePlaceholder')}
                  onChange={(event) => setName(event.target.value)}
                />
              </div>
              <div className='grid gap-2'>
                <Label htmlFor='api-key-expiry'>
                  {t('myAccount.keys.expiry')}
                </Label>
                <Select
                  value={expiry}
                  items={API_KEY_EXPIRY_CHOICES.map((choice) => ({
                    value: choice,
                    label: t(`myAccount.keys.expiryChoice.${choice}`),
                  }))}
                  disabled={busy}
                  onValueChange={(value) => setExpiry(value ?? DEFAULT_EXPIRY)}
                >
                  <SelectTrigger id='api-key-expiry'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {API_KEY_EXPIRY_CHOICES.map((choice) => (
                      <SelectItem key={choice} value={choice}>
                        {t(`myAccount.keys.expiryChoice.${choice}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
          {error ? (
            <p role='alert' className='text-sm text-destructive'>
              {error}
            </p>
          ) : null}
          <DialogFooter>
            {secret ? (
              <Button type='button' onClick={onClose}>
                {t('myAccount.keys.done')}
              </Button>
            ) : (
              <>
                <Button
                  type='button'
                  variant='ghost'
                  disabled={busy}
                  onClick={onClose}
                >
                  {t('myAccount.keys.cancel')}
                </Button>
                <Button type='submit' disabled={busy || name.trim() === ''}>
                  {t('myAccount.keys.create')}
                </Button>
              </>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function KeyRow({
  apiKey,
  onRotate,
  onDelete,
}: {
  readonly apiKey: ApiKeySummary;
  readonly onRotate: () => void;
  readonly onDelete: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const day = (value: string | Date) =>
    new Date(value).toLocaleDateString(locale);
  const expired = isExpired(apiKey.expiresAt);
  return (
    <li
      data-testid={`api-key-${apiKey.id}`}
      className='flex flex-wrap items-center gap-x-3 gap-y-1 py-3 text-sm'
    >
      <KeyRoundIcon className='size-4 text-muted-foreground' />
      <span className='font-medium'>{apiKey.name}</span>
      <code className='text-xs text-muted-foreground'>
        {formatKeyHint(apiKey)}
      </code>
      {expired ? (
        <Badge variant='destructive'>{t('myAccount.keys.expired')}</Badge>
      ) : null}
      <span className='text-muted-foreground'>
        {apiKey.expiresAt
          ? t('myAccount.keys.expiresOn', { date: day(apiKey.expiresAt) })
          : t('myAccount.keys.neverExpires')}
      </span>
      <span className='text-muted-foreground'>
        {apiKey.lastRequest
          ? t('myAccount.keys.lastUsed', { date: day(apiKey.lastRequest) })
          : t('myAccount.keys.neverUsed')}
      </span>
      <div className='ml-auto flex gap-1'>
        <Button size='sm' variant='outline' onClick={onRotate}>
          {t('myAccount.keys.rotate')}
        </Button>
        <Button size='sm' variant='outline' onClick={onDelete}>
          {t('myAccount.keys.delete')}
        </Button>
      </div>
    </li>
  );
}

export function ApiKeysCard(): ReactElement {
  const { t } = useTranslation();
  const { client } = useAuthentication();
  const queryClient = useQueryClient();
  const keys = useKeys();
  const [making, setMaking] = useState<Making | null>(null);
  const [removing, setRemoving] = useState<ApiKeySummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [removeError, setRemoveError] = useState<string>();

  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    setRemoveError(undefined);
    try {
      const result = await client.apiKey.delete({ keyId: removing.id });
      if (result.error) {
        setRemoveError(result.error.message || t('myAccount.failed'));
        return;
      }
      setRemoving(null);
      await queryClient.invalidateQueries({ queryKey: KEYS });
    } catch (failure) {
      setRemoveError(
        failure instanceof Error ? failure.message : t('myAccount.failed'),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader className='flex flex-row items-center justify-between gap-2'>
        <CardTitle>{t('myAccount.keys.title')}</CardTitle>
        <Button size='sm' onClick={() => setMaking({ replaces: null })}>
          <PlusIcon data-icon='inline-start' />
          {t('myAccount.keys.new')}
        </Button>
      </CardHeader>
      <CardContent className='flex flex-col gap-3'>
        <p className='text-sm text-muted-foreground'>
          {t('myAccount.keys.description')}
        </p>
        {keys.isPending ? <Skeleton className='h-16 w-full' /> : null}
        {keys.isError ? (
          <Alert variant='destructive'>
            <AlertDescription>{keys.error.message}</AlertDescription>
          </Alert>
        ) : null}
        {keys.data && keys.data.length === 0 ? (
          <p className='text-sm text-muted-foreground'>
            {t('myAccount.keys.empty')}
          </p>
        ) : null}
        {keys.data && keys.data.length > 0 ? (
          <ul className='divide-y'>
            {keys.data.map((apiKey) => (
              <KeyRow
                key={apiKey.id}
                apiKey={apiKey}
                onRotate={() => setMaking({ replaces: apiKey })}
                onDelete={() => {
                  setRemoveError(undefined);
                  setRemoving(apiKey);
                }}
              />
            ))}
          </ul>
        ) : null}
      </CardContent>
      {making ? (
        <MakeKeyDialog making={making} onClose={() => setMaking(null)} />
      ) : null}
      <AlertDialog
        open={removing !== null}
        onOpenChange={(open) =>
          !open && !busy ? setRemoving(null) : undefined
        }
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('myAccount.keys.deleteTitle', { name: removing?.name ?? '' })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('myAccount.keys.deleteHint')}
            </AlertDialogDescription>
            {removeError ? (
              <p role='alert' className='text-sm text-destructive'>
                {removeError}
              </p>
            ) : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>
              {t('myAccount.keys.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(event) => {
                event.preventDefault();
                void remove();
              }}
            >
              {t('myAccount.keys.deleteConfirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
