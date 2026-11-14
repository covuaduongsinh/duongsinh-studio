// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  effectiveConfigRows,
  quotaCard,
} from '../../server/effective-config/build.js';

// T13 (plan T): one read-only list of what is in force for a project, each line saying where it comes from.
const reactions = [
  {
    event: 'ciFailed',
    enabled: true,
    maxAttempts: 3,
    maxPerIssue: 5,
    overridden: true,
  },
  {
    event: 'conflicts',
    enabled: true,
    maxAttempts: 1,
    maxPerIssue: 5,
    overridden: false,
  },
] as const;

describe('effectiveConfigRows', () => {
  const rows = effectiveConfigRows({
    autopilot: {
      configured: true,
      enabled: true,
      autoMergeStages: true,
      maxActiveIssues: 3,
      stallMinutes: 30,
      sensitivePolicy: 'extraReview',
      autoMergeOnGithub: false,
      defaultTier: 'small',
    },
    reactions: [...reactions],
    budgets: [
      {
        scope: 'global',
        scopeId: '',
        period: 'day',
        maxRuns: 50,
        maxTokens: null,
        state: 'ok',
      },
      {
        scope: 'project',
        scopeId: 'p1',
        period: 'month',
        maxRuns: null,
        maxTokens: 1000,
        state: 'warning',
      },
    ],
    projectId: 'p1',
    skillCount: 2,
  });
  const find = (key: string) => rows.find((row) => row.key === key)!;

  it('says "project" for what the project set and "default" for what it did not', () => {
    expect(find('autopilot.enabled')).toMatchObject({
      value: 'true',
      source: 'project',
    });
    expect(find('tier.default')).toMatchObject({
      value: 'small',
      source: 'project',
    });
    expect(find('reaction.ciFailed')).toMatchObject({ source: 'project' });
    expect(find('reaction.ciFailed').value).toContain('3');
    expect(find('reaction.conflicts')).toMatchObject({ source: 'default' });
  });

  it('shows a project budget as the project’s and a global one as the system’s', () => {
    expect(find('budget.project.month')).toMatchObject({ source: 'project' });
    expect(find('budget.global.day')).toMatchObject({ source: 'system' });
  });

  it('counts the skills attached to the project', () => {
    expect(find('skills.attached')).toMatchObject({
      value: '2',
      source: 'project',
    });
  });

  it('treats a project that never saved autopilot settings as all defaults', () => {
    const none = effectiveConfigRows({
      autopilot: { configured: false },
      reactions: [],
      budgets: [],
      projectId: 'p1',
      skillCount: 0,
    });
    expect(none.find((r) => r.key === 'autopilot.enabled')).toMatchObject({
      value: 'false',
      source: 'default',
    });
    expect(none.find((r) => r.key === 'tier.default')).toMatchObject({
      value: 'standard',
      source: 'default',
    });
  });
});

describe('quotaCard', () => {
  const now = new Date('2026-11-14T10:00:00Z');
  it('lists the projects waiting on a tool quota and the budgets that warn or block', () => {
    const card = quotaCard({
      throttles: [
        {
          projectId: 'p1',
          projectName: 'A',
          activeUntil: new Date('2026-11-14T11:00:00Z'),
          effectiveConcurrency: 1,
        },
        {
          projectId: 'p2',
          projectName: 'B',
          activeUntil: new Date('2026-11-14T09:00:00Z'),
          effectiveConcurrency: 1,
        },
      ],
      budgets: [
        {
          id: 'b1',
          scope: 'global',
          scopeId: '',
          period: 'day',
          maxRuns: 10,
          maxTokens: null,
          usedRuns: 9,
          usedTokens: 0,
          state: 'warning',
        },
        {
          id: 'b2',
          scope: 'agent',
          scopeId: 'a',
          period: 'day',
          maxRuns: 10,
          maxTokens: null,
          usedRuns: 1,
          usedTokens: 0,
          state: 'ok',
        },
      ],
      now,
    });
    expect(card.waiting.map((t) => t.projectId)).toEqual(['p1']);
    expect(card.budgets.map((b) => b.id)).toEqual(['b1']);
    expect(card.state).toBe('warning');
    expect(quotaCard({ throttles: [], budgets: [], now }).state).toBe('ok');
    expect(
      quotaCard({
        throttles: [],
        budgets: [
          {
            id: 'b',
            scope: 'global',
            scopeId: '',
            period: 'day',
            maxRuns: 1,
            maxTokens: null,
            usedRuns: 1,
            usedTokens: 0,
            state: 'blocked',
          },
        ],
        now,
      }).state,
    ).toBe('blocked');
  });
});
