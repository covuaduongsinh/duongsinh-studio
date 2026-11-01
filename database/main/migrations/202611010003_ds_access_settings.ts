import { defineMigration, type MigrationDefinition } from '@nocobase/db';

// Studio access settings (one row, id `default`): the role a new member is given once, or none.
const migration: MigrationDefinition = defineMigration({
  name: '202611010003_ds_access_settings',
  async up({ builder }) {
    await builder.createCollection('dsAccessSettings', (collection) => {
      collection.string('id', { length: 32 }).notNull();
      collection.string('defaultRole', { length: 64 }).nullable();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_ds_access_settings' });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('dsAccessSettings');
  },
});

export default migration;
