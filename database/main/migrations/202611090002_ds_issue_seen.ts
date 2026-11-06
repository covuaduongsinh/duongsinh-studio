import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/** When each person last looked at an issue in their follow-ups: what is unread counts from here. */
const migration: MigrationDefinition = defineMigration({
  name: '202611090002_ds_issue_seen',

  async up({ builder }) {
    await builder.createCollection('dsIssueSeen', (collection) => {
      collection.string('userId', { length: 64 }).notNull();
      collection.string('issueId', { length: 64 }).notNull();
      collection.datetime('seenAt').notNull();

      collection.primary(['userId', 'issueId'], { name: 'pk_ds_issue_seen' });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('dsIssueSeen');
  },
});

export default migration;
