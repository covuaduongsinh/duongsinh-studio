import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Which release environment an App's compose belongs to (V5.1), so the places an environment offers (`maxApps`) are counted
 * among its own Apps and a production App no longer takes a preview's place. Rows made before this stay null and count
 * against every environment, as they did.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202611120005_ds_nb3_apps_environment',

  async up({ builder }) {
    await builder.alterCollection('dsNb3Apps', (collection) => {
      collection.string('environmentId', { length: 64 }).nullable();
    });
  },

  async down({ builder }) {
    await builder.alterCollection('dsNb3Apps', (collection) => {
      collection.dropField('environmentId');
    });
  },
});

export default migration;
