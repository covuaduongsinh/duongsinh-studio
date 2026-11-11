import path from 'node:path';
import type { MigrationSource } from '@nocobase/db';
import { describeMigration } from '@nocobase/app-testing/server';
import { expect } from 'vitest';

const sources: readonly MigrationSource[] = [
  {
    packageName: 'ds-verifications-test',
    directory: path.resolve(
      import.meta.dirname,
      '../../database/main/migrations',
    ),
  },
];

describeMigration('202611110004_ds_verifications', {
  sources,
  up: async ({ expectCollection }) => {
    const verifications = await expectCollection('dsVerifications').toExist();
    expect(verifications.primaryKey).toEqual(['id']);
    await expectCollection('dsVerifications').toHaveField('issueId', {
      nullable: false,
    });
    await expectCollection('dsVerifications').toHaveField('headSha', {
      nullable: false,
    });
    await expectCollection('dsVerifications').toHaveField('attempt', {
      nullable: false,
    });
    await expectCollection('dsVerifications').toHaveField('result', {
      nullable: false,
    });

    const items = await expectCollection('dsVerificationItems').toExist();
    expect(items.primaryKey).toEqual(['id']);
    await expectCollection('dsVerificationItems').toHaveField(
      'verificationId',
      {
        nullable: false,
      },
    );
    await expectCollection('dsVerificationItems').toHaveField('criterionId', {
      nullable: false,
    });
    await expectCollection('dsVerificationItems').toHaveField('result', {
      nullable: false,
    });

    const settings = await expectCollection('dsVerificationSettings').toExist();
    expect(settings.primaryKey).toEqual(['id']);
    await expectCollection('dsVerificationSettings').toHaveField(
      'maxConsecutiveFailures',
      { nullable: false },
    );
  },
  down: async ({ expectCollection }) => {
    await expectCollection('dsVerificationItems').not.toExist();
    await expectCollection('dsVerifications').not.toExist();
    await expectCollection('dsVerificationSettings').not.toExist();
  },
});
