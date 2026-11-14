import path from 'node:path';
import type { MigrationSource } from '@nocobase/db';
import { describeMigration } from '@nocobase/app-testing/server';

const sources: readonly MigrationSource[] = [
  {
    packageName: 'ds-verify-on-ci-test',
    directory: path.resolve(
      import.meta.dirname,
      '../../database/main/migrations',
    ),
  },
];

describeMigration('202611150001_ds_verify_on_ci', {
  sources,
  up: async ({ expectCollection }) => {
    await expectCollection('dsVerifications').toHaveField('source', {
      nullable: true,
    });
    await expectCollection('dsAutopilotSettings').toHaveField('verifyOnCi', {
      nullable: true,
    });
  },
  down: async ({ expectCollection }) => {
    await expectCollection('dsVerifications').not.toHaveField('source');
    await expectCollection('dsAutopilotSettings').not.toHaveField('verifyOnCi');
  },
});
