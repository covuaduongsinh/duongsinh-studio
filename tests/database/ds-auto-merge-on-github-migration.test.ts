import path from 'node:path';
import type { MigrationSource } from '@nocobase/db';
import { describeMigration } from '@nocobase/app-testing/server';

const sources: readonly MigrationSource[] = [
  {
    packageName: 'ds-auto-merge-on-github-test',
    directory: path.resolve(
      import.meta.dirname,
      '../../database/main/migrations',
    ),
  },
];

describeMigration('202611140004_ds_autopilot_auto_merge_on_github', {
  sources,
  up: async ({ expectCollection }) => {
    await expectCollection('dsAutopilotSettings').toHaveField(
      'autoMergeOnGithub',
      { nullable: true },
    );
  },
  down: async ({ expectCollection }) => {
    await expectCollection('dsAutopilotSettings').toExist();
    await expectCollection('dsAutopilotSettings').not.toHaveField(
      'autoMergeOnGithub',
    );
  },
});
