import path from 'node:path';
import type { MigrationSource } from '@nocobase/db';
import { describeMigration } from '@nocobase/app-testing/server';
import { expect } from 'vitest';

const sources: readonly MigrationSource[] = [
  {
    packageName: 'ds-nb3-apps-test',
    directory: path.resolve(
      import.meta.dirname,
      '../../database/main/migrations',
    ),
  },
];

describeMigration('202611110001_ds_nb3_apps', {
  sources,
  up: async ({ expectCollection }) => {
    const apps = await expectCollection('dsNb3Apps').toExist();
    expect(apps.primaryKey).toEqual(['appId']);
    await expectCollection('dsNb3Apps').toHaveField('composeId', {
      nullable: false,
    });
    await expectCollection('dsNb3Apps').toHaveField('dbPasswordSealed', {
      nullable: true,
    });
  },
  down: async ({ expectCollection }) => {
    await expectCollection('dsNb3Apps').not.toExist();
  },
});
