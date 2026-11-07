import path from 'node:path';
import type { MigrationSource } from '@nocobase/db';
import { describeMigration } from '@nocobase/app-testing/server';
import { expect } from 'vitest';

const sources: readonly MigrationSource[] = [
  {
    packageName: 'ds-project-setups-test',
    directory: path.resolve(
      import.meta.dirname,
      '../../database/main/migrations',
    ),
  },
];

describeMigration('202611100001_ds_project_setups', {
  sources,
  up: async ({ expectCollection }) => {
    const setups = await expectCollection('dsProjectSetups').toExist();
    expect(setups.primaryKey).toEqual(['projectId']);
    await expectCollection('dsProjectSetups').toHaveField('method', {
      nullable: false,
    });
    await expectCollection('dsProjectSetups').toHaveField('issueId', {
      nullable: true,
    });
    const skills = await expectCollection('dsProjectDefaultSkills').toExist();
    expect(skills.primaryKey).toEqual(['skillId']);
  },
  down: async ({ expectCollection }) => {
    await expectCollection('dsProjectSetups').not.toExist();
    await expectCollection('dsProjectDefaultSkills').not.toExist();
  },
});
