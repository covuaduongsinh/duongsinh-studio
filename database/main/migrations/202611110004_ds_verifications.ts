import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202611110004_ds_verifications',
  async up({ builder }) {
    await builder.createCollection('dsVerifications', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('issueId', { length: 64 }).notNull();
      collection.string('runId', { length: 64 }).nullable();
      collection.string('agentId', { length: 128 }).nullable();
      collection.string('headSha', { length: 64 }).notNull();
      collection.integer('attempt').notNull();
      collection.string('result', { length: 32 }).notNull();
      collection.datetime('createdAt').notNull();
      collection.primary('id', { name: 'pk_ds_verifications' });
      collection.index(['issueId', 'createdAt'], {
        name: 'ix_ds_verifications_issue_created',
      });
    });

    await builder.createCollection('dsVerificationItems', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('verificationId', { length: 64 }).notNull();
      collection.string('criterionId', { length: 64 }).notNull();
      collection.string('result', { length: 32 }).notNull();
      collection.integer('exitCode').nullable();
      collection.text('output').nullable();
      collection.integer('durationMs').nullable();
      collection.datetime('createdAt').notNull();
      collection.primary('id', { name: 'pk_ds_verification_items' });
      collection.index('verificationId', {
        name: 'ix_ds_verification_items_verification',
      });
    });

    await builder.createCollection('dsVerificationSettings', (collection) => {
      collection.string('id', { length: 32 }).notNull();
      collection.integer('maxConsecutiveFailures').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_ds_verification_settings' });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('dsVerificationItems');
    await builder.dropCollection('dsVerifications');
    await builder.dropCollection('dsVerificationSettings');
  },
});

export default migration;
