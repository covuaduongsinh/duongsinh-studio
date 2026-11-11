export interface RunnerResourceLimits {
  readonly memoryMax: string;
  readonly memorySwapMax: string;
  readonly cpuQuota: string;
  readonly memoryHigh?: string;
}

export interface ProxyAllowlistDomain {
  readonly domain: string;
  readonly description: string;
  readonly protocol: 'https' | 'http';
  readonly required: boolean;
}

export interface RunnerObservation {
  readonly sampleRunsCount: number;
  readonly medianDurationMs: number | null;
  readonly p95DurationMs: number | null;
  readonly estimatedPeakMemoryMb: number;
}

export interface RunnerConfigRecommendation {
  readonly sliceName: string;
  readonly currentLimits: RunnerResourceLimits;
  readonly proposedLimits: RunnerResourceLimits;
  readonly recommendedProxyAllowlist: readonly ProxyAllowlistDomain[];
  readonly observation: RunnerObservation;
}
