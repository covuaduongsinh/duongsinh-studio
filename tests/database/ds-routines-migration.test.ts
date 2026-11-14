import path from 'node:path';
import type { MigrationSource } from '@nocobase/db';
import { describeMigration } from '@nocobase/app-testing/server';

const sources: readonly MigrationSource[] = [
  {
    packageName: 'ds-routines-test',
    directory: path.resolve(
      import.meta.dirname,
      '../../database/main/migrations',
    ),
  },
];

describeMigration('202611140005_ds_routines', {
  sources,
  up: async ({ expectCollection }) => {
    await expectCollection('dsRoutines').toHaveField('cron', {
      nullable: false,
    });
    await expectCollection('dsRoutines').toHaveField('enabled', {
      nullable: false,
    });
    await expectCollection('dsRoutines').toHaveField('lastRunAt', {
      nullable: true,
    });
    await expectCollection('dsRoutineProjects').toHaveField('projectId', {
      nullable: false,
    });
  },
  down: async ({ expectCollection }) => {
    await expectCollection('dsRoutines').not.toExist();
    await expectCollection('dsRoutineProjects').not.toExist();
  },
});
