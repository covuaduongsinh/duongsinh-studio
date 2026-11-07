import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/** What happened to each organization API key, and who did it; a deleted key's history stays. */
const migration: MigrationDefinition = defineMigration({
  name: '202611100002_ds_organization_key_events',

  async up({ builder }) {
    await builder.createCollection('dsOrganizationKeyEvents', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('keyId', { length: 64 }).notNull();
      collection.string('action', { length: 32 }).notNull();
      collection.string('actorId', { length: 64 });
      collection.json('details');
      collection.datetime('createdAt').notNull();

      collection.primary('id', { name: 'pk_ds_organization_key_events' });
      collection.index(['keyId', 'createdAt'], {
        name: 'idx_ds_organization_key_events_key',
      });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('dsOrganizationKeyEvents');
  },
});

export default migration;
