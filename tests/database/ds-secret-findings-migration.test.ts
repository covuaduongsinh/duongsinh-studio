import path from 'node:path';
import type { MigrationSource } from '@nocobase/db';
import { describeMigration } from '@nocobase/app-testing/server';
import { expect } from 'vitest';

const sources: readonly MigrationSource[] = [
  {
    packageName: 'ds-secret-findings-test',
    directory: path.resolve(
      import.meta.dirname,
      '../../database/main/migrations',
    ),
  },
];

describeMigration('202611110008_ds_secret_findings', {
  sources,
  up: async ({ expectCollection }) => {
    const findings = await expectCollection('dsSecretFindings').toExist();
    expect(findings.primaryKey).toEqual(['id']);
    await expectCollection('dsSecretFindings').toHaveField('issueId', {
      nullable: true,
    });
    await expectCollection('dsSecretFindings').toHaveField('commentId', {
      nullable: true,
    });
    await expectCollection('dsSecretFindings').toHaveField('patternKey', {
      nullable: false,
    });
    await expectCollection('dsSecretFindings').toHaveField('fingerprint', {
      nullable: false,
    });
    await expectCollection('dsSecretFindings').toHaveField('status', {
      nullable: false,
    });
    await expectCollection('dsSecretFindings').toHaveField('createdAt', {
      nullable: false,
    });
    await expectCollection('dsSecretFindings').toHaveField('updatedAt', {
      nullable: false,
    });
  },
  down: async ({ expectCollection }) => {
    await expectCollection('dsSecretFindings').not.toExist();
  },
});
