import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * What people and the project manager decided about an issue's work. What is waiting for a decision is read from the
 * plugins' runs and activities; only the answers are stored.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202611090001_ds_issue_work',

  async up({ builder }) {
    await builder.createCollection('dsFailedRunDecisions', (collection) => {
      collection.string('runId', { length: 64 }).notNull();
      collection.string('issueId', { length: 64 }).notNull();
      collection.string('outcome', { length: 32 }).notNull();
      collection.string('decidedById', { length: 64 });
      collection.string('replacementRunId', { length: 64 });
      collection.datetime('decidedAt').notNull();

      collection.primary('runId', { name: 'pk_ds_failed_run_decisions' });
      collection.index(['issueId'], { name: 'idx_ds_failed_run_decisions_issue' });
    });
    await builder.createCollection('dsCommentRunGrants', (collection) => {
      collection.string('issueId', { length: 64 }).notNull();
      collection.datetime('continuedAt').notNull();
      collection.string('continuedById', { length: 64 }).notNull();

      collection.primary('issueId', { name: 'pk_ds_comment_run_grants' });
    });
    await builder.createCollection('dsOwnerHandoffDecisions', (collection) => {
      collection.string('activityId', { length: 64 }).notNull();
      collection.string('issueId', { length: 64 }).notNull();
      collection.string('outcome', { length: 16 }).notNull();
      collection.string('decidedById', { length: 64 }).notNull();
      collection.datetime('decidedAt').notNull();

      collection.primary('activityId', { name: 'pk_ds_owner_handoff_decisions' });
      collection.index(['issueId'], { name: 'idx_ds_owner_handoff_decisions_issue' });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('dsOwnerHandoffDecisions');
    await builder.dropCollection('dsCommentRunGrants');
    await builder.dropCollection('dsFailedRunDecisions');
  },
});

export default migration;
