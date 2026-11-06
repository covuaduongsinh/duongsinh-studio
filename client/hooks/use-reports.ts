/** The dashboard's figures (`server/routes/reports.ts`). */
import { useApiClient } from '@nocobase/app-client';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

export type ReportDays = 7 | 30 | 90;

export interface DeliveryFigures {
  readonly completed: number;
  readonly cycleTimeP50Ms: number | null;
  readonly agentShare: number | null;
  readonly tokensPerIssue: number | null;
}

export interface DeliveryReport {
  readonly subjects: boolean;
  readonly current: DeliveryFigures;
  readonly previous: DeliveryFigures;
  readonly buckets: readonly (DeliveryFigures & {
    readonly from: string;
    readonly to: string;
  })[];
}

export interface AgentFigures {
  readonly runs: number;
  readonly successRate: number | null;
  readonly reworkRate: number | null;
  readonly runsPerIssue: number | null;
  readonly interventionRate: number | null;
  readonly queueWaitP50Ms: number | null;
}

export interface RunDay {
  readonly day: string;
  readonly runsCompleted: number;
  readonly runsFailed: number;
  readonly runsCancelled: number;
  readonly runsOpen: number;
}

export interface AgentsReport {
  readonly current: AgentFigures;
  readonly previous: AgentFigures;
  readonly daily: readonly RunDay[];
}

export interface ProjectFigures {
  readonly id: string;
  readonly name: string;
  readonly total: number;
  readonly done: number;
  readonly completed: number;
  readonly cycleTimeP50Ms: number | null;
  readonly blocked: number;
}

export interface ProjectsReport {
  readonly projects: readonly ProjectFigures[];
}

export interface AttentionIssue {
  readonly id: string;
  readonly identifier: string;
  readonly title: string;
  readonly since: string;
}

export interface AttentionReport {
  readonly blocked: {
    readonly total: number;
    readonly items: readonly AttentionIssue[];
  };
  readonly overdue: {
    readonly total: number;
    readonly items: readonly AttentionIssue[];
  };
  readonly reviewWaits: {
    readonly total: number;
    readonly items: readonly {
      readonly id: string;
      readonly repo: string;
      readonly number: number;
      readonly title: string;
      readonly url: string;
      readonly since: string;
    }[];
  };
  readonly failedRuns: {
    readonly total: number;
    readonly items: readonly {
      readonly id: string;
      readonly agentName: string | null;
      readonly finishedAt: string;
      readonly issue: {
        readonly id: string;
        readonly identifier: string;
        readonly title: string;
      };
    }[];
  };
}

/** What the page's refresh button invalidates. */
export const REPORTS_KEY = ['reports'] as const;

function useReport<T>(
  path: string,
  days: ReportDays | null,
): UseQueryResult<T> {
  const api = useApiClient();
  return useQuery({
    queryKey: [...REPORTS_KEY, path, days],
    queryFn: async ({ signal }) =>
      (
        await api.request<{ data: T }>({
          path,
          signal,
          ...(days === null ? {} : { query: { days } }),
        })
      ).data,
  });
}

export const useDeliveryReport = (days: ReportDays) =>
  useReport<DeliveryReport>('reports/delivery', days);
export const useAgentsReport = (days: ReportDays) =>
  useReport<AgentsReport>('reports/agents', days);
export const useProjectsReport = (days: ReportDays) =>
  useReport<ProjectsReport>('reports/projects', days);
export const useAttentionReport = () =>
  useReport<AttentionReport>('reports/attention', null);
