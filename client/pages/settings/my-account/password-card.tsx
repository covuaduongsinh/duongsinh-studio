import { useAuthentication } from '@nocobase/app-plugin-authentication/client';
import { useTranslation } from '@nocobase/i18n/client';
import { useState, type FormEvent, type ReactElement } from 'react';

import { Alert, AlertDescription } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '#components/ui/card';
import { Checkbox } from '#components/ui/checkbox';
import { Input } from '#components/ui/input';
import { Label } from '#components/ui/label';

/** The server's minimum (`Password must be at least 8 characters`); it still checks, and says why when it refuses. */
const MIN_LENGTH = 8;

export function PasswordCard(): ReactElement {
  const { t } = useTranslation();
  const { client } = useAuthentication();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [signOutOthers, setSignOutOthers] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [done, setDone] = useState(false);
  const mismatch = again !== '' && again !== next;
  const ready =
    current !== '' && next.length >= MIN_LENGTH && next === again && !busy;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError(undefined);
    setDone(false);
    try {
      const result = await client.changePassword({
        currentPassword: current,
        newPassword: next,
        revokeOtherSessions: signOutOthers,
      });
      if (result.error) {
        // What was typed stays, so a wrong current password is a retype of one field.
        setError(result.error.message || t('myAccount.failed'));
        return;
      }
      setCurrent('');
      setNext('');
      setAgain('');
      setDone(true);
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : t('myAccount.failed'),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('myAccount.password.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className='flex max-w-sm flex-col gap-4'
          onSubmit={(event) => void submit(event)}
        >
          <div className='grid gap-2'>
            <Label htmlFor='my-account-current'>
              {t('myAccount.password.current')}
            </Label>
            <Input
              id='my-account-current'
              type='password'
              autoComplete='current-password'
              value={current}
              disabled={busy}
              onChange={(event) => setCurrent(event.target.value)}
            />
          </div>
          <div className='grid gap-2'>
            <Label htmlFor='my-account-new'>
              {t('myAccount.password.new')}
            </Label>
            <Input
              id='my-account-new'
              type='password'
              autoComplete='new-password'
              value={next}
              disabled={busy}
              onChange={(event) => setNext(event.target.value)}
            />
            <p className='text-xs text-muted-foreground'>
              {t('myAccount.password.hint', { min: MIN_LENGTH })}
            </p>
          </div>
          <div className='grid gap-2'>
            <Label htmlFor='my-account-again'>
              {t('myAccount.password.again')}
            </Label>
            <Input
              id='my-account-again'
              type='password'
              autoComplete='new-password'
              value={again}
              disabled={busy}
              onChange={(event) => setAgain(event.target.value)}
            />
            {mismatch ? (
              <p className='text-xs text-destructive'>
                {t('myAccount.password.mismatch')}
              </p>
            ) : null}
          </div>
          <div className='flex items-center gap-2'>
            <Checkbox
              id='my-account-signout'
              checked={signOutOthers}
              disabled={busy}
              onCheckedChange={(checked) => setSignOutOthers(checked === true)}
            />
            <Label htmlFor='my-account-signout'>
              {t('myAccount.password.signOutOthers')}
            </Label>
          </div>
          {error ? (
            <Alert variant='destructive'>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          {done ? (
            <Alert>
              <AlertDescription>
                {t('myAccount.password.done')}
              </AlertDescription>
            </Alert>
          ) : null}
          <div>
            <Button type='submit' disabled={!ready}>
              {t('myAccount.password.submit')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
