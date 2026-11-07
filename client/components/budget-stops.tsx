/** On the inbox: the budgets that stopped work, for who may see them, with the release right there. */
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { Alert, AlertDescription, AlertTitle } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import { budgetTitle, useBudgets, useReleaseBudget } from '#hooks/use-budgets';

export function BudgetStops(): ReactElement | null {
  const { t } = useTranslation();
  const { can: canRead } = useCan({
    resource: { type: 'settings', id: 'studio.budgets' },
    action: 'read',
  });
  const { can: canManage } = useCan({
    resource: { type: 'settings', id: 'studio.budgets' },
    action: 'manage',
  });
  const budgets = useBudgets(canRead);
  const release = useReleaseBudget();
  const stopped = (budgets.data ?? []).filter(
    (budget) => budget.state === 'blocked',
  );
  if (stopped.length === 0) return null;
  return (
    <div className='grid gap-2 p-4 pb-0'>
      {stopped.map((budget) => (
        <Alert key={budget.id} variant='destructive'>
          <AlertTitle>
            {t('budgets.stoppedTitle', { scope: budgetTitle(t, budget) })}
          </AlertTitle>
          <AlertDescription className='flex flex-wrap items-center justify-between gap-2'>
            <span>{t('budgets.stoppedBody')}</span>
            {canManage ? (
              <Button
                size='sm'
                disabled={release.isPending}
                onClick={() => release.mutate(budget.id)}
              >
                {t('budgets.release')}
              </Button>
            ) : null}
          </AlertDescription>
        </Alert>
      ))}
    </div>
  );
}
