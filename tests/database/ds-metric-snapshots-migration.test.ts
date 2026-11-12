import path from 'node:path';
import type { MigrationSource } from '@nocobase/db';
import { describeMigration } from '@nocobase/app-testing/server';
import { expect } from 'vitest';

const sources: readonly MigrationSource[] = [
  {
    packageName: 'ds-metric-snapshots-test',
    directory: path.resolve(
      import.meta.dirname,
      '../../database/main/migrations',
    ),
  },
];

describeMigration('202611120001_ds_metric_snapshots', {
  sources,
  up: async ({ expectCollection }) => {
    const table = await expectCollection('dsMetricSnapshots').toExist();
    expect(table.primaryKey).toEqual(['id']);
    for (const field of ['metric', 'value', 'takenAt', 'createdAt'])
      await expectCollection('dsMetricSnapshots').toHaveField(field, {
        nullable: false,
      });
    for (const field of ['note', 'takenByUserId'])
      await expectCollection('dsMetricSnapshots').toHaveField(field, {
        nullable: true,
      });
  },
  down: async ({ expectCollection }) => {
    await expectCollection('dsMetricSnapshots').not.toExist();
  },
});
