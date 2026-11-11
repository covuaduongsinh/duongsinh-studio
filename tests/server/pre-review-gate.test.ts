import { describe, it, expect, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createAppTest } from '@nocobase/app-testing/server';
import { databaseManagerToken } from '@nocobase/db';
import { IN_PROGRESS_STATUS } from '@nocobase/app-plugin-projects/shared/statuses';
import {
  evaluatePreReviewGate,
  isForbiddenFile,
} from '../../server/gates/pre-review.js';
import {
  scanAddedLines,
  scanTextForSecrets,
} from '../../server/security/secret-patterns.js';
import { createAgentKind } from '../../server/providers/agent-executor.js';
import { createStandaloneServer } from '../../server/standalone.js';

describe('Pre-review Gate (H1d) - Unit Tests', () => {
  describe('isForbiddenFile', () => {
    it('detects forbidden files defined in CI workflow rules', () => {
      expect(isForbiddenFile('.env')).toBe(true);
      expect(isForbiddenFile('.env.production')).toBe(true);
      expect(isForbiddenFile('server/.env.local')).toBe(true);
      expect(isForbiddenFile('data.sqlite')).toBe(true);
      expect(isForbiddenFile('database/main.sqlite')).toBe(true);
      expect(isForbiddenFile('config.yml')).toBe(true);
      expect(isForbiddenFile('deploy/config.yml')).toBe(true);
      expect(isForbiddenFile('dump.dump')).toBe(true);
      expect(isForbiddenFile('backup/database.dump')).toBe(true);

      expect(isForbiddenFile('src/index.ts')).toBe(false);
      expect(isForbiddenFile('client/routes.ts')).toBe(false);
      expect(isForbiddenFile('docs/readme.md')).toBe(false);
    });

    it('supports extra project-level forbidden patterns', () => {
      expect(isForbiddenFile('secret-keys/cert.pem', ['secret-keys/**'])).toBe(
        true,
      );
      expect(isForbiddenFile('src/cert.pem', ['secret-keys/**'])).toBe(false);
    });
  });

  describe('Secret Scanner', () => {
    it('detects GitHub token on added lines of patch without matching context lines', () => {
      const patch = `
@@ -1,3 +1,4 @@
 unchanged line
-removed line
+const token = "ghp_123456789012345678901234567890123456";
`;
      const findings = scanAddedLines(patch);
      expect(findings).toHaveLength(1);
      expect(findings[0].patternKey).toBe('github_token');
    });

    it('detects Anthropic and OpenAI API keys', () => {
      const text = `
sk-ant-api03-abcdefghijklmn1234567890_
sk-proj-1234567890abcdefghij1234567890_
`;
      const findings = scanTextForSecrets(text);
      expect(findings.some((f) => f.patternKey === 'anthropic_api_key')).toBe(
        true,
      );
      expect(findings.some((f) => f.patternKey === 'openai_api_key')).toBe(
        true,
      );
    });

    it('detects private key blocks', () => {
      const patch = `
+-----BEGIN RSA PRIVATE KEY-----
+MIIEowIBAAKCAQEA...
`;
      const findings = scanAddedLines(patch);
      expect(findings.some((f) => f.patternKey === 'pem_private_key')).toBe(
        true,
      );
    });
  });

  describe('evaluatePreReviewGate', () => {
    const cleanChecks = [{ name: 'test', outcome: 'success' as const }];
    const cleanPatch = `
@@ -1,2 +1,3 @@
 normal context
+const greeting = 'hello world';
`;

    // 1. CI đỏ
    it('fails gate when CI checks failed (CI đỏ)', () => {
      const result = evaluatePreReviewGate({
        pull: { number: 42, ciState: 'failed' },
        checks: [{ name: 'build', outcome: 'failure' }],
        changedFiles: ['src/app.ts'],
        patch: cleanPatch,
      });

      expect(result.passed).toBe(false);
      expect(result.ci.passed).toBe(false);
      expect(result.ci.state).toBe('failed');
      expect(result.reasons).toEqual([
        expect.stringContaining('CI checks failed on pull request #42'),
      ]);
    });

    // 2. CI thiếu
    it('fails gate when CI checks are missing or pending (CI thiếu)', () => {
      const resultMissing = evaluatePreReviewGate({
        pull: { number: 42, ciState: 'missing' },
        checks: [],
        changedFiles: ['src/app.ts'],
        patch: cleanPatch,
      });

      expect(resultMissing.passed).toBe(false);
      expect(resultMissing.ci.passed).toBe(false);
      expect(resultMissing.ci.state).toBe('missing');
      expect(resultMissing.reasons).toEqual([
        expect.stringContaining('CI checks are missing on pull request #42'),
      ]);

      const resultPending = evaluatePreReviewGate({
        pull: { number: 42, ciState: 'pending' },
        checks: [{ name: 'build', outcome: 'pending' }],
        changedFiles: ['src/app.ts'],
        patch: cleanPatch,
      });

      expect(resultPending.passed).toBe(false);
      expect(resultPending.ci.passed).toBe(false);
      expect(resultPending.ci.state).toBe('pending');
      expect(resultPending.reasons).toEqual([
        expect.stringContaining(
          'CI checks are still pending on pull request #42',
        ),
      ]);
    });

    // 3. Patch có khoá
    it('fails gate when patch additions contain credentials or tokens (patch có khoá)', () => {
      const patchWithKey = `
@@ -10,3 +10,4 @@
 function configure() {
+  const apiKey = "sk-ant-api03-abcdefghijklmn12345678901234";
 }
`;
      const result = evaluatePreReviewGate({
        pull: { number: 42, ciState: 'passed' },
        checks: cleanChecks,
        changedFiles: ['src/config.ts'],
        patch: patchWithKey,
      });

      expect(result.passed).toBe(false);
      expect(result.secretScan.passed).toBe(false);
      expect(result.secretScan.findings.length).toBeGreaterThan(0);
      expect(result.reasons).toEqual([
        expect.stringContaining(
          'Potential secret or credential pattern detected',
        ),
      ]);
    });

    // 4. File .env hoặc file cấm
    it('fails gate when pull request modifies forbidden files (file .env, sqlite, dump, config.yml)', () => {
      const resultEnv = evaluatePreReviewGate({
        pull: { number: 42, ciState: 'passed' },
        checks: cleanChecks,
        changedFiles: ['server/.env'],
        patch: cleanPatch,
      });

      expect(resultEnv.passed).toBe(false);
      expect(resultEnv.forbiddenFiles.passed).toBe(false);
      expect(resultEnv.forbiddenFiles.files).toEqual(['server/.env']);
      expect(resultEnv.reasons).toEqual([
        expect.stringContaining('modifies forbidden file(s): server/.env'),
      ]);

      const resultSqlite = evaluatePreReviewGate({
        pull: { number: 42, ciState: 'passed' },
        checks: cleanChecks,
        changedFiles: ['database/storage.sqlite'],
        patch: cleanPatch,
      });

      expect(resultSqlite.passed).toBe(false);
      expect(resultSqlite.forbiddenFiles.files).toEqual([
        'database/storage.sqlite',
      ]);
    });

    // 5. Sạch
    it('passes gate when CI passed, no secret in patch, and no forbidden files (sạch)', () => {
      const result = evaluatePreReviewGate({
        pull: { number: 42, ciState: 'passed' },
        checks: cleanChecks,
        changedFiles: ['src/index.ts', 'tests/index.test.ts'],
        patch: cleanPatch,
      });

      expect(result.passed).toBe(true);
      expect(result.ci.passed).toBe(true);
      expect(result.ci.state).toBe('passed');
      expect(result.secretScan.passed).toBe(true);
      expect(result.secretScan.findings).toHaveLength(0);
      expect(result.forbiddenFiles.passed).toBe(true);
      expect(result.forbiddenFiles.files).toHaveLength(0);
      expect(result.reasons).toHaveLength(0);
    });
  });
});

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

