import { describe, expect } from 'vitest';
import { createAppTest } from '@nocobase/app-testing/server';
import {
  signIn,
  DEFAULT_ADMIN_CREDENTIALS,
} from '@nocobase/app-plugin-authentication/testing';
import { databaseManagerToken } from '@nocobase/db';
import { createStandaloneServer } from '../../server/standalone.js';
import {
  observeRunnerMetrics,
  getRunnerRecommendations,
  RUNNER_SLICE_NAME,
} from '../../server/runner/service.js';

const test = createAppTest({
  createServer: createStandaloneServer,
  config: {
    app: { publicOrigin: 'http://localhost' },
    auth: { secret: 'test-auth-secret-at-least-32-characters' },
    secrets: {
      keys: [
        { version: 1, key: 'test-secrets-key-at-least-32-characters-long' },
      ],
    },
  },
});

describe('H3b: Runner Resource Observation and Recommendations', () => {
  test(
    'runner metrics observation, recommendation values, and protected API endpoint',
    { timeout: 120_000 },
    async ({ testApp, app: serverApp, request }) => {
      // 1. Unauthenticated request to /runner/recommendations returns 401
      const unauthRes = await request('/runner/recommendations');
      expect(unauthRes.status).toBe(401);

      // 2. Sign in as Admin
      const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);

      // 3. GET /runner/recommendations returns 200 and valid structure
      const res = await admin.fetch('/runner/recommendations');
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        data: {
          sliceName: string;
          currentLimits: { memoryMax: string; cpuQuota: string };
          proposedLimits: { memoryHigh: string; memoryMax: string };
          recommendedProxyAllowlist: Array<{ domain: string }>;
          observation: { estimatedPeakMemoryMb: number };
        };
      };

      expect(body.data.sliceName).toBe(RUNNER_SLICE_NAME);
      expect(body.data.currentLimits.memoryMax).toBe('2.5GiB');
      expect(body.data.proposedLimits.memoryHigh).toBe('2.0GiB');
      expect(body.data.observation.estimatedPeakMemoryMb).toBeGreaterThan(0);

      const domains = body.data.recommendedProxyAllowlist.map((d) => d.domain);
      expect(domains).toContain('registry.npmjs.org');
      expect(domains).toContain('github.com');
      expect(domains).toContain('api.anthropic.com');

      // 4. Test service functions directly on DB connection
      const db = serverApp.container
        .resolve(databaseManagerToken)
        .connection('main');
      const obs = await observeRunnerMetrics(db);
      expect(obs.sampleRunsCount).toBeGreaterThanOrEqual(0);
      expect(obs.estimatedPeakMemoryMb).toBe(1850);

      const rec = await getRunnerRecommendations(db);
      expect(rec.sliceName).toBe(RUNNER_SLICE_NAME);
      expect(rec.proposedLimits.memoryHigh).toBe('2.0GiB');
    },
  );
});
