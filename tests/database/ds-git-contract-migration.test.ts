import path from 'node:path';
import type { MigrationSource } from '@nocobase/db';
import { describeMigration } from '@nocobase/app-testing/server';
import { expect } from 'vitest';

const sources: readonly MigrationSource[] = [
  {
    packageName: 'ds-git-contract-test',
    directory: path.resolve(
      import.meta.dirname,
      '../../database/main/migrations',
    ),
  },
];

describeMigration('202611100003_ds_git_contract', {
  sources,
  up: async ({ expectCollection }) => {
    const reported = await expectCollection('dsReportedChecks').toExist();
    expect(reported.primaryKey).toEqual(['id']);
    const authorizations = await expectCollection(
      'dsGitAuthorizations',
    ).toExist();
    expect(authorizations.primaryKey).toEqual(['userId', 'connectionId']);
    await expectCollection('dsRepositories').toHaveField('referenceChecks', {
      nullable: true,
    });
    await expectCollection('dsPullRequests').toHaveField(
      'autoCompleteDisabled',
      { nullable: false },
    );
  },
  down: async ({ expectCollection }) => {
    await expectCollection('dsReportedChecks').not.toExist();
    await expectCollection('dsGitAuthorizations').not.toExist();
    await expectCollection('dsRepositories').not.toHaveField('referenceChecks');
    await expectCollection('dsPullRequests').not.toHaveField(
      'autoCompleteDisabled',
    );
  },
});
