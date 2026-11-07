/** Settings → My notifications: what each person wants sent outside Studio, and this device's web push. */
import { PushPreferences } from '@nocobase/app-plugin-notification-web-push/client';
import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { Alert, AlertDescription } from '#components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '#components/ui/card';
import { Label } from '#components/ui/label';
import { Skeleton } from '#components/ui/skeleton';
import { Switch } from '#components/ui/switch';
import {
  useNotificationChoices,
  useSetNotificationChoice,
  type NotificationChoices,
} from '#hooks/use-budgets';

type Choice = Exclude<keyof NotificationChoices, 'emailAvailable'>;

export default function MyNotificationsPage(): ReactElement {
  const { t } = useTranslation();
  const choices = useNotificationChoices();
  const set = useSetNotificationChoice();

  const row = (choice: Choice, disabled = false): ReactElement => (
    <div key={choice} className='flex items-center justify-between gap-4'>
      <Label htmlFor={`choice-${choice}`} className='font-normal'>
        {t(`myNotifications.${choice}`)}
      </Label>
      <Switch
        id={`choice-${choice}`}
        checked={choices.data?.[choice] ?? false}
        disabled={disabled || set.isPending}
        onCheckedChange={(checked) => set.mutate({ [choice]: checked })}
      />
    </div>
  );

  return (
    <PageContainer>
      <PageHeader
        title={t('myNotifications.title')}
        description={t('myNotifications.description')}
      />
      <div className='grid gap-6'>
        {choices.isPending ? <Skeleton className='h-32 w-full' /> : null}
        {choices.isError ? (
          <Alert variant='destructive'>
            <AlertDescription>{choices.error.message}</AlertDescription>
          </Alert>
        ) : null}
        {choices.data ? (
          <>
            <Card>
              <CardHeader>
                <CardTitle>{t('myNotifications.email')}</CardTitle>
              </CardHeader>
              <CardContent className='grid gap-4'>
                {choices.data.emailAvailable ? null : (
                  <Alert>
                    <AlertDescription>
                      {t('myNotifications.emailOff')}
                    </AlertDescription>
                  </Alert>
                )}
                {row('emailDecisions', !choices.data.emailAvailable)}
                {row('emailReports', !choices.data.emailAvailable)}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t('myNotifications.push')}</CardTitle>
              </CardHeader>
              <CardContent className='grid gap-4'>
                {row('pushDecisions')}
                <PushPreferences />
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>
    </PageContainer>
  );
}
