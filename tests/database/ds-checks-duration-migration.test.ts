import path from 'node:path';
import type { MigrationSource } from '@nocobase/db';
import { describeMigration } from '@nocobase/app-testing/server';

const sources: readonly MigrationSource[] = [
  {
    packageName: 'ds-checks-duration-test',
    directory: path.resolve(
      import.meta.dirname,
      '../../database/main/migrations',
    ),
  },
];

describeMigration('202611120002_ds_checks_duration', {
  sources,
  up: async ({ expectCollection }) => {
    await expectCollection('dsReportedChecks').toHaveField('startedAt', {
      nullable: true,
    });
    await expectCollection('dsReportedChecks').toHaveField('completedAt', {
      nullable: true,
    });
  },
  down: async ({ expectCollection }) => {
    await expectCollection('dsReportedChecks').toExist();
    await expectCollection('dsReportedChecks').not.toHaveField('startedAt');
    await expectCollection('dsReportedChecks').not.toHaveField('completedAt');
  },
});
