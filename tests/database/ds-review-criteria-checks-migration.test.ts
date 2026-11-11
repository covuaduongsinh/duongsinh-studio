import path from 'node:path';
import type { MigrationSource } from '@nocobase/db';
import { describeMigration } from '@nocobase/app-testing/server';
import { expect } from 'vitest';

const sources: readonly MigrationSource[] = [
  {
    packageName: 'ds-review-criteria-checks-test',
    directory: path.resolve(
      import.meta.dirname,
      '../../database/main/migrations',
    ),
  },
];

describeMigration('202611110005_ds_review_criteria_checks', {
  sources,
  up: async ({ expectCollection }) => {
    const checks = await expectCollection('dsReviewCriteriaChecks').toExist();
    expect(checks.primaryKey).toEqual(['id']);
    await expectCollection('dsReviewCriteriaChecks').toHaveField('reviewId', {
      nullable: false,
    });
    await expectCollection('dsReviewCriteriaChecks').toHaveField(
      'criterionId',
      {
        nullable: false,
      },
    );
    await expectCollection('dsReviewCriteriaChecks').toHaveField('passed', {
      nullable: false,
    });
    await expectCollection('dsReviewCriteriaChecks').toHaveField('notes', {
      nullable: true,
    });
    await expectCollection('dsReviewCriteriaChecks').toHaveField('createdAt', {
      nullable: false,
    });
  },
  down: async ({ expectCollection }) => {
    await expectCollection('dsReviewCriteriaChecks').not.toExist();
  },
});
