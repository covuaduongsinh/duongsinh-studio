// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import { createAppTest } from '@nocobase/app-testing/server';
import {
  signIn,
  DEFAULT_ADMIN_CREDENTIALS,
} from '@nocobase/app-plugin-authentication/testing';
import { agentsToken } from '@nocobase/app-plugin-agents/server/tokens';
import { databaseManagerToken } from '@nocobase/db';
import { GitHubError } from '../../server/git/github.js';
import {
  HarnessExportError,
  createHarnessExportService,
} from '../../server/harness-export/service.js';
import { createStandaloneServer } from '../../server/standalone.js';

// T4 (plan T): the rules go to the repository as a pull request, secrets stop it, and a hand edit shows as drift.
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
    'content-type': 'application/json',
    origin: 'http://localhost',
    'Idempotency-Key': `${Date.now()}.${randomUUID()}`,
  },
  body: JSON.stringify(body),
});

/** A repository in memory: the default branch's files, the branches made, the pull requests opened. */
function fakeRepository(files: Record<string, string> = {}) {
  const base = new Map(Object.entries(files));
  const branches = new Map<string, Map<string, string>>();
  const pulls: { head: string; title: string }[] = [];
  const shaOf = (path: string) => `sha-${path}`;
  const client = {
    async file(_repo: string, path: string, ref: string) {
      const store = branches.get(ref) ?? base;
      const text = store.get(path);
      if (text === undefined) throw new GitHubError(404, 'not a file');
      return { path, sha: shaOf(path), size: text.length, text };
    },
    async branchHead() {
      return 'head-1';
    },
    async createBranch(_repo: string, branch: string) {
      branches.set(branch, new Map(base));
    },
    async putFile(
      _repo: string,
      input: { path: string; content: string; branch: string; sha?: string },
    ) {
      const store = branches.get(input.branch)!;
      if (store.has(input.path) && input.sha !== shaOf(input.path))
        throw new GitHubError(409, 'sha does not match');
      store.set(input.path, input.content);
    },
    async createPull(_repo: string, input: { head: string; title: string }) {
      pulls.push({ head: input.head, title: input.title });
      return {
        number: pulls.length,
        url: `https://github.test/pull/${pulls.length}`,
      };
    },
  };
  return {
    client,
    pulls,
    branches,
    /** What merging the pull request does. */
    merge(head: string) {
      for (const [path, text] of branches.get(head)!) base.set(path, text);
    },
    edit(path: string, text: string) {
      base.set(path, text);
    },
    base,
  };
}

test(
  'T4: export opens a pull request, secrets stop it, drift shows, and a second export has nothing to do',
  { timeout: 180_000 },
  async ({ testApp, app }) => {
    const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
    const conn = app.container.resolve(databaseManagerToken).connection();
    const projectId = (
      (await (
        await admin.fetch('/projects', json({ name: 'Harness Project' }))
      ).json()) as { data: { id: string } }
    ).data.id;
    await conn.query
      .insertInto('dsProjectDefaultCriteria')
      .values({
        id: randomUUID(),
        projectId,
        position: 0,
        text: 'Tests pass',
        checkKind: 'test',
        checkValue: 'pnpm exec vitest run x',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .execute();
    const lesson = (rule: string) =>
      conn.query
        .insertInto('dsLessons')
        .values({
          id: randomUUID(),
          projectId,
          mistake: 'Forgot it.',
          rule,
          tag: 'migration',
          target: 'skill',
          status: 'accepted',
          proposedByType: 'user',
          createdAt: new Date(),
          updatedAt: new Date(),
        } as never)
        .execute();
    await lesson('Always write a down migration.');

    const repo = fakeRepository({
      'AGENTS.md':
        '# App\n\n## Index\n\n| Read | When |\n| --- | --- |\n| [a](a.md) | A |\n',
    });
    let linked = true;
    const service = createHarnessExportService({
      conn: () => conn,
      git: () =>
        ({
          primaryRepository: async () =>
            linked
              ? { id: 'r1', repo: 'acme/sandbox', defaultBranch: 'main' }
              : null,
          clientForRepository: async () => repo.client,
        }) as never,
      agents: () => app.container.resolve(agentsToken),
    });

    // No repository linked: nothing to compare with, nothing to export.
    linked = false;
    expect((await service.status(projectId)).state).toBe('noRepository');
    await expect(service.exportToRepository(projectId)).rejects.toMatchObject({
      reason: 'NO_REPOSITORY',
    });
    linked = true;

    // Never exported yet.
    expect((await service.status(projectId)).state).toBe('notExported');

    // A secret in a lesson: no pull request, and what is said holds no text of it.
    await lesson('Use token ghp_' + 'a'.repeat(36) + ' to log in.');
    const blocked = await service.exportToRepository(projectId).catch((e) => e);
    expect(blocked).toBeInstanceOf(HarnessExportError);
    expect(blocked.reason).toBe('SECRETS_FOUND');
    expect(blocked.message).not.toContain('ghp_');
    expect(repo.pulls).toHaveLength(0);
    await conn.query
      .deleteFrom('dsLessons')
      .where('rule', 'like', '%ghp_%')
      .execute();

    // Clean: a pull request with the files and one more row in the Index of AGENTS.md.
    const opened = await service.exportToRepository(projectId);
    expect(opened).toMatchObject({ number: 1 });
    const head = repo.pulls[0]!.head;
    const written = repo.branches.get(head)!;
    expect(written.get('.nb-studio/harness/lessons.md')).toContain(
      'Always write a down migration.',
    );
    expect(written.get('.nb-studio/harness/criteria-template.md')).toContain(
      'Tests pass',
    );
    expect(written.get('AGENTS.md')).toContain('.agents/rules/ds-harness.md');
    expect(
      [...written.keys()].some((p) => p.startsWith('.agents/skills/')),
    ).toBe(false);

    // Merged: in sync. A hand edit: drifted. Studio's own change: out of date.
    repo.merge(head);
    expect((await service.status(projectId)).state).toBe('inSync');
    await expect(service.exportToRepository(projectId)).rejects.toMatchObject({
      reason: 'NOTHING_TO_EXPORT',
    });
    repo.edit(
      '.nb-studio/harness/lessons.md',
      repo.base.get('.nb-studio/harness/lessons.md') + '\nhand edit\n',
    );
    const drifted = await service.status(projectId);
    expect(drifted.state).toBe('drifted');
    expect(drifted.edited).toEqual(['.nb-studio/harness/lessons.md']);
    repo.edit(
      '.nb-studio/harness/lessons.md',
      repo.base
        .get('.nb-studio/harness/lessons.md')!
        .replace('\nhand edit\n', ''),
    );
    await lesson('Name tests after behaviour.');
    expect((await service.status(projectId)).outdated).toBe(true);
    const second = await service.exportToRepository(projectId);
    expect(second.number).toBe(2);
  },
);
