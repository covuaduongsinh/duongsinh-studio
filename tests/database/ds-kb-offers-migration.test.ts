import path from 'node:path';
import type { MigrationSource } from '@nocobase/db';
import { describeMigration } from '@nocobase/app-testing/server';
import { expect } from 'vitest';

const sources: readonly MigrationSource[] = [
  {
    packageName: 'ds-kb-offers-test',
    directory: path.resolve(
      import.meta.dirname,
      '../../database/main/migrations',
    ),
  },
];

describeMigration('202611100004_ds_kb_offers', {
  sources,
  up: async ({ expectCollection }) => {
    const offers = await expectCollection('dsKbOffers').toExist();
    expect(offers.primaryKey).toEqual(['id']);
    await expectCollection('dsKbOffers').toHaveField('status', {
      nullable: false,
    });
    await expectCollection('dsKbOffers').toHaveField('docId', {
      nullable: true,
    });
  },
  down: async ({ expectCollection }) => {
    await expectCollection('dsKbOffers').not.toExist();
  },
});
