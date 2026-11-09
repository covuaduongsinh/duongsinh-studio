import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * The Dokploy composes the NocoBase 3 driver (M4.2) created, one per App: the only ids its Dokploy client may touch,
 * and what the driver remembers about each (desired state, version, when it last started, the idle stop).
 */
const migration: MigrationDefinition = defineMigration({
  name: '202611110001_ds_nb3_apps',

  async up({ builder }) {
    await builder.createCollection('dsNb3Apps', (collection) => {
      collection.string('appId', { length: 128 }).notNull();
      collection.string('composeId', { length: 64 }).notNull();
      collection.string('composeName', { length: 64 }).notNull();
      collection.string('desiredState', { length: 16 }).notNull();
      collection.string('version', { length: 128 });
      collection.string('deploymentId', { length: 64 });
      collection.text('dbPasswordSealed');
      collection.integer('idleStopMinutes');
      collection.text('lastError');
      collection.datetime('startedAt');
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();

      collection.primary('appId', { name: 'pk_ds_nb3_apps' });
      collection.unique(['composeId'], { name: 'uq_ds_nb3_apps_compose' });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('dsNb3Apps');
  },
});

export default migration;
