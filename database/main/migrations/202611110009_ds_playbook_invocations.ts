import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202611110009_ds_playbook_invocations',
  async up({ builder }) {
    await builder.createCollection('dsPlaybookInvocations', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('playbookSlug', { length: 64 }).notNull();
      collection.string('issueId', { length: 64 }).notNull();
      collection.string('commentId', { length: 64 }).nullable();
      collection.text('params').nullable();
      collection.string('invokedByUserId', { length: 64 }).nullable();
      collection.datetime('createdAt').notNull();

      collection.primary('id', { name: 'pk_ds_playbook_invocations' });
      collection.index('playbookSlug', {
        name: 'ix_ds_playbook_invocations_slug',
      });
      collection.index('issueId', {
        name: 'ix_ds_playbook_invocations_issue_id',
      });
      collection.index('createdAt', {
        name: 'ix_ds_playbook_invocations_created_at',
      });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('dsPlaybookInvocations');
  },
});

export default migration;
