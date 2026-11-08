import { useAuthentication } from '@nocobase/app-plugin-authentication/client';
import { useTranslation } from '@nocobase/i18n/client';
import { useState, type FormEvent, type ReactElement } from 'react';

import { Alert, AlertDescription } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '#components/ui/card';
import { Input } from '#components/ui/input';
import { Label } from '#components/ui/label';

/** Name is the one thing a person edits here; the email and username identify the account and are changed by an administrator. */
export function ProfileCard(): ReactElement {
  const { t } = useTranslation();
  const { client, session, refresh } = useAuthentication();
  const user = session?.user as
    { name: string; email: string; username?: string | null } | undefined;
  const [name, setName] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const current = name ?? user?.name ?? '';
  const changed = user !== undefined && current.trim() !== user.name;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!changed || current.trim() === '' || busy) return;
    setBusy(true);
    setError(undefined);
    setSaved(false);
    try {
      const result = await client.updateUser({ name: current.trim() });
      if (result.error) {
        setError(result.error.message || t('myAccount.failed'));
        return;
      }
      await refresh();
      setName(undefined);
      setSaved(true);
    } catch (next) {
      setError(next instanceof Error ? next.message : t('myAccount.failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('myAccount.profile.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className='flex flex-col gap-4'
          onSubmit={(event) => void submit(event)}
        >
          <dl className='grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_1fr]'>
            <dt className='text-muted-foreground'>
              {t('myAccount.profile.email')}
            </dt>
            <dd>{user?.email}</dd>
            {user?.username ? (
              <>
                <dt className='text-muted-foreground'>
                  {t('myAccount.profile.username')}
                </dt>
                <dd>{user.username}</dd>
              </>
            ) : null}
          </dl>
          <div className='grid max-w-sm gap-2'>
            <Label htmlFor='my-account-name'>
              {t('myAccount.profile.name')}
            </Label>
            <Input
              id='my-account-name'
              value={current}
              disabled={busy}
              onChange={(event) => {
                setName(event.target.value);
                setSaved(false);
              }}
            />
          </div>
          {error ? (
            <Alert variant='destructive'>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          {saved ? (
            <Alert>
              <AlertDescription>
                {t('myAccount.profile.saved')}
              </AlertDescription>
            </Alert>
          ) : null}
          <div>
            <Button
              type='submit'
              disabled={!changed || current.trim() === '' || busy}
            >
              {t('myAccount.profile.save')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
