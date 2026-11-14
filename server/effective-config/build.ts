/**
 * What is in force for a project, and where each value comes from (plan T, T13): autopilot, the reaction rules, budgets,
 * the default tier and the skills attached. Read-only and pure, so each line's source is tested without a database.
 */

export type ConfigSource = 'default' | 'project' | 'system';

export interface ConfigRow {
  /** A stable key the page translates. */
  readonly key: string;
  readonly area: 'autopilot' | 'reactions' | 'budgets' | 'tier' | 'skills';
  readonly value: string;
  readonly source: ConfigSource;
}

export interface EffectiveConfigInput {
  readonly autopilot:
    | { readonly configured: false }
    | {
        readonly configured: true;
        readonly enabled: boolean;
        readonly autoMergeStages: boolean;
        readonly maxActiveIssues: number | null;
        readonly stallMinutes: number;
        readonly sensitivePolicy: string;
        readonly autoMergeOnGithub: boolean;
        readonly defaultTier: string;
      };
  readonly reactions: readonly {
    readonly event: string;
    readonly enabled: boolean;
    readonly maxAttempts: number;
    readonly maxPerIssue: number;
    readonly overridden: boolean;
  }[];
  readonly budgets: readonly {
    readonly scope: string;
    readonly scopeId: string;
    readonly period: string;
    readonly maxRuns: number | null;
    readonly maxTokens: number | null;
    readonly state: string;
  }[];
  readonly projectId: string;
  readonly skillCount: number;
}

const limits = (maxRuns: number | null, maxTokens: number | null): string =>
  [
    maxRuns === null ? null : `${maxRuns} runs`,
    maxTokens === null ? null : `${maxTokens} tokens`,
  ]
    .filter(Boolean)
    .join(' / ') || '-';

export function effectiveConfigRows(input: EffectiveConfigInput): ConfigRow[] {
  const rows: ConfigRow[] = [];
  const a = input.autopilot;
  const own = a.configured;
  const autopilot = (
    key: string,
    value: string | number | boolean | null,
  ): void => {
    rows.push({
      key: `autopilot.${key}`,
      area: 'autopilot',
      value: value === null ? '-' : String(value),
      source: own ? 'project' : 'default',
    });
  };
  autopilot('enabled', a.configured ? a.enabled : false);
  autopilot('autoMergeStages', a.configured ? a.autoMergeStages : true);
  autopilot('maxActiveIssues', a.configured ? a.maxActiveIssues : null);
  autopilot('stallMinutes', a.configured ? a.stallMinutes : 30);
  autopilot(
    'sensitivePolicy',
    a.configured ? a.sensitivePolicy : 'extraReview',
  );
  autopilot('autoMergeOnGithub', a.configured ? a.autoMergeOnGithub : false);
  for (const rule of input.reactions)
    rows.push({
      key: `reaction.${rule.event}`,
      area: 'reactions',
      value: rule.enabled ? `${rule.maxAttempts}/${rule.maxPerIssue}` : 'off',
      source: rule.overridden ? 'project' : 'default',
    });
  for (const budget of input.budgets) {
    if (budget.scope === 'agent') continue;
    if (budget.scope === 'project' && budget.scopeId !== input.projectId)
      continue;
    rows.push({
      key: `budget.${budget.scope}.${budget.period}`,
      area: 'budgets',
      value: `${limits(budget.maxRuns, budget.maxTokens)} (${budget.state})`,
      source: budget.scope === 'project' ? 'project' : 'system',
    });
  }
  rows.push({
    key: 'tier.default',
    area: 'tier',
    value: a.configured ? a.defaultTier : 'standard',
    source:
      a.configured && a.defaultTier !== 'standard' ? 'project' : 'default',
  });
  rows.push({
    key: 'skills.attached',
    area: 'skills',
    value: String(input.skillCount),
    source: 'project',
  });
  return rows;
}

export interface QuotaCard {
  /** Projects whose queued runs wait on a tool quota right now. */
  readonly waiting: {
    readonly projectId: string;
    readonly projectName: string;
    readonly activeUntil: string;
    readonly effectiveConcurrency: number;
  }[];
  /** Budgets at their warning level or past their limit. */
  readonly budgets: readonly {
    readonly id: string;
    readonly scope: string;
    readonly scopeId: string;
    readonly scopeName?: string | null;
    readonly period: string;
    readonly maxRuns: number | null;
    readonly maxTokens: number | null;
    readonly usedRuns: number;
    readonly usedTokens: number;
    readonly state: string;
  }[];
  readonly state: 'ok' | 'warning' | 'blocked';
}

export function quotaCard(input: {
  readonly throttles: readonly {
    readonly projectId: string;
    readonly projectName: string;
    readonly activeUntil: Date;
    readonly effectiveConcurrency: number;
  }[];
  readonly budgets: QuotaCard['budgets'];
  readonly now: Date;
}): QuotaCard {
  const waiting = input.throttles
    .filter((t) => t.activeUntil.getTime() > input.now.getTime())
    .map((t) => ({
      projectId: t.projectId,
      projectName: t.projectName,
      activeUntil: t.activeUntil.toISOString(),
      effectiveConcurrency: t.effectiveConcurrency,
    }));
  const budgets = input.budgets.filter(
    (b) => b.state === 'warning' || b.state === 'blocked',
  );
  return {
    waiting,
    budgets,
    state: budgets.some((b) => b.state === 'blocked')
      ? 'blocked'
      : budgets.length > 0 || waiting.length > 0
        ? 'warning'
        : 'ok',
  };
}
