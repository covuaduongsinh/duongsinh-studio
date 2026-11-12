import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * How long a check ran (plan V, V2.3): CI reports `pending` and then `success` or `failure` for the same commit and
 * name, and the second report replaced the first, so nothing said how long CI took. `startedAt` is the first `pending`
 * report of the run, `completedAt` the final one. Both are null for rows reported before this migration.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202611120002_ds_checks_duration',

  async up({ builder }) {
    await builder.alterCollection('dsReportedChecks', (collection) => {
      collection.datetime('startedAt');
      collection.datetime('completedAt');
    });
  },

  async down({ builder }) {
    await builder.alterCollection('dsReportedChecks', (collection) => {
      collection.dropField('completedAt');
      collection.dropField('startedAt');
    });
  },
});

export default migration;
