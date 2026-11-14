import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { Badge } from '#components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '#components/ui/card';
import { useQuota } from '#hooks/use-quota';

/** "Hạn mức": what holds work back, a tool's quota or a budget at its limit. Shown only when there is something to say (T13). */
export function QuotaCard(): ReactElement | null {
  const { t, i18n } = useTranslation();
  const quota = useQuota();
  const data = quota.data;
  if (!data || data.state === 'ok') return null;
  return (
    <Card>
      <section aria-label={t('quota.title')}>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            {t('quota.title')}
            <Badge
              variant={data.state === 'blocked' ? 'destructive' : 'secondary'}
            >
              {t(`quota.state.${data.state}`)}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className='flex flex-col gap-3 text-sm'>
          {data.waiting.length > 0 ? (
            <ul className='flex flex-col gap-1'>
              {data.waiting.map((item) => (
                <li key={item.projectId}>
                  {t('quota.waiting', {
                    project: item.projectName,
                    time: new Date(item.activeUntil).toLocaleTimeString(
                      i18n.language,
                      { hour: '2-digit', minute: '2-digit' },
                    ),
                  })}
                </li>
              ))}
            </ul>
          ) : null}
          {data.budgets.length > 0 ? (
            <ul className='flex flex-col gap-1'>
              {data.budgets.map((budget) => (
                <li key={budget.id}>
                  {t(`quota.budget.${budget.state}`, {
                    scope: t(`quota.scope.${budget.scope}`),
                    name: budget.scopeName ?? '',
                    period: t(`quota.period.${budget.period}`),
                    runs: `${budget.usedRuns}/${budget.maxRuns ?? '∞'}`,
                  })}
                </li>
              ))}
            </ul>
          ) : null}
        </CardContent>
      </section>
    </Card>
  );
}
