import path from 'node:path';
import type { MigrationSource } from '@nocobase/db';
import { describeMigration } from '@nocobase/app-testing/server';

const sources: readonly MigrationSource[] = [
  {
    packageName: 'ds-quota-throttles-test',
    directory: path.resolve(
      import.meta.dirname,
      '../../database/main/migrations',
    ),
  },
];

describeMigration('202611150003_ds_quota_throttles', {
  sources,
  up: async ({ expectCollection }) => {
    const table = expectCollection('dsQuotaThrottles');
    await table.toHaveField('projectId', { nullable: false });
    await table.toHaveField('activeUntil', { nullable: true });
    await table.toHaveField('lastDelayMs', { nullable: true });
  },
  down: async ({ expectCollection }) => {
    await expectCollection('dsQuotaThrottles').not.toExist();
  },
});
