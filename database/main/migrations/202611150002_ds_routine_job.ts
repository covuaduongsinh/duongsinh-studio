import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * A routine that is a job of the daemon, not an issue for an agent (plan S, S7): `job` names what Studio runs at its time
 * (`backupDump`). Null is every routine made before this, which opens an issue as before.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202611150002_ds_routine_job',
  async up({ builder }) {
    await builder.alterCollection('dsRoutines', (collection) => {
      collection.string('job', { length: 24 }).nullable();
    });
  },
  async down({ builder }) {
    await builder.alterCollection('dsRoutines', (collection) => {
      collection.dropField('job');
    });
  },
});

export default migration;
