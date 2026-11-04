import { defineMigration, type MigrationDefinition } from '@nocobase/db';

// Structured review submissions by reviewing agents (AP1, `server/reviews/service.ts`):
//
// - `dsReviews`: each review submission by an agent on a pull request and commit headSha.
//   Captures the verdict (approve | changes), mustFix/shouldFix counts, checklist items,
//   reviewer and author agent IDs, sameModel indicator, and review summary.
const migration: MigrationDefinition = defineMigration({
  name: '2026110801_ds_reviews',
  async up({ builder }) {
    await builder.createCollection('dsReviews', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('pullRequestId', { length: 64 }).notNull();
      collection.string('issueId', { length: 64 }).nullable();
      collection.string('headSha', { length: 64 }).notNull();
      collection.string('reviewerAgentId', { length: 64 }).notNull();
      collection.string('reviewerRunId', { length: 64 }).notNull();
      collection.string('authorAgentId', { length: 64 }).notNull();
      collection.string('verdict', { length: 16 }).notNull();
      collection.integer('mustFix').notNull().defaultTo(0);
      collection.integer('shouldFix').notNull().defaultTo(0);
      collection.string('kind', { length: 16 }).notNull().defaultTo('code');
      collection.boolean('sameModel').notNull().defaultTo(false);
      collection.json('checklist').notNull();
      collection.text('summary').notNull();
      collection.datetime('createdAt').notNull();
      collection.primary('id', { name: 'pk_ds_reviews' });
      collection.index(['pullRequestId'], { name: 'ix_ds_reviews_pull' });
      collection.index(['pullRequestId', 'headSha'], { name: 'ix_ds_reviews_pull_head' });
      collection.index(['pullRequestId', 'kind'], { name: 'ix_ds_reviews_pull_kind' });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('dsReviews');
  },
});

export default migration;
