import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202611110005_ds_review_criteria_checks',
  async up({ builder }) {
    await builder.createCollection('dsReviewCriteriaChecks', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('reviewId', { length: 64 }).notNull();
      collection.string('criterionId', { length: 64 }).notNull();
      collection.boolean('passed').notNull();
      collection.text('notes').nullable();
      collection.datetime('createdAt').notNull();
      collection.primary('id', { name: 'pk_ds_review_criteria_checks' });
      collection.index('reviewId', {
        name: 'ix_ds_review_criteria_checks_review',
      });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('dsReviewCriteriaChecks');
  },
});

export default migration;
