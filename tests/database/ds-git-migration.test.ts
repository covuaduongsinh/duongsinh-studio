import path from 'node:path';
import type { MigrationSource } from '@nocobase/db';
import { describeMigration } from '@nocobase/app-testing/server';
import { expect } from 'vitest';

const sources: readonly MigrationSource[] = [
  {
    packageName: 'ds-git-test',
    directory: path.resolve(
      import.meta.dirname,
      '../../database/main/migrations',
    ),
  },
];

// The tables behind /api/git/* (`server/git/service.ts`).
describeMigration('202611030001_ds_git', {
  sources,
  up: async ({ connection, expectCollection }) => {
    const connections = await expectCollection('dsGitConnections').toExist();
    expect(connections.primaryKey).toEqual(['id']);
    await expectCollection('dsGitConnections').toHaveField('tokenSealed', {
      nullable: true,
    });
    const repositories = await expectCollection('dsRepositories').toExist();
    expect(Object.keys(repositories.fields)).toEqual(
      expect.arrayContaining([
        'connectionId',
        'fullName',
        'defaultBranch',
        'branchPrefix',
        'checksSource',
        'requiredChecks',
        'pollSeconds',
        'polledAt',
        'pollError',
      ]),
    );
    const links = await expectCollection('dsProjectRepositories').toExist();
    expect(Object.keys(links.fields)).toEqual(
      expect.arrayContaining(['projectId', 'repositoryId', 'isPrimary']),
    );
    const pulls = await expectCollection('dsPullRequests').toExist();
    expect(Object.keys(pulls.fields)).toEqual(
      expect.arrayContaining([
        'repositoryId',
        'number',
        'issueId',
        'headBranch',
        'baseBranch',
        'state',
        'title',
        'url',
        'mergeability',
        'ciState',
        'checks',
        'mergedAt',
        'mergedById',
        'updatedAt',
      ]),
    );
    await expectCollection('dsPullRequests').toHaveField('issueId', {
      nullable: true,
    });

    const now = new Date();
    const repository = {
      id: 'r1',
      connectionId: 'c1',
      fullName: 'owner/name',
      hostRepoId: null,
      cloneUrl: 'https://github.com/owner/name.git',
      webUrl: 'https://github.com/owner/name',
      defaultBranch: 'main',
      branchPrefix: 'agent/',
      checksSource: 'host',
      requiredChecks: '[]',
      pollSeconds: 60,
      polledAt: null,
      pollError: null,
      createdAt: now,
      updatedAt: now,
    };
    await connection.query
      .insertInto('dsRepositories')
      .values(repository)
      .execute();
    // One repository per connection and name.
    await expect(
      connection.query
        .insertInto('dsRepositories')
        .values({ ...repository, id: 'r2' })
        .execute(),
    ).rejects.toThrow();
    const pull = {
      id: 'p1',
      repositoryId: 'r1',
      number: 7,
      issueId: null,
      linkedBy: null,
      headBranch: 'agent/DS-1',
      headSha: 'abc',
      baseBranch: 'main',
      state: 'open',
      draft: false,
      title: 'Change',
      url: 'https://github.com/owner/name/pull/7',
      authorLogin: null,
      mergeability: 'unknown',
      hostMergeState: null,
      ciState: 'missing',
      checks: '[]',
      mergeCommitSha: null,
      mergedAt: null,
      mergedById: null,
      mergeForcedReason: null,
      closedAt: null,
      snapshotAt: null,
      createdAt: now,
      updatedAt: now,
    };
    await connection.query.insertInto('dsPullRequests').values(pull).execute();
    // One row per pull request of a repository.
    await expect(
      connection.query
        .insertInto('dsPullRequests')
        .values({ ...pull, id: 'p2' })
        .execute(),
    ).rejects.toThrow();
  },
  down: async ({ expectCollection }) => {
    for (const name of [
      'dsGitConnections',
      'dsRepositories',
      'dsProjectRepositories',
      'dsPullRequests',
    ])
      await expectCollection(name).not.toExist();
  },
});