test(
  'Integration: agent-executor wake() aborts on failed pre-review gate and allows on clean gate',
  { timeout: 120_000 },
  async ({ app }) => {
    const { container } = app;
    const db = container.resolve(databaseManagerToken);
    const conn = db.connection();

    const issueIdFailed = randomUUID();
    const issueIdClean = randomUUID();
    const prIdFailed = randomUUID();
    const prIdClean = randomUUID();
    const agentId = randomUUID();

    // 1. Seed issue 1 (Failed gate)
    await conn.query
      .insertInto('pmIssues')
      .values({
        id: issueIdFailed,
        number: 201,
        identifier: 'DS-201',
        title: 'Issue with failing pre-review gate',
        description: 'Test description 201',
        ownerUserId: 'user-1',
        priorityRank: 1,
        lastActivityAt: new Date().toISOString(),
        statusKey: IN_PROGRESS_STATUS,
        priority: 'medium',
        executorType: 'agent',
        executorId: agentId,
        revision: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .execute();

    // Seed open PR for issue 1 with failed CI checks
    await conn.query
      .insertInto('dsPullRequests')
      .values({
        id: prIdFailed,
        repositoryId: 'repo-1',
        number: 201,
        issueId: issueIdFailed,
        headBranch: 'feat/ds-201',
        headSha: 'sha201',
        baseBranch: 'main',
        state: 'open',
        draft: false,
        title: 'PR for DS-201',
        url: 'https://github.com/org/repo/pull/201',
        mergeability: 'clean',
        ciState: 'failed',
        checks: JSON.stringify([{ name: 'test', outcome: 'failure' }]),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .execute();

    // 2. Seed issue 2 (Clean gate)
    await conn.query
      .insertInto('pmIssues')
      .values({
        id: issueIdClean,
        number: 202,
        identifier: 'DS-202',
        title: 'Issue with clean pre-review gate',
        description: 'Test description 202',
        ownerUserId: 'user-1',
        priorityRank: 1,
        lastActivityAt: new Date().toISOString(),
        statusKey: IN_PROGRESS_STATUS,
        priority: 'medium',
        executorType: 'agent',
        executorId: agentId,
        revision: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .execute();

    // Seed open PR for issue 2 with passed CI checks
    await conn.query
      .insertInto('dsPullRequests')
      .values({
        id: prIdClean,
        repositoryId: 'repo-1',
        number: 202,
        issueId: issueIdClean,
        headBranch: 'feat/ds-202',
        headSha: 'sha202',
        baseBranch: 'main',
        state: 'open',
        draft: false,
        title: 'PR for DS-202',
        url: 'https://github.com/org/repo/pull/202',
        mergeability: 'clean',
        ciState: 'passed',
        checks: JSON.stringify([{ name: 'test', outcome: 'success' }]),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .execute();

    const postedComments: Array<{
      actor: any;
      issueId: string;
      content: string;
    }> = [];

    const mockProjects: any = {
      subtasks: { blockersOf: async () => [] },
      kinds: { names: async () => new Map() },
      comments: {
        post: async (actor: any, targetIssueId: string, input: any) => {
          postedComments.push({
            actor,
            issueId: targetIssueId,
            content: input.content,
          });
          return { comment: { id: 'c-1' } };
        },
      },
    };

    const mockAgents: any = {
      agents: {
        findWorkable: async () => ({ id: agentId, status: 'enabled' }),
        names: async () => new Map([[agentId, 'Reviewer Agent']]),
      },
      runs: {
        enqueue: vi
          .fn()
          .mockResolvedValue({ outcome: 'started', runId: 'run-clean' }),
      },
    };

    const mockGit: any = {
      pullFiles: async () => ['src/code.ts'],
      pullPatch: async () => '+const clean = true;',
    };

    const kind = createAgentKind({
      agents: mockAgents,
      projects: mockProjects,
      budgets: () => ({ blocking: async () => false }) as any,
      git: () => mockGit,
    });

    const tx: any = {
      conn,
      rehearsal: false,
    };

    // A. Read-only wake on issue with failing PR -> should abort and post system comment
    const failedAttempts = await kind.work.onCommentCreated(tx, {
      comment: {
        id: 'comm-fail',
        content: 'Please review this PR.\nMode: read-only',
      } as any,
      issue: {
        id: issueIdFailed,
        identifier: 'DS-201',
        statusKey: IN_PROGRESS_STATUS,
        executorType: 'agent',
        executorId: agentId,
      } as any,
      actor: { type: 'user', id: 'user-1' },
      mentions: [{ kind: 'agent', id: agentId, name: 'Reviewer Agent' }],
    });

    expect(failedAttempts).toHaveLength(1);
    expect(failedAttempts[0].started).toBe(false);
    expect(failedAttempts[0].skipped).toBe('limited');
    expect(mockAgents.runs.enqueue).not.toHaveBeenCalled();

    // Verify system comment
    expect(postedComments).toHaveLength(1);
    expect(postedComments[0].actor).toEqual({ type: 'system', id: null });
    expect(postedComments[0].issueId).toBe(issueIdFailed);
    expect(postedComments[0].content).toContain(
      'Cổng xác định trước review chưa đạt (PR #201)',
    );
    expect(postedComments[0].content).toContain('CI checks failed');

    // B. Read-only wake on issue with clean PR -> should start and enqueue run
    const cleanAttempts = await kind.work.onCommentCreated(tx, {
      comment: {
        id: 'comm-clean',
        content: 'Please review this PR.\nMode: read-only',
      } as any,
      issue: {
        id: issueIdClean,
        identifier: 'DS-202',
        statusKey: IN_PROGRESS_STATUS,
        executorType: 'agent',
        executorId: agentId,
      } as any,
      actor: { type: 'user', id: 'user-1' },
      mentions: [{ kind: 'agent', id: agentId, name: 'Reviewer Agent' }],
    });

    expect(cleanAttempts).toHaveLength(1);
    expect(cleanAttempts[0].started).toBe(true);
    expect(cleanAttempts[0].runId).toBe('run-clean');
    expect(mockAgents.runs.enqueue).toHaveBeenCalledTimes(1);
  },
);
