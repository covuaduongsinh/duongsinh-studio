import path from 'node:path';
import type { MigrationSource } from '@nocobase/db';
import { describeMigration } from '@nocobase/app-testing/server';

const sources: readonly MigrationSource[] = [
  {
    packageName: 'ds-verification-contradicted-test',
    directory: path.resolve(
      import.meta.dirname,
      '../../database/main/migrations',
    ),
  },
];

describeMigration('202611140001_ds_verification_contradicted', {
  sources,
  up: async ({ expectCollection }) => {
    await expectCollection('dsVerifications').toHaveField('contradictedAt', {
      nullable: true,
    });
    await expectCollection('dsVerifications').toHaveField('contradictedBy', {
      nullable: true,
    });
  },
  down: async ({ expectCollection }) => {
    await expectCollection('dsVerifications').toExist();
    await expectCollection('dsVerifications').not.toHaveField('contradictedAt');
    await expectCollection('dsVerifications').not.toHaveField('contradictedBy');
  },
});
