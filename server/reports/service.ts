import type {
  ReportCaller,
  ReportRange,
  ReportService,
} from '@nocobase/app-plugin-agents/server/tokens';
import type {
  AttentionIssue,
  CompletedIssue,
  IssueFlow,
  IssueReport,
  IssueReports,
  Viewer,
} from '@nocobase/app-plugin-projects/server/tokens';
import type { DatabaseConnection } from '@nocobase/db';
import { str } from '../git/rows.js';

/**
 * The figures of the dashboard and of `reports/*`, worked out from what the agents plugin (`agents.reporting`) and the
 * projects plugin (`projects.reports`) already say, both limited to what the caller may see. This file adds them up; it
 * reads Studio's own tables only for what neither plugin knows: pull requests waiting and decisions taken.
 */

const DAY_MS = 86_400_000;
const WAIT_FOR_REVIEW_MS = 2 * DAY_MS;
const FAILED_RUN_WINDOW_MS = DAY_MS;
const ATTENTION_LIMIT = 5;
const OPEN_DECISION_SCAN = 1000;
const ISSUE_SUBJECT = 'issue';

/** Below these a figure reads as a warning in `reports/metrics`. */
export const METRIC_TARGETS = {
  aiShare: 0.5,
  reviewPassRate: 0.8,
  claimLatencyP50Ms: 30_000,
  lostRuns: 0,
  decisionResolveP50Ms: DAY_MS,
} as const;

export const REPORT_DAYS = [7, 30, 90] as const;
export type ReportDays = (typeof REPORT_DAYS)[number];

/** How long one point of `reports/delivery` lasts, so a period has at most ten points. */
const BUCKET_DAYS: Readonly<Record<ReportDays, number>> = {
  7: 1,
  30: 3,
  90: 9,
};

export type Costs = Readonly<Record<string, number>>;

/** Who is asking: what they see of issues (`viewer`), of runs (`caller`), and whether they may see issue figures at all. */
export interface ReportScope {
  readonly viewer: Viewer;
  readonly caller: ReportCaller;
  readonly subjects: boolean;
}

type UsageTotals = Awaited<ReturnType<ReportService['usage']>>['totals'];
type RunRecord = Awaited<ReturnType<ReportService['runRecords']>>[number];

/** What this service reads: the plugins' report services, and Studio's own tables. */
export interface ReportSources {
  readonly conn: () => DatabaseConnection;
  readonly now: () => Date;
  readonly agentKind: string;
  readonly reporting: ReportService;
  readonly issues: IssueReports;
  readonly agentNames: (
    ids: readonly string[],
  ) => Promise<ReadonlyMap<string, string>>;
}

/** `days` days up to and including today (UTC), and as many days before them. */
export function periodOf(
  days: ReportDays,
  now: Date,
): { readonly current: Window; readonly previous: Window } {
  const today = Date.parse(`${now.toISOString().slice(0, 10)}T00:00:00Z`);
  const end = new Date(today + DAY_MS);
  const start = new Date(end.getTime() - days * DAY_MS);
  const before = new Date(start.getTime() - days * DAY_MS);
  return { current: windowOf(start, end), previous: windowOf(before, start) };
}

export interface Window {
  readonly from: string;
  readonly to: string;
  readonly start: Date;
  /** Exclusive: the day after `to`. */
  readonly end: Date;
}

const dayOf = (at: number): string => new Date(at).toISOString().slice(0, 10);

function windowOf(start: Date, end: Date): Window {
  return {
    from: dayOf(start.getTime()),
    to: dayOf(end.getTime() - DAY_MS),
    start,
    end,
  };
}

/** The nearest-rank median, or null without values. */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length / 2) - 1] ?? null;
}

const rate = (part: number, whole: number): number | null =>
  whole > 0 ? part / whole : null;

const round6 = (value: number): number => Math.round(value * 1e6) / 1e6;

function perIssue(cost: Costs | null, issues: number): Costs | null {
  if (!cost || issues === 0) return null;
  return Object.fromEntries(
    Object.entries(cost).map(([currency, amount]) => [
      currency,
      round6(amount / issues),
    ]),
  );
}

