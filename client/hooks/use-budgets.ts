/** Budgets of runs and tokens and each person's outside notifications (`server/routes/budgets.ts`). */
import { useApiClient } from '@nocobase/app-client';
import type { useTranslation } from '@nocobase/i18n/client';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

export type BudgetScope = 'global' | 'project' | 'agent';
export type BudgetPeriod = 'day' | 'month';
export type BudgetState = 'ok' | 'warning' | 'blocked' | 'released';

export interface Budget {
  readonly id: string;
  readonly scope: BudgetScope;
  readonly scopeId: string;
  readonly scopeName: string | null;
  readonly period: BudgetPeriod;
  readonly maxRuns: number | null;
  readonly maxTokens: number | null;
  readonly usedRuns: number;
  readonly usedTokens: number;
  readonly state: BudgetState;
}

export interface BudgetInput {
  readonly scope: BudgetScope;
  readonly scopeId: string;
  readonly period: BudgetPeriod;
  readonly maxRuns: number | null;
  readonly maxTokens: number | null;
}

export interface BudgetScopeOption {
  readonly id: string;
  readonly name: string;
}

export interface BudgetScopeOptions {
  readonly projects: readonly BudgetScopeOption[];
  readonly agents: readonly BudgetScopeOption[];
}

export interface NotificationChoices {
  readonly emailDecisions: boolean;
  readonly emailReports: boolean;
  readonly pushDecisions: boolean;
  /** Whether the server has email turned on at all. */
  readonly emailAvailable: boolean;
}

/** What a budget is called wherever it shows. */
export function budgetTitle(
  t: ReturnType<typeof useTranslation>['t'],
  budget: Budget,
): string {
  return budget.scope === 'global'
    ? t('budgets.scopes.global')
    : (budget.scopeName ?? budget.scopeId);
}

const BUDGETS = ['budgets'] as const;
const CHOICES = ['notification-preferences'] as const;

/** How far along a budget is, 0 to 1: the nearer of its two limits. */
export function budgetShare(budget: Budget): number {
  const share = (used: number, limit: number | null): number =>
    limit === null ? 0 : limit <= 0 ? 1 : Math.min(used / limit, 1);
  return Math.max(
    share(budget.usedRuns, budget.maxRuns),
    share(budget.usedTokens, budget.maxTokens),
  );
}

export function useBudgets(enabled = true): UseQueryResult<readonly Budget[]> {
  const api = useApiClient();
  return useQuery({
    queryKey: BUDGETS,
    enabled,
    queryFn: async ({ signal }) =>
      (await api.request<{ data: Budget[] }>({ path: 'budgets', signal })).data,
  });
}

export function useBudgetScopeOptions(): UseQueryResult<BudgetScopeOptions> {
  const api = useApiClient();
  return useQuery({
    queryKey: [...BUDGETS, 'scope-options'],
    queryFn: async ({ signal }) =>
      (
        await api.request<{ data: BudgetScopeOptions }>({
          path: 'budgets/scopeOptions',
          signal,
        })
      ).data,
  });
}

export function useSaveBudget(): UseMutationResult<Budget, Error, BudgetInput> {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: BudgetInput) =>
      (
        await api.request<{ data: Budget }>({
          path: 'budgets',
          method: 'PUT',
          json: body,
        })
      ).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: BUDGETS }),
  });
}

export function useReleaseBudget(): UseMutationResult<Budget, Error, string> {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      (
        await api.request<{ data: Budget }>({
          path: `budgets/${id}/release`,
          method: 'POST',
          json: {},
        })
      ).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: BUDGETS }),
  });
}

export function useRemoveBudget(): UseMutationResult<void, Error, string> {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.request({ path: `budgets/${id}`, method: 'DELETE' });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: BUDGETS }),
  });
}

export function useNotificationChoices(): UseQueryResult<NotificationChoices> {
  const api = useApiClient();
  return useQuery({
    queryKey: CHOICES,
    queryFn: async ({ signal }) =>
      (
        await api.request<{ data: NotificationChoices }>({
          path: 'notificationPreferences',
          signal,
        })
      ).data,
  });
}

export function useSetNotificationChoice(): UseMutationResult<
  NotificationChoices,
  Error,
  Partial<Omit<NotificationChoices, 'emailAvailable'>>
> {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      body: Partial<Omit<NotificationChoices, 'emailAvailable'>>,
    ) =>
      (
        await api.request<{ data: NotificationChoices }>({
          path: 'notificationPreferences',
          method: 'PUT',
          json: body,
        })
      ).data,
    onSuccess: (choices) => queryClient.setQueryData(CHOICES, choices),
  });
}
