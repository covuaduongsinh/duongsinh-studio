/**
 * The "Server" card of the Releases page (plan V, V5.1b): how much memory the server has free against what an App needs to
 * start, and which NocoBase 3 Apps Studio runs now. Shown to whoever the server lets read it; a refusal or a failure leaves
 * the card out rather than the page broken.
 */
import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { Badge } from '#components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '#components/ui/card';
import { useHostLoad } from '#hooks/use-releases';

export function HostCard(): ReactElement | null {
  const { t } = useTranslation();
  const load = useHostLoad();
  const data = load.data;
  if (!data) return null;
  const { availableMb, minAvailableMb, appMemoryLimitMb, runningApps } = data;
  const low = availableMb !== null && availableMb < minAvailableMb;
  return (
    <Card size='sm' data-testid='host-card'>
      <CardHeader>
        <CardTitle>{t('releases.host.title')}</CardTitle>
      </CardHeader>
      <CardContent className='grid gap-3 sm:grid-cols-2'>
        <div className='flex min-w-0 flex-col gap-1'>
          <span className='text-xs text-muted-foreground'>
            {t('releases.host.memory')}
          </span>
          <span className='flex flex-wrap items-center gap-2'>
            <span className='text-lg font-medium tabular-nums'>
              {availableMb === null
                ? t('releases.host.unknown')
                : t('releases.host.megabytes', { count: availableMb })}
            </span>
            {low ? (
              <Badge variant='destructive'>{t('releases.host.low')}</Badge>
            ) : null}
          </span>
          <span className='text-xs text-muted-foreground'>
            {t('releases.host.needs', { count: minAvailableMb })}
          </span>
        </div>
        <div className='flex min-w-0 flex-col gap-1'>
          <span className='text-xs text-muted-foreground'>
            {t('releases.host.apps')}
          </span>
          <span className='text-lg font-medium tabular-nums'>
            {runningApps.length}
          </span>
          {runningApps.length === 0 ? (
            <span className='text-xs text-muted-foreground'>
              {t('releases.host.noApps')}
            </span>
          ) : (
            <ul className='flex min-w-0 flex-col gap-0.5 text-xs'>
              {runningApps.map((item) => (
                <li key={item.appId} className='flex min-w-0 gap-2'>
                  <span className='truncate font-mono'>{item.appId}</span>
                  {item.version ? (
                    <span className='font-mono text-muted-foreground'>
                      {item.version}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          <span className='text-xs text-muted-foreground'>
            {t('releases.host.perApp', { count: appMemoryLimitMb })}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