const elapsed = (from: string, to: string): number =>
  Date.parse(to) - Date.parse(from);

const cycleTimes = (completed: readonly CompletedIssue[]): number[] =>
  completed.flatMap((issue) =>
    issue.startedAt ? [elapsed(issue.startedAt, issue.doneAt)] : [],
  );

const NO_FLOW: IssueFlow = { completed: [], returned: [], agentBlocks: [] };

export interface DeliveryFigures {
  readonly completed: number;
  readonly cycleTimeP50Ms: number | null;
  readonly agentShare: number | null;
  readonly costPerIssue: Costs | null;
  /** Input and output tokens per issue completed: Studio's agents run on subscriptions, so this is what a cost would be. */
  readonly tokensPerIssue: number | null;
}

function deliveryFigures(flow: IssueFlow, usage: UsageTotals): DeliveryFigures {
  const issues = flow.completed.length;
  return {
    completed: issues,
    cycleTimeP50Ms: median(cycleTimes(flow.completed)),
    agentShare: rate(
      flow.completed.filter((issue) => issue.byAgent).length,
      issues,
    ),
    costPerIssue: perIssue(usage.cost, issues),
    tokensPerIssue:
      issues > 0 ? (usage.inputTokens + usage.outputTokens) / issues : null,
  };
}

export interface AgentFigures {
  readonly runs: number;
  readonly successRate: number | null;
  readonly reworkRate: number | null;
  readonly runsPerIssue: number | null;
  readonly interventionRate: number | null;
  readonly queueWaitP50Ms: number | null;
}

export interface RepeatedMistake {
  readonly tag: string;
  readonly count: number;
}

export interface FailedCriterionStat {
  readonly criterionId: string;
  readonly count: number;
}

export interface LearningFigures {
  readonly from: string;
  readonly to: string;
  readonly days: ReportDays;
  readonly repeatedMistakes: readonly RepeatedMistake[];
  readonly newLessonsCount: number;
  readonly secretFindingsCount: number;
  readonly activeSecretsCount: number;
  readonly topFailedCriteria: readonly FailedCriterionStat[];
  readonly failuresByReason: Readonly<Record<string, number>>;
}

const STATUS_ENDED = new Set(['completed', 'failed']);

