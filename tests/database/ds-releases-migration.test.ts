import path from 'node:path';
import type { MigrationSource } from '@nocobase/db';
import { describeMigration } from '@nocobase/app-testing/server';
import { expect } from 'vitest';

const sources: readonly MigrationSource[] = [
  {
    packageName: 'ds-releases-test',
    directory: path.resolve(import.meta.dirname, '../../database/main/migrations'),
  },
];

const TABLES = [
  'dsEnvironments',
  'dsRepositoryApps',
  'dsReleaseLines',
  'dsVersions',
  'dsVersionTasks',
  'dsDeploymentRecords',
  'dsDeploymentRequests',
];

// The tables behind releases (`server/releases/service.ts`).
describeMigration('202611060001_ds_releases', {
  sources,
  up: async ({ connection, expectCollection }) => {
    for (const name of TABLES) await expectCollection(name).toExist();
    expect((await expectCollection('dsEnvironments').toExist()).primaryKey).toEqual(['key']);
    expect((await expectCollection('dsVersionTasks').toExist()).primaryKey).toEqual(['versionId', 'issueId']);
    await expectCollection('dsVersions').toHaveField('deletedAt', { nullable: true });

    // A tag is one version per repository.
    const version = {
      id: 'v-1',
      repositoryId: 'r-1',
      lineKey: 'stable',
      tag: 'v1.0',
      sha: 'abc',
      committedAt: null,
      previousVersionId: null,
      taskCount: 0,
      discoveredAt: new Date(),
      deletedAt: null,
    };
    await connection.query.insertInto('dsVersions').values(version).execute();
    await expect(
      connection.query.insertInto('dsVersions').values({ ...version, id: 'v-2' }).execute(),
    ).rejects.toThrow();
  },
  down: async ({ expectCollection }) => {
    for (const name of TABLES) await expectCollection(name).not.toExist();
  },
});
