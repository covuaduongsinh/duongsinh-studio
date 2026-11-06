import path from 'node:path';
import type { MigrationSource } from '@nocobase/db';
import { describeMigration } from '@nocobase/app-testing/server';
import { expect } from 'vitest';

const sources: readonly MigrationSource[] = [
  {
    packageName: 'ds-issue-work-test',
    directory: path.resolve(
      import.meta.dirname,
      '../../database/main/migrations',
    ),
  },
];

const TABLES = [
  'dsFailedRunDecisions',
  'dsCommentRunGrants',
  'dsOwnerHandoffDecisions',
];

describeMigration('202611090001_ds_issue_work', {
  sources,
  up: async ({ connection, expectCollection }) => {
    for (const table of TABLES) await expectCollection(table).toExist();
    expect(
      (await expectCollection('dsFailedRunDecisions').toExist()).primaryKey,
    ).toEqual(['runId']);
    await expectCollection('dsFailedRunDecisions').toHaveField('outcome', {
      nullable: false,
    });
    await expectCollection('dsFailedRunDecisions').toHaveField(
      'replacementRunId',
      {
        nullable: true,
      },
    );

    await connection.query
      .insertInto('dsFailedRunDecisions')
      .values({
        runId: 'run-1',
        issueId: 'issue-1',
        outcome: 'retried',
        decidedAt: new Date(),
      })
      .execute();
    await expect(
      connection.query
        .insertInto('dsFailedRunDecisions')
        .values({
          runId: 'run-1',
          issueId: 'issue-1',
          outcome: 'cancelled',
          decidedAt: new Date(),
        })
        .execute(),
    ).rejects.toThrow();
  },
  down: async ({ expectCollection }) => {
    for (const table of TABLES) await expectCollection(table).not.toExist();
  },
});
