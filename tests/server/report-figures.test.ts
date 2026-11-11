// The arithmetic of `reports/*` over fixed answers from the two plugins, so each figure is checked by hand.
import { describe, expect, it } from 'vitest';
import {
  createReportFigures,
  median,
  periodOf,
  type ReportScope,
  type ReportSources,
} from '../../server/reports/service.js';
import { durationText, percentText } from '../../server/reports/text.js';
import { sendWeeklyReport } from '../../server/reports/weekly.js';

const NOW = new Date('2026-11-07T10:00:00.000Z');
const scope = {
  viewer: { userId: 'u1' },
  caller: { userId: 'u1', allRuns: true },
  subjects: true,
} as unknown as ReportScope;

const run = (overrides: Record<string, unknown>) => ({
  id: 'r',
  agentId: 'a1',
  subjectKind: 'issue',
  subjectId: 'i1',
  status: 'completed',
  failureReason: null,
  retryOfRunId: null,
  createdAt: '2026-11-07T01:00:00.000Z',
  dispatchedAt: '2026-11-07T01:01:00.000Z',
  startedAt: '2026-11-07T01:01:00.000Z',
  finishedAt: '2026-11-07T01:05:00.000Z',
  ...overrides,
});

const totals = (over: Record<string, unknown> = {}) => ({
  key: 'total',
  name: null,
  runs: 0,
  durationMs: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  reasoningTokens: 0,
  cost: null,
  pricedRuns: 0,
  ...over,
});

const inWeek = (query: { from: Date }) =>
  query.from.toISOString().slice(0, 10) === '2026-11-01';

function sources(over: Partial<Record<string, unknown>> = {}): ReportSources {
  return {
    conn: () => {
      throw new Error('This figure reads no table.');
    },
    now: () => NOW,
    agentKind: 'agent',
    agentNames: async (ids: readonly string[]) =>
      new Map(ids.map((id) => [id, `Agent ${id}`])),
    reporting: {
      range: ({ from, to }: { from?: string; to?: string }) => ({
        from: from ?? '2026-10-09',
        to: to ?? '2026-11-07',
        start: new Date(`${from ?? '2026-10-09'}T00:00:00Z`),
        end: new Date('2026-11-08T00:00:00Z'),
      }),
      usage: async (_caller: unknown, query: { from: string }) =>
        query.from === '2026-11-01'
          ? {
              from: query.from,
              to: '2026-11-07',
              groupBy: 'day',
              rows: [],
              totals: totals({
                inputTokens: 900,
                outputTokens: 100,
                cost: { USD: 4 },
              }),
              daily: [
                {
                  day: '2026-11-02',
                  inputTokens: 900,
                  outputTokens: 100,
                  cacheReadTokens: 0,
                  cacheWriteTokens: 0,
                  cost: { USD: 4 },
                },
              ],
              unpricedModels: [],
            }
          : {
              from: query.from,
              to: '2026-10-31',
              groupBy: 'day',
              rows: [],
              totals: totals(),
              daily: [],
              unpricedModels: [],
            },
      runRecords: async (
        _caller: unknown,
        query: { start?: Date; subjects?: unknown },
      ) => {
        if (query.subjects)
          return [run({ id: 'x1' }), run({ id: 'x2' }), run({ id: 'x3' })];
        if (query.start?.toISOString().slice(0, 10) !== '2026-11-01') return [];
        return [
          run({ id: 'r1' }),
          run({
            id: 'r2',
            status: 'failed',
            dispatchedAt: '2026-11-07T01:03:00.000Z',
          }),
          run({
            id: 'r3',
            status: 'cancelled',
            createdAt: '2026-11-06T01:00:00.000Z',
            dispatchedAt: null,
          }),
          run({
            id: 'r4',
            status: 'running',
            subjectKind: 'conversation',
            dispatchedAt: '2026-11-07T01:05:00.000Z',
          }),
        ];
      },
    },
    issues: {
      flow: async (_viewer: unknown, query: { from: Date }) =>
        inWeek(query)
          ? {
              completed: [
                {
                  id: 'i1',
                  projectId: 'p1',
                  byAgent: true,
                  executorId: 'a1',
                  doneAt: '2026-11-02T10:00:00.000Z',
                  startedAt: '2026-11-02T08:00:00.000Z',
                },
                {
                  id: 'i2',
                  projectId: 'p2',
                  byAgent: false,
                  executorId: null,
                  doneAt: '2026-11-05T10:00:00.000Z',
                  startedAt: '2026-11-05T04:00:00.000Z',
                },
              ],
              returned: [
                {
                  id: 'i1',
                  projectId: 'p1',
                  byAgent: true,
                  at: '2026-11-02T09:00:00.000Z',
                  from: 'in_review',
                  to: 'in_progress',
                },
              ],
              agentBlocks: [
                {
                  issueId: 'i1',
                  agentId: 'a1',
                  runId: 'r1',
                  at: '2026-11-02T09:00:00.000Z',
                },
              ],
            }
          : { completed: [], returned: [], agentBlocks: [] },
      projects: async () => [
        {
          id: 'p1',
          name: 'App',
          status: 'active',
          total: 5,
          done: 2,
          blocked: 1,
        },
        {
          id: 'p2',
          name: 'Web',
          status: 'active',
          total: 1,
          done: 0,
          blocked: 0,
        },
      ],
      report: async () => ({
        adoption: {
          activityDays: ['2026-11-02', '2026-11-03', '2026-11-09'],
          issuesCreated: 3,
          commentsCreated: 4,
          memberIds: ['u1'],
        },
        aiShare: {
          deliveredTotal: 4,
          deliveredByAgent: 3,
          byAgent: { a1: 1, a2: 2 },
          daily: {},
          cycleMs: [],
        },
        trust: { reviewExits: 4, reviewPassed: 3, reworked: 1 },
      }),
      describe: async () => new Map(),
      attention: async () => ({
        blocked: { total: 0, items: [] },
        overdue: { total: 0, items: [] },
      }),
    },
    ...over,
  } as unknown as ReportSources;
}

