import path from 'node:path';
import type { MigrationSource } from '@nocobase/db';
import { describeMigration } from '@nocobase/app-testing/server';
import { expect } from 'vitest';

const sources: readonly MigrationSource[] = [
  {
    packageName: 'ds-builds-test',
    directory: path.resolve(
      import.meta.dirname,
      '../../database/main/migrations',
    ),
  },
];

describeMigration('202611100005_ds_builds', {
  sources,
  up: async ({ expectCollection }) => {
    const builds = await expectCollection('dsBuilds').toExist();
    expect(builds.primaryKey).toEqual(['id']);
    await expectCollection('dsBuilds').toHaveField('releaseId', {
      nullable: true,
    });
    const keys = await expectCollection('dsRepositoryCiKeys').toExist();
    expect(keys.primaryKey).toEqual(['repositoryId']);
    const downloads = await expectCollection('dsReleaseDownloads').toExist();
    expect(downloads.primaryKey).toEqual(['tokenHash']);
  },
  down: async ({ expectCollection }) => {
    await expectCollection('dsBuilds').not.toExist();
    await expectCollection('dsRepositoryCiKeys').not.toExist();
    await expectCollection('dsReleaseDownloads').not.toExist();
  },
});
