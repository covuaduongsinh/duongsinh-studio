import path from 'node:path';
import type { MigrationSource } from '@nocobase/db';
import { describeMigration } from '@nocobase/app-testing/server';

const sources: readonly MigrationSource[] = [
  {
    packageName: 'ds-two-approaches-test',
    directory: path.resolve(
      import.meta.dirname,
      '../../database/main/migrations',
    ),
  },
];

describeMigration('202611140006_ds_two_approaches', {
  sources,
  up: async ({ expectCollection }) => {
    await expectCollection('dsTwoApproaches').toHaveField('firstRunId', {
      nullable: false,
    });
    await expectCollection('dsTwoApproaches').toHaveField('comparedAt', {
      nullable: true,
    });
  },
  down: async ({ expectCollection }) => {
    await expectCollection('dsTwoApproaches').not.toExist();
  },
});
