import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * A verification CI contradicts (plan T, T2): an agent's `passed` verification of a head commit becomes `contradicted`
 * when the checks of that same head turn red afterwards. `result` is a plain string, so the new value needs no column
 * change; these two say when and by what it was contradicted. Both are null for every verification made before this.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202611140001_ds_verification_contradicted',

  async up({ builder }) {
    await builder.alterCollection('dsVerifications', (collection) => {
      collection.datetime('contradictedAt');
      collection.string('contradictedBy', { length: 32 });
    });
  },

  async down({ builder }) {
    await builder.alterCollection('dsVerifications', (collection) => {
      collection.dropField('contradictedBy');
      collection.dropField('contradictedAt');
    });
  },
});

export default migration;
