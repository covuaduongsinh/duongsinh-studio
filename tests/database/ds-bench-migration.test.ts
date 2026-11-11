import path from 'node:path';
import type { MigrationSource } from '@nocobase/db';
import { describeMigration } from '@nocobase/app-testing/server';
import { expect } from 'vitest';

const sources: readonly MigrationSource[] = [
  {
    packageName: 'ds-bench-test',
    directory: path.resolve(
      import.meta.dirname,
      '../../database/main/migrations',
    ),
  },
];

describeMigration('202611110006_ds_bench', {
  sources,
  up: async ({ expectCollection }) => {
    const runs = await expectCollection('dsBenchRuns').toExist();
    expect(runs.primaryKey).toEqual(['id']);
    await expectCollection('dsBenchRuns').toHaveField('set', {
      nullable: false,
    });
    await expectCollection('dsBenchRuns').toHaveField('studioCommit', {
      nullable: false,
    });
    await expectCollection('dsBenchRuns').toHaveField('model', {
      nullable: false,
    });
    await expectCollection('dsBenchRuns').toHaveField('skillVersions', {
      nullable: false,
    });
    await expectCollection('dsBenchRuns').toHaveField('startedAt', {
      nullable: false,
    });
    await expectCollection('dsBenchRuns').toHaveField('finishedAt', {
      nullable: true,
    });
    await expectCollection('dsBenchRuns').toHaveField('status', {
      nullable: false,
    });
    await expectCollection('dsBenchRuns').toHaveField('trigger', {
      nullable: false,
    });
    await expectCollection('dsBenchRuns').toHaveField('createdAt', {
      nullable: false,
    });
    await expectCollection('dsBenchRuns').toHaveField('updatedAt', {
      nullable: false,
    });

    const results = await expectCollection('dsBenchResults').toExist();
    expect(results.primaryKey).toEqual(['id']);
    await expectCollection('dsBenchResults').toHaveField('benchRunId', {
      nullable: false,
    });
    await expectCollection('dsBenchResults').toHaveField('taskKey', {
      nullable: false,
    });
    await expectCollection('dsBenchResults').toHaveField('issueId', {
      nullable: true,
    });
    await expectCollection('dsBenchResults').toHaveField('result', {
      nullable: false,
    });
    await expectCollection('dsBenchResults').toHaveField('reason', {
      nullable: true,
    });
    await expectCollection('dsBenchResults').toHaveField('runs', {
      nullable: false,
    });
    await expectCollection('dsBenchResults').toHaveField('outputTokens', {
      nullable: false,
    });
    await expectCollection('dsBenchResults').toHaveField('totalTokens', {
      nullable: false,
    });
    await expectCollection('dsBenchResults').toHaveField('returns', {
      nullable: false,
    });
    await expectCollection('dsBenchResults').toHaveField('verifyAttempts', {
      nullable: false,
    });
    await expectCollection('dsBenchResults').toHaveField('durationMs', {
      nullable: false,
    });
    await expectCollection('dsBenchResults').toHaveField('createdAt', {
      nullable: false,
    });
    await expectCollection('dsBenchResults').toHaveField('updatedAt', {
      nullable: false,
    });
  },
  down: async ({ expectCollection }) => {
    await expectCollection('dsBenchResults').not.toExist();
    await expectCollection('dsBenchRuns').not.toExist();
  },
});
