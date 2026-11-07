import path from 'node:path';
import type { MigrationSource } from '@nocobase/db';
import { describeMigration } from '@nocobase/app-testing/server';
import { expect } from 'vitest';

const sources: readonly MigrationSource[] = [
  {
    packageName: 'ds-organization-key-events-test',
    directory: path.resolve(
      import.meta.dirname,
      '../../database/main/migrations',
    ),
  },
];

describeMigration('202611100002_ds_organization_key_events', {
  sources,
  up: async ({ expectCollection }) => {
    const events = await expectCollection('dsOrganizationKeyEvents').toExist();
    expect(events.primaryKey).toEqual(['id']);
    await expectCollection('dsOrganizationKeyEvents').toHaveField('action', {
      nullable: false,
    });
    await expectCollection('dsOrganizationKeyEvents').toHaveField('actorId', {
      nullable: true,
    });
  },
  down: async ({ expectCollection }) => {
    await expectCollection('dsOrganizationKeyEvents').not.toExist();
  },
});
