import path from 'node:path';
import type { MigrationSource } from '@nocobase/db';
import { describeMigration } from '@nocobase/app-testing/server';

const sources: readonly MigrationSource[] = [
  {
    packageName: 'ds-git-pr-completion-test',
    directory: path.resolve(
      import.meta.dirname,
      '../../database/main/migrations',
    ),
  },
];

describeMigration('202611100007_ds_git_pr_completion', {
  sources,
  up: async ({ expectCollection }) => {
    await expectCollection('dsAutopilotIssueFlags').toHaveField(
      'autoCompleteOnMerge',
      { nullable: false },
    );
  },
  down: async ({ expectCollection }) => {
    await expectCollection('dsAutopilotIssueFlags').not.toHaveField(
      'autoCompleteOnMerge',
    );
  },
});
