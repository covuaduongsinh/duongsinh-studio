import path from 'node:path';
import type { MigrationSource } from '@nocobase/db';
import { describeMigration } from '@nocobase/app-testing/server';
import { expect } from 'vitest';

const sources: readonly MigrationSource[] = [
  {
    packageName: 'ds-outbound-budgets-test',
    directory: path.resolve(
      import.meta.dirname,
      '../../database/main/migrations',
    ),
  },
];

const TABLES = [
  'dsNotificationPreferences',
  'dsDecisionAlerts',
  'dsBudgets',
  'dsBudgetEvents',
];

describeMigration('202611100006_ds_outbound_budgets', {
  sources,
  up: async ({ expectCollection }) => {
    for (const table of TABLES) await expectCollection(table).toExist();
    const preferences = await expectCollection(
      'dsNotificationPreferences',
    ).toExist();
    expect(preferences.primaryKey).toEqual(['userId']);
    await expectCollection('dsBudgets').toHaveField('maxRuns', {
      nullable: true,
    });
  },
  down: async ({ expectCollection }) => {
    for (const table of TABLES) await expectCollection(table).not.toExist();
  },
});
