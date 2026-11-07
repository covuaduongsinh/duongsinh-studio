/** Settings → Budgets: limits of runs and tokens, what they used, and releasing one that stopped work. */
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import { useState, type FormEvent, type ReactElement } from 'react';

import { BudgetStateBadge } from '#components/budget-state';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { Alert, AlertDescription } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '#components/ui/card';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#components/ui/table';
import {
  budgetTitle,
  useBudgets,
  useBudgetScopeOptions,
  useReleaseBudget,
  useRemoveBudget,
  useSaveBudget,
  type BudgetPeriod,
  type BudgetScope,
} from '#hooks/use-budgets';

const SCOPES: readonly BudgetScope[] = ['global', 'project', 'agent'];
const PERIODS: readonly BudgetPeriod[] = ['day', 'month'];

const limitOf = (text: string): number | null =>
  text.trim() === '' ? null : Number(text);

function NewBudget(): ReactElement {
  const { t } = useTranslation();
  const options = useBudgetScopeOptions();
  const save = useSaveBudget();
  const [scope, setScope] = useState<BudgetScope>('global');
  const [scopeId, setScopeId] = useState('');
  const [period, setPeriod] = useState<BudgetPeriod>('month');
  const [runs, setRuns] = useState('');
  const [tokens, setTokens] = useState('');
  const targets =
    scope === 'project'
      ? options.data?.projects
      : scope === 'agent'
        ? options.data?.agents
        : undefined;
  const ready =
    (scope === 'global' || scopeId !== '') &&
    (runs.trim() !== '' || tokens.trim() !== '');

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    save.mutate(
      {
        scope,
        scopeId: scope === 'global' ? '' : scopeId,
        period,
        maxRuns: limitOf(runs),
        maxTokens: limitOf(tokens),
      },
      {
        onSuccess: () => {
          setRuns('');
          setTokens('');
        },
      },
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('budgets.newTitle')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'
          onSubmit={submit}
        >
          <div className='grid gap-2'>
            <Label htmlFor='budget-scope'>{t('budgets.scope')}</Label>
            <Select
              value={scope}
              items={SCOPES.map((value) => ({
                value,
                label: t(`budgets.scopes.${value}`),
              }))}
              onValueChange={(value) => {
                setScope(value as BudgetScope);
                setScopeId('');
              }}
            >
              <SelectTrigger id='budget-scope'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SCOPES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(`budgets.scopes.${value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {targets ? (
            <div className='grid gap-2'>
              <Label htmlFor='budget-target'>{t('budgets.target')}</Label>
              <Select
                value={scopeId}
                items={targets.map((target) => ({
                  value: target.id,
                  label: target.name,
                }))}
                onValueChange={(value) => setScopeId(value ?? '')}
              >
                <SelectTrigger id='budget-target'>
                  <SelectValue placeholder={t('budgets.targetPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {targets.map((target) => (
                    <SelectItem key={target.id} value={target.id}>
                      {target.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <div className='grid gap-2'>
            <Label htmlFor='budget-period'>{t('budgets.period')}</Label>
            <Select
              value={period}
              items={PERIODS.map((value) => ({
                value,
                label: t(`budgets.periods.${value}`),
              }))}
              onValueChange={(value) => setPeriod(value as BudgetPeriod)}
            >
              <SelectTrigger id='budget-period'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERIODS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(`budgets.periods.${value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className='grid gap-2'>
            <Label htmlFor='budget-runs'>{t('budgets.maxRuns')}</Label>
            <Input
              id='budget-runs'
              type='number'
              min={0}
              step={1}
              value={runs}
              onChange={(event) => setRuns(event.target.value)}
            />
          </div>
          <div className='grid gap-2'>
            <Label htmlFor='budget-tokens'>{t('budgets.maxTokens')}</Label>
            <Input
              id='budget-tokens'
              type='number'
              min={0}
              step={1}
              value={tokens}
              onChange={(event) => setTokens(event.target.value)}
            />
          </div>
          <div className='flex items-end'>
            <Button type='submit' disabled={!ready || save.isPending}>
              {t('budgets.save')}
            </Button>
          </div>
        </form>
        {save.isError ? (
          <Alert variant='destructive' className='mt-4'>
            <AlertDescription>{save.error.message}</AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default function BudgetsPage(): ReactElement {
  const { t } = useTranslation();
  const budgets = useBudgets();
  const release = useReleaseBudget();
  const remove = useRemoveBudget();
  const { can: canManage } = useCan({
    resource: { type: 'settings', id: 'studio.budgets' },
    action: 'manage',
  });
  const used = (value: number, limit: number | null): string =>
    limit === null
      ? value.toLocaleString()
      : `${value.toLocaleString()} / ${limit.toLocaleString()}`;

  return (
    <PageContainer>
      <PageHeader
        title={t('budgets.title')}
        description={t('budgets.description')}
      />
      <div className='grid gap-6'>
        {canManage ? <NewBudget /> : null}
        {budgets.isPending ? <Skeleton className='h-32 w-full' /> : null}
        {budgets.isError ? (
          <Alert variant='destructive'>
            <AlertDescription>{budgets.error.message}</AlertDescription>
          </Alert>
        ) : null}
        {budgets.data?.length === 0 ? (
          <p className='text-sm text-muted-foreground'>{t('budgets.empty')}</p>
        ) : null}
        {budgets.data && budgets.data.length > 0 ? (
          <Card>
            <CardContent className='pt-6'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('budgets.scope')}</TableHead>
                    <TableHead>{t('budgets.period')}</TableHead>
                    <TableHead>{t('budgets.runs')}</TableHead>
                    <TableHead>{t('budgets.tokens')}</TableHead>
                    <TableHead>{t('budgets.state')}</TableHead>
                    {canManage ? <TableHead /> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {budgets.data.map((budget) => (
                    <TableRow key={budget.id}>
                      <TableCell>{budgetTitle(t, budget)}</TableCell>
                      <TableCell>
                        {t(`budgets.periods.${budget.period}`)}
                      </TableCell>
                      <TableCell>
                        {used(budget.usedRuns, budget.maxRuns)}
                      </TableCell>
                      <TableCell>
                        {used(budget.usedTokens, budget.maxTokens)}
                      </TableCell>
                      <TableCell>
                        <BudgetStateBadge state={budget.state} />
                      </TableCell>
                      {canManage ? (
                        <TableCell className='space-x-2 text-right'>
                          {budget.state === 'blocked' ? (
                            <Button
                              size='sm'
                              disabled={release.isPending}
                              onClick={() => release.mutate(budget.id)}
                            >
                              {t('budgets.release')}
                            </Button>
                          ) : null}
                          <Button
                            size='sm'
                            variant='outline'
                            disabled={remove.isPending}
                            onClick={() => remove.mutate(budget.id)}
                          >
                            {t('budgets.remove')}
                          </Button>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </PageContainer>
  );
}
