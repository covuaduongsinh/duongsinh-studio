import path from 'node:path';
import type { MigrationSource } from '@nocobase/db';
import { describeMigration } from '@nocobase/app-testing/server';
import { expect } from 'vitest';

const sources: readonly MigrationSource[] = [
  {
    packageName: 'ds-issue-seen-test',
    directory: path.resolve(
      import.meta.dirname,
      '../../database/main/migrations',
    ),
  },
];

describeMigration('202611090002_ds_issue_seen', {
  sources,
  up: async ({ expectCollection }) => {
    const collection = await expectCollection('dsIssueSeen').toExist();
    expect(collection.primaryKey).toEqual(['userId', 'issueId']);
    await expectCollection('dsIssueSeen').toHaveField('seenAt', {
      nullable: false,
    });
  },
  down: async ({ expectCollection }) => {
    await expectCollection('dsIssueSeen').not.toExist();
  },
});
