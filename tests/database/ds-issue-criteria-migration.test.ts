import path from 'node:path';
import type { MigrationSource } from '@nocobase/db';
import { describeMigration } from '@nocobase/app-testing/server';
import { expect } from 'vitest';

const sources: readonly MigrationSource[] = [
  {
    packageName: 'ds-issue-criteria-test',
    directory: path.resolve(
      import.meta.dirname,
      '../../database/main/migrations',
    ),
  },
];

describeMigration('202611110003_ds_issue_criteria', {
  sources,
  up: async ({ expectCollection }) => {
    const criteria = await expectCollection('dsIssueCriteria').toExist();
    expect(criteria.primaryKey).toEqual(['id']);
    await expectCollection('dsIssueCriteria').toHaveField('issueId', {
      nullable: false,
    });
    await expectCollection('dsIssueCriteria').toHaveField('position', {
      nullable: false,
    });
    await expectCollection('dsIssueCriteria').toHaveField('text', {
      nullable: false,
    });
    await expectCollection('dsIssueCriteria').toHaveField('checkKind', {
      nullable: false,
    });
    await expectCollection('dsIssueCriteria').toHaveField('checkValue', {
      nullable: true,
    });
    await expectCollection('dsIssueCriteria').toHaveField('source', {
      nullable: false,
    });

    const defaults = await expectCollection(
      'dsProjectDefaultCriteria',
    ).toExist();
    expect(defaults.primaryKey).toEqual(['id']);
    await expectCollection('dsProjectDefaultCriteria').toHaveField(
      'projectId',
      { nullable: false },
    );
    await expectCollection('dsProjectDefaultCriteria').toHaveField('position', {
      nullable: false,
    });
    await expectCollection('dsProjectDefaultCriteria').toHaveField('text', {
      nullable: false,
    });
    await expectCollection('dsProjectDefaultCriteria').toHaveField(
      'checkKind',
      {
        nullable: false,
      },
    );
  },
  down: async ({ expectCollection }) => {
    await expectCollection('dsIssueCriteria').not.toExist();
    await expectCollection('dsProjectDefaultCriteria').not.toExist();
  },
});
