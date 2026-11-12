import path from 'node:path';
import type { MigrationSource } from '@nocobase/db';
import { describeMigration } from '@nocobase/app-testing/server';

const sources: readonly MigrationSource[] = [
  {
    packageName: 'ds-nb3-jobs-test',
    directory: path.resolve(
      import.meta.dirname,
      '../../database/main/migrations',
    ),
  },
];

describeMigration('202611120003_ds_nb3_jobs', {
  sources,
  up: async ({ connection, expectCollection }) => {
    await expectCollection('dsNb3Jobs').toExist();
    await expectCollection('dsNb3Jobs').toHaveField('logTail', {
      nullable: true,
    });
    const now = new Date();
    await connection.query
      .insertInto('dsNb3Jobs')
      .values({
        id: 'j1',
        appId: 'nb3-x',
        command: 'dbApply',
        isWrite: true,
        actorType: 'user',
        actorId: 'u1',
        status: 'running',
        startedAt: now,
        createdAt: now,
      })
      .execute();
  },
  down: async ({ expectCollection }) => {
    await expectCollection('dsNb3Jobs').not.toExist();
  },
});
