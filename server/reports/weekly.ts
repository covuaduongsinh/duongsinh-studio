import type { ReportFigures, ReportScope } from './service.js';
import { durationText, percentText } from './text.js';

export interface WeeklyReportDeps {
  readonly figures: () => Pick<
    ReportFigures,
    'delivery' | 'agents' | 'attention' | 'learning'
  >;
  readonly owners: () => Promise<readonly string[]>;
  readonly scopeOf: (userId: string) => Promise<ReportScope>;
  readonly translate: () => Promise<
    (key: string, params: Record<string, unknown>) => string
  >;
  readonly notify: (notice: {
    readonly to: string[];
    readonly key: string;
    readonly title: string;
    readonly body: string;
    readonly path: string;
  }) => Promise<void>;
}

/**
 * Monday morning's report to each owner, in their inbox: last week's figures as the dashboard shows them. One notice per
 * owner and week (`key`), so a job run twice sends once. Email joins it with the other outside notifications.
 */
export async function sendWeeklyReport(
  deps: WeeklyReportDeps,
): Promise<number> {
  const owners = await deps.owners();
  if (owners.length === 0) return 0;
  const t = await deps.translate();
  const figures = deps.figures();
  for (const owner of owners) {
    const scope = await deps.scopeOf(owner);
    const [delivery, agents, attention, learning] = await Promise.all([
      figures.delivery(scope, 7),
      figures.agents(scope, 7),
      figures.attention(scope),
      figures.learning ? figures.learning(scope, 7) : Promise.resolve(null),
    ]);
    const params = {
      from: delivery.from,
      to: delivery.to,
      completed: delivery.current.completed,
      completedBefore: delivery.previous.completed,
      cycle: durationText(delivery.current.cycleTimeP50Ms),
      share: percentText(delivery.current.agentShare),
      tokens:
        delivery.current.tokensPerIssue === null
          ? 'n/a'
          : Math.round(delivery.current.tokensPerIssue),
      success: percentText(agents.current.successRate),
      runs: agents.current.runs,
      blocked: attention.blocked.total,
      overdue: attention.overdue.total,
      reviews: attention.reviewWaits.total,
      failed: attention.failedRuns.total,
      repeatedMistakes: learning
        ? learning.repeatedMistakes
            .map((r) => `${r.tag} (${r.count})`)
            .join(', ') || '0'
        : '0',
      newLessons: learning ? learning.newLessonsCount : 0,
      secretFindings: learning ? learning.secretFindingsCount : 0,
      failedCriteria: learning ? learning.topFailedCriteria.length : 0,
    };
    await deps.notify({
      to: [owner],
      key: `ds-weekly-report-${delivery.to}-${owner}`,
      title: t('studioReports.weekly.title', params),
      body: t('studioReports.weekly.body', params),
      path: '/dashboard',
    });
  }
  return owners.length;
}
