import path from 'node:path';
import type { MigrationSource } from '@nocobase/db';
import { describeMigration } from '@nocobase/app-testing/server';

const sources: readonly MigrationSource[] = [
  {
    packageName: 'ds-issue-tiers-test',
    directory: path.resolve(
      import.meta.dirname,
      '../../database/main/migrations',
    ),
  },
];

describeMigration('202611140003_ds_issue_tiers', {
  sources,
  up: async ({ expectCollection }) => {
    await expectCollection('dsIssueTiers').toHaveField('tier', {
      nullable: false,
    });
    await expectCollection('dsIssueTiers').toHaveField('raisedFrom', {
      nullable: true,
    });
    await expectCollection('dsAutopilotSettings').toHaveField('defaultTier', {
      nullable: true,
    });
  },
  down: async ({ expectCollection }) => {
    await expectCollection('dsIssueTiers').not.toExist();
    await expectCollection('dsAutopilotSettings').toExist();
    await expectCollection('dsAutopilotSettings').not.toHaveField(
      'defaultTier',
    );
  },
});
