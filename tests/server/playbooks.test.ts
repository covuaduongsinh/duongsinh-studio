import { describe, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createAppTest } from '@nocobase/app-testing/server';
import {
  signIn,
  DEFAULT_ADMIN_CREDENTIALS,
} from '@nocobase/app-plugin-authentication/testing';
import { databaseManagerToken } from '@nocobase/db';
import { createStandaloneServer } from '../../server/standalone.js';
import { applyPlaybookToIssue } from '../../server/playbooks/service.js';

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

describe('H3a: Playbooks API and Execution Logic', () => {
  test(
    'playbooks authentication, definition listing, apply flow and default criteria copy',
    { timeout: 120_000 },
    async ({ testApp, app: serverApp, request }) => {
      // 1. Unauthenticated requests return 401
      const unauthList = await request('/playbooks');
      expect(unauthList.status).toBe(401);

      const unauthInvocations = await request('/playbooks/invocations');
      expect(unauthInvocations.status).toBe(401);

      const unauthApply = await request(
        '/playbooks/apply',
        json({ issueId: 'test-issue-1', slug: 'nang-template' }),
      );
      expect(unauthApply.status).toBe(401);

      // 2. Sign in as Admin
      const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);

      // 3. GET /playbooks returns 4 playbooks
      const listRes = await admin.fetch('/playbooks');
      expect(listRes.status).toBe(200);
      const listBody = (await listRes.json()) as {
        data: Array<{ slug: string; name: string }>;
      };
      expect(listBody.data.length).toBeGreaterThanOrEqual(4);
      const slugs = listBody.data.map((p) => p.slug);
      expect(slugs).toContain('nang-template');
      expect(slugs).toContain('tao-app-nocobase');
      expect(slugs).toContain('nhap-lark');
      expect(slugs).toContain('deploy-dokploy');

      // 4. Test applyPlaybookToIssue directly on database
      const db = serverApp.container
        .resolve(databaseManagerToken)
        .connection('main');
      const testIssueId = randomUUID();

      // Test non-existent playbook
      const invalidRes = await applyPlaybookToIssue(db, {
        issueId: testIssueId,
        slug: 'khong-ton-tai',
      });
      expect(invalidRes.success).toBe(false);
      expect(invalidRes.reason).toBe('NOT_FOUND');
      expect(invalidRes.message).toContain('!khong-ton-tai');
      expect(invalidRes.message).toContain('!nang-template');

      // Test valid playbook apply seeds criteria
      const validRes = await applyPlaybookToIssue(db, {
        issueId: testIssueId,
        slug: 'nang-template',
        params: { version: 'beta.89' },
      });
      expect(validRes.success).toBe(true);
      expect(validRes.insertedCriteriaCount).toBe(3);

      // Verify criteria inserted in database
      const criteriaRows = await db.query
        .selectFrom('dsIssueCriteria')
        .selectAll()
        .where('issueId', '=', testIssueId)
        .orderBy('position', 'asc')
        .execute();
      expect(criteriaRows).toHaveLength(3);
      expect(criteriaRows[0]!.source).toBe('playbook');

      // Re-applying does not duplicate criteria
      const secondApply = await applyPlaybookToIssue(db, {
        issueId: testIssueId,
        slug: 'nang-template',
      });
      expect(secondApply.success).toBe(true);
      expect(secondApply.insertedCriteriaCount).toBe(0);

      // 5. GET /playbooks/invocations lists the recorded invocations
      const invRes = await admin.fetch('/playbooks/invocations');
      expect(invRes.status).toBe(200);
      const invBody = (await invRes.json()) as {
        data: Array<{ issueId: string; playbookSlug: string }>;
      };
      expect(
        invBody.data.some(
          (inv) =>
            inv.issueId === testIssueId && inv.playbookSlug === 'nang-template',
        ),
      ).toBe(true);

      // 6. Test POST /playbooks/apply via route
      const anotherIssueId = randomUUID();
      const routeApply = await admin.fetch(
        '/playbooks/apply',
        json({
          issueId: anotherIssueId,
          slug: 'tao-app-nocobase',
          params: { name: 'DemoApp', port: '3000' },
        }),
      );
      expect(routeApply.status).toBe(200);
      const applyData = (await routeApply.json()) as {
        data: { success: boolean; insertedCriteriaCount: number };
      };
      expect(applyData.data.success).toBe(true);
      expect(applyData.data.insertedCriteriaCount).toBe(2);
    },
  );
});
