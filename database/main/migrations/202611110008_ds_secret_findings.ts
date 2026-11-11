import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202611110008_ds_secret_findings',
  async up({ builder }) {
    await builder.createCollection('dsSecretFindings', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('issueId', { length: 64 }).nullable();
      collection.string('commentId', { length: 64 }).nullable();
      collection.string('patternKey', { length: 128 }).notNull();
      collection.string('fingerprint', { length: 64 }).notNull();
      collection.string('status', { length: 32 }).notNull(); // 'active' | 'resolved' | 'ignored'
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();

      collection.primary('id', { name: 'pk_ds_secret_findings' });
      collection.index('issueId', { name: 'ix_ds_secret_findings_issue_id' });
      collection.index('commentId', { name: 'ix_ds_secret_findings_comment_id' });
      collection.index('patternKey', { name: 'ix_ds_secret_findings_pattern_key' });
      collection.index('fingerprint', { name: 'ix_ds_secret_findings_fingerprint' });
      collection.index('status', { name: 'ix_ds_secret_findings_status' });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('dsSecretFindings');
  },
});

export default migration;
