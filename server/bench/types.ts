import type { CiState } from '../git/pull-state.js';

export interface BenchCriterion {
  readonly text: string;
  readonly checkKind: 'command' | 'test' | 'ci' | 'human';
  readonly checkValue?: string;
}

export interface BenchGradingContext {
  readonly issue: {
    readonly id: string;
    readonly identifier: string;
    readonly statusKey: string;
    readonly needsYou?: string | null;
  };
  readonly criteria?: readonly {
    readonly id: string;
    readonly text: string;
    readonly checkKind: string;
    readonly checkValue?: string | null;
  }[];
  readonly verifications?: readonly {
    readonly id: string;
    readonly result: 'passed' | 'failed';
    readonly headSha: string;
    readonly attempt: number;
    readonly items: readonly {
      readonly criterionId: string;
      readonly result: 'pass' | 'fail' | 'pending';
      readonly exitCode?: number | null;
      readonly output?: string | null;
    }[];
  }[];
  readonly reviews?: readonly {
    readonly id: string;
    readonly verdict: 'approve' | 'request_changes' | 'reject';
    readonly headSha: string;
    readonly criteriaChecks?: readonly {
      readonly criterionId: string;
      readonly passed: boolean;
      readonly notes?: string | null;
    }[];
  }[];
  readonly pullRequest?: {
    readonly id: string;
    readonly number: number;
    readonly state: 'open' | 'closed' | 'merged';
    readonly ciState: CiState;
    readonly checks: readonly {
      readonly name: string;
      readonly outcome: 'success' | 'failure' | 'pending';
    }[];
  };
  readonly changedFiles?: readonly string[];
  readonly secretFindings?: readonly {
    readonly patternKey: string;
  }[];
  readonly activities?: readonly {
    readonly action: string;
    readonly comment?: string | null;
    readonly createdAt: string;
  }[];
  readonly runs?: readonly {
    readonly id: string;
    readonly status: string;
    readonly outputTokens?: number | null;
    readonly totalTokens?: number | null;
  }[];
}

export interface BenchGradeResult {
  readonly passed: boolean;
  readonly reason: string;
}

export interface BenchTaskDefinition {
  readonly key: string;
  readonly title: string;
  readonly description: string;
  readonly criteria: readonly BenchCriterion[];
  readonly baseBranch: string;
  readonly grade: (
    ctx: BenchGradingContext,
  ) => Promise<BenchGradeResult> | BenchGradeResult;
}

export interface BenchRunView {
  readonly id: string;
  readonly set: string;
  readonly studioCommit: string;
  readonly model: string;
  readonly skillVersions: Record<string, number>;
  readonly startedAt: string;
  readonly finishedAt: string | null;
  readonly status: 'running' | 'completed' | 'failed' | 'aborted';
  readonly trigger: 'manual' | 'scheduled';
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly totalTasks?: number;
  readonly passedTasks?: number;
  readonly passRate?: number;
  readonly results?: readonly BenchResultView[];
}

export interface BenchResultView {
  readonly id: string;
  readonly benchRunId: string;
  readonly taskKey: string;
  readonly issueId: string | null;
  readonly result: 'passed' | 'failed' | 'timeout' | 'running';
  readonly reason: string | null;
  readonly runs: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
  readonly returns: number;
  readonly verifyAttempts: number;
  readonly durationMs: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface BenchStatusView {
  readonly currentMonthRuns: number;
  readonly maxMonthlyRuns: number;
  readonly isLimitReached: boolean;
  readonly lastRun: BenchRunView | null;
  readonly passRate: number | null;
}
