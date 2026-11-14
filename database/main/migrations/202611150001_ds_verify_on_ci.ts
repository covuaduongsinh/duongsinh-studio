import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Verification on CI (plan S, S4). `dsVerifications.source` says who submitted a verification: `agent` (a run), `ci` (the
 * project's CI key) or `person`; null is every verification made before this, read as `agent`. A project may ask that only
 * `ci` counts (`dsAutopilotSettings.verifyOnCi`); null and false are the same, off.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202611150001_ds_verify_on_ci',
  async up({ builder }) {
    await builder.alterCollection('dsVerifications', (collection) => {
      collection.string('source', { length: 16 }).nullable();
    });
    await builder.alterCollection('dsAutopilotSettings', (collection) => {
      collection.boolean('verifyOnCi').nullable();
    });
  },
  async down({ builder }) {
    await builder.alterCollection('dsAutopilotSettings', (collection) => {
      collection.dropField('verifyOnCi');
    });
    await builder.alterCollection('dsVerifications', (collection) => {
      collection.dropField('source');
    });
  },
});

export default migration;
