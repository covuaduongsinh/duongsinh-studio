import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Issue tiers (plan T, T10): how much care an issue asks for (`small`, `standard`, `sensitive`). An issue without a row
 * takes its project's `defaultTier`; sensitive paths raise a row's tier and remember what it was raised from.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202611140003_ds_issue_tiers',
  async up({ builder }) {
    await builder.createCollection('dsIssueTiers', (collection) => {
      collection.string('issueId', { length: 64 }).notNull();
      collection.string('tier', { length: 16 }).notNull();
      collection.string('raisedFrom', { length: 16 }).nullable();
      collection.text('reason').nullable();
      collection.datetime('updatedAt').notNull();
      collection.string('updatedById', { length: 64 }).nullable();
      collection.primary('issueId', { name: 'pk_ds_issue_tiers' });
    });
    await builder.alterCollection('dsAutopilotSettings', (collection) => {
      collection.string('defaultTier', { length: 16 }).nullable();
    });
  },
  async down({ builder }) {
    await builder.alterCollection('dsAutopilotSettings', (collection) => {
      collection.dropField('defaultTier');
    });
    await builder.dropCollection('dsIssueTiers');
  },
});

export default migration;
