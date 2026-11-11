import { describe, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createAppTest } from '@nocobase/app-testing/server';
import {
  signIn,
  DEFAULT_ADMIN_CREDENTIALS,
} from '@nocobase/app-plugin-authentication/testing';
import { databaseManagerToken } from '@nocobase/db';
import { createStandaloneServer } from '../../server/standalone.js';
import { secretFindingsServiceToken } from '../../server/providers/security.js';
import {
  scanSecrets,
  hashSecret,
  maskSecrets,
} from '../../server/security/secret-patterns.js';
import { INITIAL_LESSON_ID } from '../../database/main/seeds/202611110001_ds_initial_lesson.js';

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

describe('H2b: Secret Findings and Detection API', () => {
  test(
    'unauthenticated endpoints return 401, records findings, updates status, and masks secrets',
    { timeout: 120_000 },
    async ({ testApp, app: serverApp, request }) => {
      const issueId = `issue-${randomUUID()}`;

      // 1. Unauthenticated requests return 401
      const unauthGet = await request(`/issues/${issueId}/secret-findings`);
      expect(unauthGet.status).toBe(401);

      const unauthStatus = await request(
        `/secret-findings/finding-1/status`,
        json({ status: 'resolved' }),
      );
      expect(unauthStatus.status).toBe(401);

      // 2. Sign in as Admin
      const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);

      // 3. Verify seed of initial lesson exists in DB
      const db = serverApp.container.resolve(databaseManagerToken);
      const conn = () => db.connection();
      const seedLesson = await conn()
        .query.selectFrom('dsLessons')
        .selectAll()
        .where('id', '=', INITIAL_LESSON_ID)
        .executeTakeFirst();
      expect(seedLesson).toBeDefined();
      expect(seedLesson?.tag).toBe('security');
      expect(seedLesson?.status).toBe('applied');

      // 4. Test Service: recordFindings with scanned secrets
      const rawSecret = 'ghp_123456789012345678901234567890123456';
      const scanned = scanSecrets(`Leak token: ${rawSecret}`);
      expect(scanned).toHaveLength(1);

      const service = serverApp.container.resolve(secretFindingsServiceToken);
      const recorded = await service.recordFindings({
        issueId,
        commentId: null,
        matches: scanned,
        ownerUserId: 'user-admin',
        issueIdentifier: 'DS-100',
      });

      expect(recorded).toHaveLength(1);
      const findingId = recorded[0]!.id;
      expect(recorded[0]!.status).toBe('active');
      expect(recorded[0]!.patternKey).toBe('github_token');
      expect(recorded[0]!.fingerprint).toBe(hashSecret(rawSecret));

      // 5. Verify database storage does NOT store raw secret
      const dbRow = await conn()
        .query.selectFrom('dsSecretFindings')
        .selectAll()
        .where('id', '=', findingId)
        .executeTakeFirst();
      expect(dbRow).toBeDefined();
      expect(JSON.stringify(dbRow)).not.toContain(rawSecret);

      // 6. GET /api/issues/:id/secret-findings
      const getRes = await admin.fetch(`/issues/${issueId}/secret-findings`);
      expect(getRes.status).toBe(200);
      const getBody = await getRes.json();
      expect(getBody.data).toHaveLength(1);
      expect(getBody.data[0].id).toBe(findingId);
      expect(getBody.data[0].status).toBe('active');
      expect(JSON.stringify(getBody)).not.toContain(rawSecret);

      // 7. POST /api/secret-findings/:id/status -> resolve
      const resolveRes = await admin.fetch(
        `/secret-findings/${findingId}/status`,
        json({ status: 'resolved' }),
      );
      expect(resolveRes.status).toBe(200);
      const resolveBody = await resolveRes.json();
      expect(resolveBody.data.status).toBe('resolved');

      // 8. Verify status in database
      const updatedRow = await conn()
        .query.selectFrom('dsSecretFindings')
        .select('status')
        .where('id', '=', findingId)
        .executeTakeFirst();
      expect(updatedRow?.status).toBe('resolved');

      // 9. Verify masking protects agent context
      const maskedText = maskSecrets(`Issue token was ${rawSecret}.`);
      expect(maskedText).toBe('Issue token was [NGHI LÀ BÍ MẬT].');
      expect(maskedText).not.toContain(rawSecret);
    },
  );
});
