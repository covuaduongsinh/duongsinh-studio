import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * The tool-quota wait of each project (plan S, S10): until when its runs are held back, the concurrency in the meantime and
 * the last delay Studio guessed. Kept in memory only, a deploy made the "Quota" card say all was well and started the
 * backoff again; this is what a restart reads back. A row is removed when the project no longer waits.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202611150003_ds_quota_throttles',
  async up({ builder }) {
    await builder.createCollection('dsQuotaThrottles', (collection) => {
      collection.string('projectId', { length: 64 }).notNull();
      collection.datetime('activeUntil').nullable();
      collection.integer('retryDelayMs').nullable();
      collection.integer('effectiveConcurrency').nullable();
      // The last guessed delay, kept past the end of the wait so the backoff goes on growing while the quota stays out.
      collection.integer('lastDelayMs').nullable();
      collection.datetime('updatedAt').notNull();
      collection.primary('projectId', { name: 'pk_ds_quota_throttles' });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('dsQuotaThrottles');
  },
});

export default migration;
