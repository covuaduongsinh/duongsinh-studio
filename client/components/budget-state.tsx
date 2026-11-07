/** How a budget's state reads everywhere it shows: in words, never in color alone. */
import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { Badge } from '#components/ui/badge';
import type { BudgetState } from '#hooks/use-budgets';

const VARIANT: Record<BudgetState, 'default' | 'secondary' | 'destructive'> = {
  ok: 'secondary',
  warning: 'default',
  blocked: 'destructive',
  released: 'default',
};

export function BudgetStateBadge({
  state,
}: {
  readonly state: BudgetState;
}): ReactElement {
  const { t } = useTranslation();
  return <Badge variant={VARIANT[state]}>{t(`budgets.states.${state}`)}</Badge>;
}
