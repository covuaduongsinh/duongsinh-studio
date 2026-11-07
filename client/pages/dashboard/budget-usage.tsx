/** On the dashboard: how far along each budget is, for who may see them. */
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { BudgetStateBadge } from '#components/budget-state';
import { Card, CardContent, CardHeader, CardTitle } from '#components/ui/card';
import { budgetShare, budgetTitle, useBudgets } from '#hooks/use-budgets';

export function BudgetUsage(): ReactElement | null {
  const { t } = useTranslation();
  const { can } = useCan({
    resource: { type: 'settings', id: 'studio.budgets' },
    action: 'read',
  });
  const budgets = useBudgets(can);
  if (!budgets.data?.length) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('budgets.usageTitle')}</CardTitle>
      </CardHeader>
      <CardContent className='grid gap-4'>
        {budgets.data.map((budget) => {
          const percent = Math.round(budgetShare(budget) * 100);
          const title = `${budgetTitle(t, budget)} · ${t(`budgets.periods.${budget.period}`)}`;
          return (
            <div key={budget.id} className='grid gap-1'>
              <div className='flex flex-wrap items-center justify-between gap-2 text-sm'>
                <span className='font-medium'>{title}</span>
                <span className='flex items-center gap-2 text-muted-foreground'>
                  {t('budgets.usedLine', {
                    runs: budget.usedRuns.toLocaleString(),
                    tokens: budget.usedTokens.toLocaleString(),
                    percent,
                  })}
                  <BudgetStateBadge state={budget.state} />
                </span>
              </div>
              <div
                role='meter'
                aria-label={title}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
                className='h-2 overflow-hidden rounded-full bg-muted'
              >
                <div
                  className={
                    budget.state === 'blocked'
                      ? 'h-full rounded-full bg-destructive'
                      : 'h-full rounded-full bg-primary'
                  }
                  style={{ width: `${percent}%` }}
                />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
