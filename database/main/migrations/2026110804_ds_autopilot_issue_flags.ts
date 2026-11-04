import { defineMigration, type MigrationDefinition } from '@nocobase/db';

export const AUTOPILOT_ISSUE_FLAGS_TABLE = 'dsAutopilotIssueFlags';

const migration: MigrationDefinition = defineMigration({
  name: '2026110804_ds_autopilot_issue_flags',

  async up({ builder }) {
    await builder.createCollection(AUTOPILOT_ISSUE_FLAGS_TABLE, (collection) => {
      collection.string('issueId', { length: 64 }).notNull();
      collection.boolean('allowAutoStart').notNull().defaultTo(true);
      collection.boolean('inheritFromParent').notNull().defaultTo(true);
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();

      collection.primary('issueId', { name: 'pk_ds_autopilot_issue_flags' });
    });
  },

  async down({ builder }) {
    await builder.dropCollection(AUTOPILOT_ISSUE_FLAGS_TABLE);
  },
});

export default migration;