describe('report figures', () => {
  it('reads a period as whole UTC days, against the same number before it', () => {
    const { current, previous } = periodOf(7, NOW);
    expect(current).toMatchObject({ from: '2026-11-01', to: '2026-11-07' });
    expect(previous).toMatchObject({ from: '2026-10-25', to: '2026-10-31' });
    expect(current.end.toISOString()).toBe('2026-11-08T00:00:00.000Z');
  });

  it('takes the nearest-rank median', () => {
    expect(median([])).toBeNull();
    expect(median([3])).toBe(3);
    expect(median([5, 1, 3, 9])).toBe(3);
  });

  it('adds up delivery, with a point per day over a week', async () => {
    const report = await createReportFigures(sources()).delivery(scope, 7);
    expect(report.current).toEqual({
      completed: 2,
      // Two and six hours, nearest rank.
      cycleTimeP50Ms: 2 * 3_600_000,
      agentShare: 0.5,
      costPerIssue: { USD: 2 },
      tokensPerIssue: 500,
    });
    expect(report.previous).toEqual({
      completed: 0,
      cycleTimeP50Ms: null,
      agentShare: null,
      costPerIssue: null,
      tokensPerIssue: null,
    });
    expect(report.currency).toBe('USD');
    expect(report.buckets).toHaveLength(7);
    expect(report.buckets[1]).toEqual({
      from: '2026-11-02',
      to: '2026-11-02',
      completed: 1,
      cycleTimeP50Ms: 2 * 3_600_000,
      agentShare: 1,
      costPerIssue: 4,
      tokensPerIssue: 1000,
    });
  });

  it('has no cost per issue while no run was priced (a subscription tool), and keeps the tokens', async () => {
    const base = sources();
    const unpriced = {
      ...base,
      reporting: {
        ...base.reporting,
        usage: async (caller: unknown, query: { from: string }) => {
          const usage = await base.reporting.usage(caller, query);
          return {
            ...usage,
            totals: { ...usage.totals, cost: null, pricedRuns: 0 },
            daily: usage.daily.map((day: Record<string, unknown>) => ({
              ...day,
              cost: null,
            })),
          };
        },
      },
    } as ReportSources;
    const report = await createReportFigures(unpriced).delivery(scope, 7);
    expect(report.current.costPerIssue).toBeNull();
    expect(report.current.tokensPerIssue).toBe(500);
    // The currency still reads, so the page can show a price once one is set.
    expect(report.currency).toBe('USD');
    expect(report.buckets.every((bucket) => bucket.costPerIssue === null)).toBe(
      true,
    );
  });

  it('has ten points over 30 and 90 days', async () => {
    const figures = createReportFigures(sources());
    const month = await figures.delivery(scope, 30);
    expect(month.buckets).toHaveLength(10);
    expect(month.buckets[0]).toMatchObject({
      from: '2026-10-09',
      to: '2026-10-11',
    });
    expect(month.buckets.at(-1)?.to).toBe('2026-11-07');
    expect((await figures.delivery(scope, 90)).buckets).toHaveLength(10);
  });

  it('leaves issue figures out for a caller without issues', async () => {
    const report = await createReportFigures(sources()).delivery(
      { ...scope, subjects: false },
      7,
    );
    expect(report.subjects).toBe(false);
    expect(report.current.completed).toBe(0);
  });

  it('reads how the agents did and the runs each day', async () => {
    const report = await createReportFigures(sources()).agents(scope, 7);
    expect(report.current).toEqual({
      runs: 4,
      // One completed, one failed; cancelled and open runs have no verdict yet.
      successRate: 0.5,
      // One sent back of the one issue agents completed.
      reworkRate: 1,
      // Three runs on two issues.
      runsPerIssue: 1.5,
      // One move to blocked over two issue runs that ended.
      interventionRate: 0.5,
      // 1, 3 and 5 minutes.
      queueWaitP50Ms: 3 * 60_000,
    });
    expect(report.previous.runs).toBe(0);
    expect(report.previous.successRate).toBeNull();
    expect(report.daily).toHaveLength(7);
    expect(report.daily.at(-1)).toEqual({
      day: '2026-11-07',
      runsCompleted: 1,
      runsFailed: 1,
      runsCancelled: 0,
      runsOpen: 1,
    });
    expect(report.daily.at(-2)?.runsCancelled).toBe(1);
  });

  it('gives each project its live issues and what it completed in the period', async () => {
    const report = await createReportFigures(sources()).projects(scope, 7);
    expect(report.projects).toEqual([
      {
        id: 'p1',
        name: 'App',
        total: 5,
        done: 2,
        completed: 1,
        cycleTimeP50Ms: 2 * 3_600_000,
        blocked: 1,
      },
      {
        id: 'p2',
        name: 'Web',
        total: 1,
        done: 0,
        completed: 1,
        cycleTimeP50Ms: 6 * 3_600_000,
        blocked: 0,
      },
    ]);
  });

  it('lets attention be empty without touching a table when there are no issues', async () => {
    const report = await createReportFigures(sources()).attention({
      ...scope,
      subjects: false,
    });
    expect(report).toMatchObject({
      subjects: false,
      blocked: { total: 0 },
      failedRuns: { total: 0 },
    });
  });

  it('words durations and shares for a generated message', () => {
    expect(durationText(null)).toBe('n/a');
    expect(durationText(45_000)).toBe('45s');
    expect(durationText(180_000)).toBe('3m');
    expect(durationText(7_200_000)).toBe('2h');
    expect(durationText(216_000_000)).toBe('2.5d');
    expect(percentText(null)).toBe('n/a');
    expect(percentText(0.904)).toBe('90%');
  });

  it("sends each owner one inbox notice with the week's figures", async () => {
    const sent: { to: string[]; key: string; body: string; path: string }[] =
      [];
    const figures = createReportFigures(sources());
    const attention = {
      subjects: true,
      blocked: { total: 2, items: [] },
      overdue: { total: 1, items: [] },
      reviewWaits: { total: 0, items: [] },
      failedRuns: { total: 3, items: [] },
    };
    const count = await sendWeeklyReport({
      figures: () => ({
        delivery: figures.delivery,
        agents: figures.agents,
        attention: async () => attention,
        learning: async () => ({
          from: '2026-11-01',
          to: '2026-11-07',
          days: 7,
          repeatedMistakes: [{ tag: 'security', count: 2 }],
          newLessonsCount: 3,
          secretFindingsCount: 1,
          activeSecretsCount: 1,
          topFailedCriteria: [{ criterionId: 'c1', count: 2 }],
          failuresByReason: { timeout: 1 },
        }),
      }),
      owners: async () => ['o1', 'o2'],
      scopeOf: async () => scope,
      translate: async () => (key, params) =>
        `${key} ${JSON.stringify(params)}`,
      notify: async (notice) => {
        sent.push(notice);
      },
    });
    expect(count).toBe(2);
    expect(sent.map((notice) => notice.to)).toEqual([['o1'], ['o2']]);
    expect(sent[0]?.key).toBe('ds-weekly-report-2026-11-07-o1');
    expect(sent[0]?.path).toBe('/dashboard');
    expect(sent[0]?.body).toContain('"completed":2');
    expect(sent[0]?.body).toContain('"share":"50%"');
    expect(sent[0]?.body).toContain('"blocked":2');
    expect(sent[0]?.body).toContain('"failed":3');
    expect(sent[0]?.body).toContain('"repeatedMistakes":"security (2)"');
    expect(sent[0]?.body).toContain('"newLessons":3');
    expect(sent[0]?.body).toContain('"secretFindings":1');
    expect(sent[0]?.body).toContain('"failedCriteria":1');
  });

  it('sends nothing when there is no owner', async () => {
    const count = await sendWeeklyReport({
      figures: () => createReportFigures(sources()),
      owners: async () => [],
      scopeOf: async () => scope,
      translate: async () => (key) => key,
      notify: async () => {
        throw new Error('Nobody to send to.');
      },
    });
    expect(count).toBe(0);
  });

  it('aggregates repeated mistakes, new lessons, secret findings, and failed criteria safely', async () => {
    const fakeDb = {
      selectFrom: (table: string) => ({
        select: () => ({
          where: () => ({
            where: () => ({
              where: () => ({
                execute: async () => {
                  if (table === 'dsReviewCriteriaChecks') {
                    return [
                      { criterionId: 'crit-ci' },
                      { criterionId: 'crit-ci' },
                      { criterionId: 'crit-test' },
                    ];
                  }
                  return [];
                },
              }),
              execute: async () => {
                if (table === 'dsLessons') {
                  return [
                    { tag: 'security' },
                    { tag: 'security' },
                    { tag: 'lint' },
                  ];
                }
                if (table === 'dsSecretFindings') {
                  return [{ status: 'active' }, { status: 'resolved' }];
                }
                return [];
              },
            }),
            execute: async () => [],
          }),
        }),
      }),
    };

    const s = sources({
      conn: () => ({ query: fakeDb }) as any,
    });

    const report = await createReportFigures(s).learning(scope, 7);
    expect(report.newLessonsCount).toBe(3);
    expect(report.repeatedMistakes).toEqual([{ tag: 'security', count: 2 }]);
    expect(report.secretFindingsCount).toBe(2);
    expect(report.activeSecretsCount).toBe(1);
    expect(report.topFailedCriteria).toEqual([
      { criterionId: 'crit-ci', count: 2 },
      { criterionId: 'crit-test', count: 1 },
    ]);
  });
});
