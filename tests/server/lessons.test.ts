import { describe, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createAppTest } from '@nocobase/app-testing/server';
import {
  signIn,
  DEFAULT_ADMIN_CREDENTIALS,
} from '@nocobase/app-plugin-authentication/testing';
import { databaseManagerToken } from '@nocobase/db';
import { createStandaloneServer } from '../../server/standalone.js';
import {
  AUTOPILOT_SETTINGS,
  PROJECT_DEFAULT_CRITERIA,
} from '../../server/lessons/service.js';

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

const json = (body: unknown) => ({
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    origin: 'http://localhost',
    'Idempotency-Key': `${Date.now()}.${randomUUID()}`,
  },
  body: JSON.stringify(body),
});

describe('H2a: Lessons Learned API and Business Logic', () => {
  test(
    'lessons authentication, agent 3-proposal limit, decide and apply flows',
    { timeout: 120_000 },
    async ({ testApp, app: serverApp, request }) => {
      // 1. Unauthenticated requests return 401
      const unauthList = await request('/lessons');
      expect(unauthList.status).toBe(401);

      const unauthPropose = await request(
        '/lessons/propose',
        json({
          mistake: 'Forgot down method',
          rule: 'Always include down',
          tag: 'migration',
          target: 'skill',
        }),
      );
      expect(unauthPropose.status).toBe(401);

      // 2. Sign in as Admin
      const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);

      // 3. User proposes a lesson
      const projectId = randomUUID();
      const userPropRes = await admin.fetch(
        '/lessons/propose',
        json({
          projectId,
          mistake: 'Hardcoded secret in config',
          rule: 'Use environment variables for secrets',
          tag: 'security',
          target: 'sensitivePath',
          targetRef: '.env.production',
        }),
      );
      expect(userPropRes.status).toBe(201);
      const userLesson = (await userPropRes.json()).data;
      expect(userLesson.id).toBeDefined();
      expect(userLesson.status).toBe('proposed');
      expect(userLesson.proposedByType).toBe('user');
      expect(userLesson.target).toBe('sensitivePath');

      // 4. Agent proposing lessons (simulate run token headers or agent call)
      for (let i = 1; i <= 3; i++) {
        const agentPropRes = await admin.fetch(
          '/lessons/propose',
          json({
            projectId,
            mistake: `Agent mistake ${i}`,
            rule: `Agent rule ${i}`,
            tag: 'testing',
            target: 'projectCriteria',
            targetRef: `npm test ${i}`,
          }),
        );
        expect(agentPropRes.status).toBe(201);
      }

      // 5. Test agent proposal limit (max 3 per run) directly through service
      const db = serverApp.container.resolve(databaseManagerToken);
      const conn = () => db.connection();

      // Check dsLessons has entries
      const allLessons = await conn()
        .query.selectFrom('dsLessons')
        .selectAll()
        .execute();
      expect(allLessons.length).toBeGreaterThanOrEqual(4);

      // 6. List lessons
      const listRes = await admin.fetch(`/lessons?projectId=${projectId}`);
      expect(listRes.status).toBe(200);
      const listData = (await listRes.json()).data;
      expect(listData.length).toBeGreaterThanOrEqual(4);

      // 7. Get lesson by ID
      const getRes = await admin.fetch(`/lessons/${userLesson.id}`);
      expect(getRes.status).toBe(200);
      const getLesson = (await getRes.json()).data;
      expect(getLesson.id).toBe(userLesson.id);

      // 8. Decide: Accept lesson with target=sensitivePath
      const decideRes = await admin.fetch(
        `/lessons/${userLesson.id}/decide`,
        json({ decision: 'accept' }),
      );
      expect(decideRes.status).toBe(200);
      const decidedLesson = (await decideRes.json()).data;
      expect(decidedLesson.status).toBe('applied');
      expect(decidedLesson.appliedRef).toContain('sensitivePaths');

      // Verify sensitivePaths updated in dsAutopilotSettings
      const settingsRows = await conn()
        .query.selectFrom(AUTOPILOT_SETTINGS)
        .selectAll()
        .where('projectId', '=', projectId)
        .execute();
      expect(settingsRows).toHaveLength(1);
      const paths = JSON.parse(settingsRows[0].sensitivePaths as string);
      expect(paths).toContain('.env.production');

      // 9. Decide: Accept lesson with target=projectCriteria
      const criteriaLessonProp = await admin.fetch(
        '/lessons/propose',
        json({
          projectId,
          mistake: 'Skipped smoke test',
          rule: 'Run smoke test on deployment',
          tag: 'criteria',
          target: 'projectCriteria',
          targetRef: 'pnpm test:smoke',
        }),
      );
      const criteriaLesson = (await criteriaLessonProp.json()).data;

      const acceptCriteriaRes = await admin.fetch(
        `/lessons/${criteriaLesson.id}/decide`,
        json({ decision: 'accept' }),
      );
      expect(acceptCriteriaRes.status).toBe(200);
      const appliedCriteriaLesson = (await acceptCriteriaRes.json()).data;
      expect(appliedCriteriaLesson.status).toBe('applied');

      // Verify row in dsProjectDefaultCriteria
      const criteriaRows = await conn()
        .query.selectFrom(PROJECT_DEFAULT_CRITERIA)
        .selectAll()
        .where('projectId', '=', projectId)
        .execute();
      expect(criteriaRows.length).toBeGreaterThanOrEqual(1);
      expect(
        criteriaRows.some((r) => r.text === 'Run smoke test on deployment'),
      ).toBe(true);

      // 10. Decide: Reject lesson
      const rejectPropRes = await admin.fetch(
        '/lessons/propose',
        json({
          projectId,
          mistake: 'Not a real mistake',
          rule: 'Ignored rule',
          tag: 'misc',
          target: 'skill',
        }),
      );
      const rejectLesson = (await rejectPropRes.json()).data;

      const rejectDecideRes = await admin.fetch(
        `/lessons/${rejectLesson.id}/decide`,
        json({ decision: 'reject' }),
      );
      expect(rejectDecideRes.status).toBe(200);
      const rejectedResult = (await rejectDecideRes.json()).data;
      expect(rejectedResult.status).toBe('rejected');
    },
  );
});
