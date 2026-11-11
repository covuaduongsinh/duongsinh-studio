import type { DatabaseConnection } from '@nocobase/db';
import type {
  ProxyAllowlistDomain,
  RunnerConfigRecommendation,
  RunnerObservation,
} from './types.js';

export const RUNNER_SLICE_NAME = 'user-1002.slice';

export const CURRENT_RUNNER_LIMITS = {
  memoryMax: '2.5GiB',
  memorySwapMax: '512MiB',
  cpuQuota: '300%',
} as const;

export const PROPOSED_RUNNER_LIMITS = {
  memoryHigh: '2.0GiB',
  memoryMax: '2.5GiB',
  memorySwapMax: '512MiB',
  cpuQuota: '300%',
} as const;

export const RECOMMENDED_PROXY_ALLOWLIST: readonly ProxyAllowlistDomain[] = [
  {
    domain: 'registry.npmjs.org',
    description: 'Cài đặt và cập nhật thư viện qua npm / pnpm',
    protocol: 'https',
    required: true,
  },
  {
    domain: 'github.com',
    description: 'Thao tác Git checkout, clone và fetch kho mã nguồn',
    protocol: 'https',
    required: true,
  },
  {
    domain: 'api.github.com',
    description: 'Truy vấn trạng thái commit, PR và checks qua GitHub API',
    protocol: 'https',
    required: true,
  },
  {
    domain: 'api.anthropic.com',
    description: 'Giao tiếp mô hình ngôn ngữ Opus/Sonnet phục vụ đánh giá và review',
    protocol: 'https',
    required: true,
  },
  {
    domain: 'open.larksuite.com',
    description: 'Đồng bộ dữ liệu bảng cơ sở từ Lark Base',
    protocol: 'https',
    required: false,
  },
  {
    domain: 'studio.dsc.edu.vn',
    description: 'Gọi API nội bộ của Dương Sinh Studio trên máy chủ',
    protocol: 'https',
    required: true,
  },
];

function percentile(sorted: readonly number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[idx] ?? null;
}

export async function observeRunnerMetrics(
  conn: DatabaseConnection,
  sampleLimit = 20,
): Promise<RunnerObservation> {
  const rows = await conn.query
    .selectFrom('agRuns')
    .select(['id', 'startedAt', 'finishedAt'])
    .where('finishedAt', 'is not', null)
    .where('startedAt', 'is not', null)
    .orderBy('finishedAt', 'desc')
    .limit(sampleLimit)
    .execute();

  const durations: number[] = [];
  for (const r of rows) {
    if (r.startedAt && r.finishedAt) {
      const start =
        r.startedAt instanceof Date
          ? r.startedAt.getTime()
          : typeof r.startedAt === 'string' || typeof r.startedAt === 'number'
            ? new Date(r.startedAt).getTime()
            : 0;
      const end =
        r.finishedAt instanceof Date
          ? r.finishedAt.getTime()
          : typeof r.finishedAt === 'string' || typeof r.finishedAt === 'number'
            ? new Date(r.finishedAt).getTime()
            : 0;
      const diff = end - start;
      if (diff > 0 && Number.isFinite(diff)) {
        durations.push(diff);
      }
    }
  }

  durations.sort((a, b) => a - b);

  return {
    sampleRunsCount: rows.length,
    medianDurationMs: percentile(durations, 50),
    p95DurationMs: percentile(durations, 95),
    // Peak memory estimated from typical heavy build/test suite runs (~1.8GB)
    estimatedPeakMemoryMb: 1850,
  };
}

export async function getRunnerRecommendations(
  conn: DatabaseConnection,
): Promise<RunnerConfigRecommendation> {
  const observation = await observeRunnerMetrics(conn);
  return {
    sliceName: RUNNER_SLICE_NAME,
    currentLimits: CURRENT_RUNNER_LIMITS,
    proposedLimits: PROPOSED_RUNNER_LIMITS,
    recommendedProxyAllowlist: RECOMMENDED_PROXY_ALLOWLIST,
    observation,
  };
}
