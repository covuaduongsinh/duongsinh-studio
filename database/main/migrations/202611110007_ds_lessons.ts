import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202611110007_ds_lessons',
  async up({ builder }) {
    await builder.createCollection('dsLessons', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('projectId', { length: 64 }).nullable();
      collection.string('issueId', { length: 64 }).nullable();
      collection.string('reviewId', { length: 64 }).nullable();
      collection.text('mistake').notNull();
      collection.text('rule').notNull();
      collection.string('tag', { length: 128 }).notNull();
      collection.string('target', { length: 64 }).notNull(); // 'skill' | 'knowledge' | 'sensitivePath' | 'projectCriteria'
      collection.text('targetRef').nullable();
      collection.string('status', { length: 32 }).notNull(); // 'proposed' | 'accepted' | 'rejected' | 'applied'
      collection.string('proposedByType', { length: 32 }).notNull(); // 'user' | 'agent'
      collection.string('proposedById', { length: 64 }).nullable();
      collection.string('decidedBy', { length: 64 }).nullable();
      collection.text('appliedRef').nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();

      collection.primary('id', { name: 'pk_ds_lessons' });
      collection.index('projectId', { name: 'ix_ds_lessons_project_id' });
      collection.index('issueId', { name: 'ix_ds_lessons_issue_id' });
      collection.index('reviewId', { name: 'ix_ds_lessons_review_id' });
      collection.index('status', { name: 'ix_ds_lessons_status' });
      collection.index('tag', { name: 'ix_ds_lessons_tag' });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('dsLessons');
  },
});

export default migration;
