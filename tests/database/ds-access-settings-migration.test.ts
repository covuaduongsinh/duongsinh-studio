import path from 'node:path';
import type { MigrationSource } from '@nocobase/db';
import { describeMigration } from '@nocobase/app-testing/server';
import { expect } from 'vitest';

const sources: readonly MigrationSource[] = [
  {
    packageName: 'ds-access-settings-test',
    directory: path.resolve(
      import.meta.dirname,
      '../../database/main/migrations',
    ),
  },
];

// The one-row table behind GET/PUT /api/access/settings (`server/access/access-settings.ts`).
describeMigration('202611010003_ds_access_settings', {
  sources,
  up: async ({ connection, expectCollection }) => {
    const settings = await expectCollection('dsAccessSettings').toExist();
    expect(Object.keys(settings.fields)).toEqual([
      'id',
      'defaultRole',
      'updatedAt',
    ]);
    expect(settings.primaryKey).toEqual(['id']);
    await expectCollection('dsAccessSettings').toHaveField('defaultRole', {
      nullable: true,
    });
    await connection.query
      .insertInto('dsAccessSettings')
      .values({ id: 'default', defaultRole: null, updatedAt: new Date() })
      .execute();
    // One row per id.
    await expect(
      connection.query
        .insertInto('dsAccessSettings')
        .values({
          id: 'default',
          defaultRole: 'contributor',
          updatedAt: new Date(),
        })
        .execute(),
    ).rejects.toThrow();
  },
  down: async ({ expectCollection }) => {
    await expectCollection('dsAccessSettings').not.toExist();
  },
});
