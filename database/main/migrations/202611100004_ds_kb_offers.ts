import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/** An agent's suggestion to keep a file a person sent on an issue as knowledge, and what they decided. */
const migration: MigrationDefinition = defineMigration({
  name: '202611100004_ds_kb_offers',

  async up({ builder }) {
    await builder.createCollection('dsKbOffers', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('issueId', { length: 64 }).notNull();
      collection.string('attachmentId', { length: 64 }).notNull();
      collection.string('runId', { length: 64 }).notNull();
      collection.text('reason').notNull();
      collection.string('status', { length: 16 }).notNull();
      collection.string('targetScope', { length: 16 });
      collection.string('targetScopeId', { length: 64 });
      collection.string('decidedById', { length: 64 });
      collection.string('docId', { length: 64 });
      collection.datetime('createdAt').notNull();
      collection.datetime('decidedAt');

      collection.primary('id', { name: 'pk_ds_kb_offers' });
      collection.unique(['issueId', 'attachmentId'], {
        name: 'uq_ds_kb_offers_issue_attachment',
      });
      collection.index(['runId'], { name: 'idx_ds_kb_offers_run' });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('dsKbOffers');
  },
});

export default migration;
