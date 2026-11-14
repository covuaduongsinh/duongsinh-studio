import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Two approaches for one issue (plan T, T12): the two read-only runs asked for, so that when both end the agent that holds
 * the issue is asked to compare them and choose. `comparedAt` is set once it was asked, so it is asked once.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202611140006_ds_two_approaches',
  async up({ builder }) {
    await builder.createCollection('dsTwoApproaches', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('issueId', { length: 64 }).notNull();
      collection.string('firstRunId', { length: 64 }).notNull();
      collection.string('secondRunId', { length: 64 }).notNull();
      collection.string('firstAgentId', { length: 64 }).notNull();
      collection.string('secondAgentId', { length: 64 }).notNull();
      collection.string('createdById', { length: 64 }).notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('comparedAt').nullable();
      collection.primary('id', { name: 'pk_ds_two_approaches' });
      collection.index(['issueId'], { name: 'ix_ds_two_approaches_issue' });
      collection.index(['firstRunId'], { name: 'ix_ds_two_approaches_first_run' });
      collection.index(['secondRunId'], { name: 'ix_ds_two_approaches_second_run' });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('dsTwoApproaches');
  },
});

export default migration;
