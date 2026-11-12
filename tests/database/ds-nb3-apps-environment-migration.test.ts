import path from 'node:path';
import type { MigrationSource } from '@nocobase/db';
import { describeMigration } from '@nocobase/app-testing/server';

const sources: readonly MigrationSource[] = [
  {
    packageName: 'ds-nb3-apps-environment-test',
    directory: path.resolve(
      import.meta.dirname,
      '../../database/main/migrations',
    ),
  },
];

describeMigration('202611120005_ds_nb3_apps_environment', {
  sources,
  up: async ({ expectCollection }) => {
    await expectCollection('dsNb3Apps').toHaveField('environmentId', {
      nullable: true,
    });
  },
  down: async ({ expectCollection }) => {
    await expectCollection('dsNb3Apps').not.toHaveField('environmentId');
  },
});
