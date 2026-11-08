/**
 * Reset a person's password: an administrator sets a new one and hands it over (Studio sends no email until M5). The
 * password stays on screen after it is set so it can be copied; signing the person out of every session is on by default,
 * because a reset is usually done when the old password may be known to someone else. The users plugin checks
 * `reset-password` and `revoke-sessions` again on the server and refuses a password that is too short or too long.
 */
import {
  copyText,
  useApiClient,
  useSubmission,
  useToaster,
} from '@nocobase/app-client';
import { UsersClient } from '@nocobase/app-plugin-users/client/user-client';
import { useTranslation } from '@nocobase/i18n/client';
import { CopyIcon, DicesIcon, KeyRoundIcon } from 'lucide-react';
import { useMemo, useState, type FormEvent, type ReactElement } from 'react';

import { Button } from '#components/ui/button';
import { Checkbox } from '#components/ui/checkbox';
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

import { useUserPermission } from './hooks.js';

/** The shortest password offered; the server's own limits still apply. */
const MIN_LENGTH = 8;
const GENERATED_LENGTH = 16;
/** No characters that look alike (0/O, 1/l/I), so a password read aloud or retyped survives. */
const ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generatePassword(): string {
  const bytes = new Uint32Array(GENERATED_LENGTH);
  crypto.getRandomValues(bytes);
  // 2^32 is not a multiple of the alphabet size, so a rejected tail keeps every character equally likely.
  const limit = Math.floor(2 ** 32 / ALPHABET.length) * ALPHABET.length;
  let out = '';
  for (const byte of bytes) {
    let value = byte;
    while (value >= limit)
      value = crypto.getRandomValues(new Uint32Array(1))[0]!;
    out += ALPHABET[value % ALPHABET.length];
  }
  return out;
}

export function ResetPasswordAction({
  user,
}: {
  readonly user: { readonly id: string; readonly name: string };
}): ReactElement | null {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const client = useMemo(() => new UsersClient(api), [api]);
  const mayReset = useUserPermission('reset-password', user.id);
  const mayRevoke = useUserPermission('revoke-sessions', user.id);
  const submission = useSubmission();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [signOut, setSignOut] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [done, setDone] = useState(false);
  if (!mayReset) return null;

  const close = () => {
    if (busy) return;
    setOpen(false);
    setPassword('');
    setError(undefined);
    setDone(false);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (password.length < MIN_LENGTH || busy || done) return;
    setBusy(true);
    setError(undefined);
    try {
      const outcome = await submission.run(
        { action: 'resetPassword', id: user.id },
        async (key) => {
          await client.resetPassword(user.id, password, key);
          return true;
        },
      );
      if (!outcome) return;
      // Only after the new password is set: a failed reset must not log anyone out.
      if (signOut && mayRevoke)
        await submission.run({ action: 'revokeSessions', id: user.id }, (key) =>
          client.revokeSessions(user.id, key),
        );
      toaster.show({
        type: 'success',
        title: t('resetPassword.saved', { name: user.name }),
      });
      setDone(true);
    } catch (next) {
      setError(
        next instanceof Error && next.message
          ? next.message
          : t('resetPassword.failed'),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button variant='outline' size='xs' onClick={() => setOpen(true)}>
        <KeyRoundIcon data-icon='inline-start' />
        {t('resetPassword.button')}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => (next ? setOpen(true) : close())}
      >
        <DialogContent>
          <form
            className='flex flex-col gap-4'
            onSubmit={(event) => void submit(event)}
          >
            <DialogHeader>
              <DialogTitle>
                {t('resetPassword.title', { name: user.name })}
              </DialogTitle>
              <DialogDescription>
                {t('resetPassword.description')}
              </DialogDescription>
            </DialogHeader>
            <div className='grid gap-2'>
              <Label htmlFor={`reset-password-${user.id}`}>
                {t('resetPassword.label')}
              </Label>
              <div className='flex gap-2'>
                <Input
                  id={`reset-password-${user.id}`}
                  autoComplete='off'
                  spellCheck={false}
                  value={password}
                  disabled={busy || done}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <Button
                  type='button'
                  variant='outline'
                  disabled={busy || done}
                  onClick={() => setPassword(generatePassword())}
                >
                  <DicesIcon data-icon='inline-start' />
                  {t('resetPassword.generate')}
                </Button>
                <Button
                  type='button'
                  variant='outline'
                  aria-label={t('resetPassword.copy')}
                  disabled={password === ''}
                  onClick={() => {
                    void copyText(password).then((copied) => {
                      if (!copied)
                        toaster.show({
                          type: 'error',
                          title: t('resetPassword.copyFailed'),
                        });
                    });
                  }}
                >
                  <CopyIcon />
                </Button>
              </div>
              <p className='text-xs text-muted-foreground'>
                {t('resetPassword.hint', { min: MIN_LENGTH })}
              </p>
            </div>
            {mayRevoke ? (
              <div className='flex items-center gap-2'>
                <Checkbox
                  id={`reset-signout-${user.id}`}
                  checked={signOut}
                  disabled={busy || done}
                  onCheckedChange={(checked) => setSignOut(checked === true)}
                />
                <Label htmlFor={`reset-signout-${user.id}`}>
                  {t('resetPassword.signOut')}
                </Label>
              </div>
            ) : null}
            {error ? (
              <p role='alert' className='text-sm text-destructive'>
                {error}
              </p>
            ) : null}
            {done ? (
              <p className='text-sm'>{t('resetPassword.handOver')}</p>
            ) : null}
            <DialogFooter>
              <Button
                type='button'
                variant='ghost'
                disabled={busy}
                onClick={close}
              >
                {done ? t('resetPassword.close') : t('resetPassword.cancel')}
              </Button>
              {done ? null : (
                <Button
                  type='submit'
                  disabled={busy || password.length < MIN_LENGTH}
                >
                  {busy ? t('resetPassword.saving') : t('resetPassword.submit')}
                </Button>
              )}
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
