import path from 'node:path';
import type { MigrationSource } from '@nocobase/db';
import { describeMigration } from '@nocobase/app-testing/server';

const sources: readonly MigrationSource[] = [
  {
    packageName: 'ds-routine-job-test',
    directory: path.resolve(
      import.meta.dirname,
      '../../database/main/migrations',
    ),
  },
];

describeMigration('202611150002_ds_routine_job', {
  sources,
  up: async ({ expectCollection }) => {
    await expectCollection('dsRoutines').toHaveField('job', { nullable: true });
  },
  down: async ({ expectCollection }) => {
    await expectCollection('dsRoutines').not.toHaveField('job');
  },
});