export function createReportFigures(sources: ReportSources) {
  const { reporting, issues } = sources;

  const flowIn = async (
    scope: ReportScope,
    window: Window,
    projectId?: string | null,
  ): Promise<IssueFlow> =>
    scope.subjects
      ? issues.flow(scope.viewer, {
          from: window.start,
          to: window.end,
          agentKind: sources.agentKind,
          ...(projectId ? { projectId } : {}),
        })
      : NO_FLOW;

  const usageIn = (scope: ReportScope, window: Window) =>
    reporting.usage(scope.caller, {
      from: window.from,
      to: window.to,
      groupBy: 'day',
    });

  const agentFiguresIn = async (
    scope: ReportScope,
    window: Window,
  ): Promise<{ figures: AgentFigures; runs: readonly RunRecord[] }> => {
    const [runs, flow] = await Promise.all([
      reporting.runRecords(scope.caller, {
        start: window.start,
        end: window.end,
        groupId: null,
      }),
      flowIn(scope, window),
    ]);
    const completed = runs.filter((run) => run.status === 'completed').length;
    const failed = runs.filter((run) => run.status === 'failed').length;
    const issueRunsEnded = runs.filter(
      (run) =>
        run.subjectKind === ISSUE_SUBJECT && STATUS_ENDED.has(run.status),
    ).length;
    const delivered = flow.completed.map((issue) => issue.id);
    const onDelivered =
      delivered.length > 0
        ? await reporting.runRecords(scope.caller, {
            subjects: { kind: ISSUE_SUBJECT, ids: delivered },
            groupId: null,
          })
        : [];
    return {
      runs,
      figures: {
        runs: runs.length,
        successRate: rate(completed, completed + failed),
        reworkRate: rate(
          flow.returned.filter((item) => item.byAgent).length,
          flow.completed.filter((item) => item.byAgent).length,
        ),
        runsPerIssue: rate(onDelivered.length, delivered.length),
        interventionRate: rate(flow.agentBlocks.length, issueRunsEnded),
        queueWaitP50Ms: median(
          runs.flatMap((run) =>
            run.dispatchedAt ? [elapsed(run.createdAt, run.dispatchedAt)] : [],
          ),
        ),
      },
    };
  };

  return {
    async delivery(scope: ReportScope, days: ReportDays) {
      const { current, previous } = periodOf(days, sources.now());
      const [flow, flowBefore, usage, usageBefore] = await Promise.all([
        flowIn(scope, current),
        flowIn(scope, previous),
        usageIn(scope, current),
        usageIn(scope, previous),
      ]);
      const currency =
        Object.keys(usage.totals.cost ?? usageBefore.totals.cost ?? {})[0] ??
        'USD';
      const step = BUCKET_DAYS[days] * DAY_MS;
      const buckets = [];
      for (
        let at = current.start.getTime();
        at < current.end.getTime();
        at += step
      ) {
        const from = dayOf(at);
        const to = dayOf(at + step - DAY_MS);
        const inBucket = (day: string): boolean => day >= from && day <= to;
        const completed = flow.completed.filter((issue) =>
          inBucket(issue.doneAt.slice(0, 10)),
        );
        const points = usage.daily.filter((point) => inBucket(point.day));
        const tokens = points.reduce(
          (sum, point) => sum + point.inputTokens + point.outputTokens,
          0,
        );
        const cost = points.reduce<number | null>((sum, point) => {
          const amount = point.cost?.[currency];
          return amount === undefined ? sum : (sum ?? 0) + amount;
        }, null);
        buckets.push({
          from,
          to,
          completed: completed.length,
          cycleTimeP50Ms: median(cycleTimes(completed)),
          agentShare: rate(
            completed.filter((issue) => issue.byAgent).length,
            completed.length,
          ),
          costPerIssue:
            cost !== null && completed.length > 0
              ? round6(cost / completed.length)
              : null,
          tokensPerIssue:
            completed.length > 0 ? tokens / completed.length : null,
        });
      }
      return {
        days,
        from: current.from,
        to: current.to,
        subjects: scope.subjects,
        currency,
        current: deliveryFigures(flow, usage.totals),
        previous: deliveryFigures(flowBefore, usageBefore.totals),
        buckets,
      };
    },

    async agents(scope: ReportScope, days: ReportDays) {
      const { current, previous } = periodOf(days, sources.now());
      const [now, before] = await Promise.all([
        agentFiguresIn(scope, current),
        agentFiguresIn(scope, previous),
      ]);
      const daily = new Map<
        string,
        {
          day: string;
          runsCompleted: number;
          runsFailed: number;
          runsCancelled: number;
          runsOpen: number;
        }
      >();
      for (
        let at = current.start.getTime();
        at < current.end.getTime();
        at += DAY_MS
      )
        daily.set(dayOf(at), {
          day: dayOf(at),
          runsCompleted: 0,
          runsFailed: 0,
          runsCancelled: 0,
          runsOpen: 0,
        });
      for (const run of now.runs) {
        const day = daily.get(run.createdAt.slice(0, 10));
        if (!day) continue;
        if (run.status === 'completed') day.runsCompleted += 1;
        else if (run.status === 'failed') day.runsFailed += 1;
        else if (run.status === 'cancelled') day.runsCancelled += 1;
        else day.runsOpen += 1;
      }
      return {
        days,
        from: current.from,
        to: current.to,
        subjects: scope.subjects,
        current: now.figures,
        previous: before.figures,
        daily: [...daily.values()],
      };
    },

    async projects(scope: ReportScope, days: ReportDays) {
      const { current } = periodOf(days, sources.now());
      const [projects, flow] = await Promise.all([
        scope.subjects ? issues.projects(scope.viewer) : Promise.resolve([]),
        flowIn(scope, current),
      ]);
      return {
        days,
        from: current.from,
        to: current.to,
        subjects: scope.subjects,
        projects: projects.map((project) => {
          const completed = flow.completed.filter(
            (issue) => issue.projectId === project.id,
          );
          return {
            id: project.id,
            name: project.name,
            total: project.total,
            done: project.done,
            completed: completed.length,
            cycleTimeP50Ms: median(cycleTimes(completed)),
            blocked: project.blocked,
          };
        }),
      };
    },

    async attention(scope: ReportScope) {
      const now = sources.now();
      const none = { total: 0, items: [] };
      if (!scope.subjects)
        return {
          subjects: false,
          blocked: none,
          overdue: none,
          reviewWaits: none,
          failedRuns: none,
        };
      const lists = await issues.attention(scope.viewer, {
        today: now.toISOString().slice(0, 10),
        limit: ATTENTION_LIMIT,
      });

      const pulls = await sources
        .conn()
        .query.selectFrom('dsPullRequests as pull')
        .innerJoin('dsRepositories as repo', 'repo.id', 'pull.repositoryId')
        .select([
          'pull.id as id',
          'pull.number as number',
          'pull.title as title',
          'pull.url as url',
          'pull.createdAt as createdAt',
          'pull.issueId as issueId',
          'repo.fullName as repo',
        ])
        .where('pull.state', '=', 'open')
        .innerJoin('pmIssues as issue', 'issue.id', 'pull.issueId')
        .where('issue.statusKey', 'not in', ['done', 'cancelled'])
        .where(
          'pull.createdAt',
          '<',
          new Date(now.getTime() - WAIT_FOR_REVIEW_MS),
        )
        .orderBy('pull.createdAt')
        .execute();
      const pullFacts = await issues.describe(
        scope.viewer,
        pulls.map((pull) => str(pull.issueId)),
      );
      const reviewWaits = pulls.flatMap((pull) => {
        const fact = pullFacts.get(str(pull.issueId));
        return fact?.visible
          ? [
              {
                id: str(pull.id),
                repo: str(pull.repo),
                number: Number(pull.number),
                title: str(pull.title),
                url: str(pull.url),
                since: new Date(pull.createdAt as string | Date).toISOString(),
                issue: { id: fact.id, identifier: fact.identifier },
              },
            ]
          : [];
      });

      const runs = await reporting.runRecords(scope.caller, {
        start: new Date(now.getTime() - FAILED_RUN_WINDOW_MS),
        end: now,
        groupId: null,
      });
      const retried = new Set(runs.map((run) => run.retryOfRunId));
      const failedOnIssues = runs.filter(
        (run) =>
          run.status === 'failed' &&
          run.subjectKind === ISSUE_SUBJECT &&
          !retried.has(run.id),
      );
      const decided = failedOnIssues.length
        ? new Set(
            (
              await sources
                .conn()
                .query.selectFrom('dsFailedRunDecisions')
                .select(['runId'])
                .where(
                  'runId',
                  'in',
                  failedOnIssues.map((run) => run.id),
                )
                .execute()
            ).map((row) => str(row.runId)),
          )
        : new Set<string>();
      const stillFailed = failedOnIssues
        .filter((run) => !decided.has(run.id))
        .sort((a, b) =>
          (b.finishedAt ?? b.createdAt).localeCompare(
            a.finishedAt ?? a.createdAt,
          ),
        );
      const [runFacts, names] = await Promise.all([
        issues.describe(
          scope.viewer,
          stillFailed.map((run) => run.subjectId),
        ),
        sources.agentNames([...new Set(stillFailed.map((run) => run.agentId))]),
      ]);
      const failedRuns = stillFailed.flatMap((run) => {
        const fact = runFacts.get(run.subjectId);
        return fact?.visible
          ? [
              {
                id: run.id,
                agentId: run.agentId,
                agentName: names.get(run.agentId) ?? null,
                failureReason: run.failureReason,
                finishedAt: run.finishedAt ?? run.createdAt,
                issue: {
                  id: fact.id,
                  identifier: fact.identifier,
                  title: fact.title,
                },
              },
            ]
          : [];
      });

      const brief = (item: AttentionIssue, since: string) => ({
        id: item.id,
        identifier: item.identifier,
        title: item.title,
        since,
      });
      return {
        subjects: true,
        blocked: {
          total: lists.blocked.total,
          items: lists.blocked.items.map((item) =>
            brief(item, item.lastActivityAt),
          ),
        },
        overdue: {
          total: lists.overdue.total,
          items: lists.overdue.items.map((item) =>
            brief(item, item.dueDate ?? ''),
          ),
        },
        reviewWaits: {
          total: reviewWaits.length,
          items: reviewWaits.slice(0, ATTENTION_LIMIT),
        },
        failedRuns: {
          total: failedRuns.length,
          items: failedRuns.slice(0, ATTENTION_LIMIT),
        },
      };
    },

    async metrics(
      scope: ReportScope,
      query: { from?: string; to?: string; projectId?: string },
    ) {
      const range = reporting.range({
        ...(query.from ? { from: query.from } : {}),
        ...(query.to ? { to: query.to } : {}),
      });
      const projectId = query.projectId ?? null;
      const [report, figures] = await Promise.all([
        scope.subjects
          ? issues.report(scope.viewer, {
              from: range.start,
              to: range.end,
              projectId,
              agentKind: sources.agentKind,
            })
          : Promise.resolve<IssueReport>({
              adoption: {
                activityDays: [],
                issuesCreated: 0,
                commentsCreated: 0,
                memberIds: [],
              },
              aiShare: {
                deliveredTotal: 0,
                deliveredByAgent: 0,
                byAgent: {},
                daily: {},
                cycleMs: [],
              },
              trust: { reviewExits: 0, reviewPassed: 0, reworked: 0 },
            }),
        reporting.runFigures(scope.caller, { ...range, groupId: projectId }),
      ]);
      const activeDays = [
        ...new Set([...report.adoption.activityDays, ...figures.activityDays]),
      ];
      const delivered = Object.entries(report.aiShare.byAgent);
      const names = await sources.agentNames(delivered.map(([id]) => id));
      const humanLoad = await humanLoadIn(scope, range, projectId);
      const share = rate(
        report.aiShare.deliveredByAgent,
        report.aiShare.deliveredTotal,
      );
      const reviewPassRate = rate(
        report.trust.reviewPassed,
        report.trust.reviewExits,
      );
      return {
        from: range.from,
        to: range.to,
        projectId,
        generatedAt: sources.now().toISOString(),
        subjects: scope.subjects,
        adoption: {
          activeWeeks: new Set(activeDays.map(weekOf)).size,
          activeDays: activeDays.length,
          issuesCreated: report.adoption.issuesCreated,
          commentsCreated: report.adoption.commentsCreated,
          activeMembers: new Set([
            ...report.adoption.memberIds,
            ...figures.actorIds,
          ]).size,
        },
        aiShare: {
          share,
          deliveredByAgent: report.aiShare.deliveredByAgent,
          deliveredTotal: report.aiShare.deliveredTotal,
          byAgent: delivered
            .map(([agentId, count]) => ({
              agentId,
              name: names.get(agentId) ?? null,
              count,
            }))
            .sort((a, b) => b.count - a.count),
        },
        trust: {
          reviewPassRate,
          reworkRate: rate(report.trust.reworked, report.trust.reviewExits),
        },
        reliability: {
          runs: figures.runs,
          completedRuns: figures.completedRuns,
          failedRuns: figures.failedRuns,
          failuresByReason: figures.failuresByReason,
          claimLatencyP50Ms: figures.claimLatencyP50Ms,
          claimLatencyP95Ms: figures.claimLatencyP95Ms,
          runDurationP50Ms: figures.runDurationP50Ms,
          lostRuns: figures.lostRuns,
        },
        cost: {
          inputTokens: figures.inputTokens,
          outputTokens: figures.outputTokens,
          estimatedCost: figures.estimatedCost,
          costPerDeliveredIssue: perIssue(
            figures.estimatedCost,
            report.aiShare.deliveredTotal,
          ),
          byAgent: figures.costByAgent,
        },
        humanLoad,
        statuses: {
          aiShare: atLeast(share, METRIC_TARGETS.aiShare),
          reviewPassRate: atLeast(
            reviewPassRate,
            METRIC_TARGETS.reviewPassRate,
          ),
          claimLatencyP50Ms: atMost(
            figures.claimLatencyP50Ms,
            METRIC_TARGETS.claimLatencyP50Ms,
          ),
          lostRuns: atMost(figures.lostRuns, METRIC_TARGETS.lostRuns),
          decisionResolveP50Ms: atMost(
            humanLoad.decisionResolveP50Ms,
            METRIC_TARGETS.decisionResolveP50Ms,
          ),
        },
      };
    },

    async learning(
      scope: ReportScope,
      days: ReportDays = 7,
    ): Promise<LearningFigures> {
      const now = sources.now();
      const window = periodOf(days, now).current;

      const lessons = await sources
        .conn()
        .query.selectFrom('dsLessons')
        .select(['tag'])
        .where('createdAt', '>=', window.start)
        .where('createdAt', '<', window.end)
        .execute()
        .catch(() => []);

      const tagCounts: Record<string, number> = {};
      for (const item of lessons) {
        const tag = str(item.tag);
        if (tag) {
          tagCounts[tag] = (tagCounts[tag] ?? 0) + 1;
        }
      }
      const repeatedMistakes = Object.entries(tagCounts)
        .filter(([_, count]) => count >= 2)
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => b.count - a.count);

      const newLessonsCount = lessons.length;

      const secretFindings = await sources
        .conn()
        .query.selectFrom('dsSecretFindings')
        .select(['status'])
        .where('createdAt', '>=', window.start)
        .where('createdAt', '<', window.end)
        .execute()
        .catch(() => []);

      const secretFindingsCount = secretFindings.length;
      const activeSecretsCount = secretFindings.filter(
        (sf) => sf.status === 'active',
      ).length;

      const unmetCriteria = await sources
        .conn()
        .query.selectFrom('dsReviewCriteriaChecks')
        .select(['criterionId'])
        .where('createdAt', '>=', window.start)
        .where('createdAt', '<', window.end)
        .where('passed', '=', false)
        .execute()
        .catch(() => []);

      const criteriaCounts: Record<string, number> = {};
      for (const item of unmetCriteria) {
        const cid = str(item.criterionId);
        if (cid) {
          criteriaCounts[cid] = (criteriaCounts[cid] ?? 0) + 1;
        }
      }
      const topFailedCriteria = Object.entries(criteriaCounts)
        .map(([criterionId, count]) => ({ criterionId, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      const runs = await reporting.runRecords(scope.caller, {
        start: window.start,
        end: window.end,
        groupId: null,
      });
      const failuresByReason: Record<string, number> = {};
      for (const r of runs) {
        if (r.status === 'failed') {
          const reason = r.failureReason || 'unknown';
          failuresByReason[reason] = (failuresByReason[reason] ?? 0) + 1;
        }
      }

      return {
        from: window.from,
        to: window.to,
        days,
        repeatedMistakes,
        newLessonsCount,
        secretFindingsCount,
        activeSecretsCount,
        topFailedCriteria,
        failuresByReason,
      };
    },
  };

  /**
   * The decisions Studio asks of people and stores: what to do about a failed run and whether to accept an issue handed
   * over. Open ones are read from the issues (`needsYou`, waiting for acceptance), as the inbox does.
   */
  async function humanLoadIn(
    scope: ReportScope,
    range: ReportRange,
    projectId: string | null,
  ) {
    const empty = {
      decisionsCreated: 0,
      decisionsResolved: 0,
      decisionResolveP50Ms: null,
      openDecisions: 0,
      byOutcome: {},
      byKind: {},
    };
    if (!scope.subjects) return empty;
    const conn = sources.conn();
    const [failed, handoffs, asked, open] = await Promise.all([
      conn.query
        .selectFrom('dsFailedRunDecisions as decision')
        .innerJoin('agRuns as run', 'run.id', 'decision.runId')
        .select([
          'decision.issueId as issueId',
          'decision.outcome as outcome',
          'decision.decidedAt as decidedAt',
          'run.finishedAt as askedAt',
        ])
        .where('decision.decidedAt', '>=', range.start)
        .where('decision.decidedAt', '<', range.end)
        .execute(),
      conn.query
        .selectFrom('dsOwnerHandoffDecisions as decision')
        .innerJoin(
          'pmActivities as activity',
          'activity.id',
          'decision.activityId',
        )
        .select([
          'decision.issueId as issueId',
          'decision.outcome as outcome',
          'decision.decidedAt as decidedAt',
          'activity.createdAt as askedAt',
        ])
        .where('decision.decidedAt', '>=', range.start)
        .where('decision.decidedAt', '<', range.end)
        .execute(),
      conn.query
        .selectFrom('pmActivities')
        .select(['issueId'])
        .where('action', '=', 'owner_changed')
        .where('createdAt', '>=', range.start)
        .where('createdAt', '<', range.end)
        .execute(),
      conn.query
        .selectFrom('pmIssues')
        .select(['id'])
        .where('deletedAt', 'is', null)
        .where((eb) =>
          eb.or([
            eb('needsYou', 'is not', null),
            eb('statusKey', '=', 'in_review'),
          ]),
        )
        .limit(OPEN_DECISION_SCAN)
        .execute(),
    ]);
    const failedAsked = await reporting.runRecords(scope.caller, {
      start: range.start,
      end: range.end,
      groupId: projectId,
    });
    const failedRuns = failedAsked.filter(
      (run) => run.status === 'failed' && run.subjectKind === ISSUE_SUBJECT,
    );
    const facts = await issues.describe(scope.viewer, [
      ...new Set([
        ...failed.map((row) => str(row.issueId)),
        ...handoffs.map((row) => str(row.issueId)),
        ...asked.map((row) => str(row.issueId)),
        ...open.map((row) => str(row.id)),
      ]),
    ]);
    const counts = (id: string): boolean => {
      const fact = facts.get(id);
      return (
        fact?.visible === true &&
        (projectId === null || fact.project?.id === projectId)
      );
    };
    const resolved = [
      ...failed.map((row) => ({ kind: 'failedRun', row })),
      ...handoffs.map((row) => ({ kind: 'ownerHandoff', row })),
    ].filter(({ row }) => counts(str(row.issueId)));
    const byOutcome: Record<string, number> = {};
    const byKind: Record<string, number> = {};
    for (const { kind, row } of resolved) {
      const outcome = str(row.outcome);
      byOutcome[outcome] = (byOutcome[outcome] ?? 0) + 1;
      byKind[kind] = (byKind[kind] ?? 0) + 1;
    }
    return {
      decisionsCreated:
        failedRuns.length +
        asked.filter((row) => counts(str(row.issueId))).length,
      decisionsResolved: resolved.length,
      decisionResolveP50Ms: median(
        resolved.flatMap(({ row }) =>
          row.askedAt
            ? [
                new Date(row.decidedAt as string | Date).getTime() -
                  new Date(row.askedAt as string | Date).getTime(),
              ]
            : [],
        ),
      ),
      openDecisions: open.filter((row) => counts(str(row.id))).length,
      byOutcome,
      byKind,
    };
  }
}

export type ReportFigures = ReturnType<typeof createReportFigures>;

const atLeast = (value: number | null, target: number) =>
  value === null
    ? ('n/a' as const)
    : value >= target
      ? ('ok' as const)
      : ('warn' as const);

const atMost = (value: number | null, target: number) =>
  value === null
    ? ('n/a' as const)
    : value <= target
      ? ('ok' as const)
      : ('warn' as const);

/** The Monday (UTC) of a day's week. */
function weekOf(day: string): string {
  const at = Date.parse(`${day}T00:00:00Z`);
  const weekday = (new Date(at).getUTCDay() + 6) % 7;
  return dayOf(at - weekday * DAY_MS);
}
