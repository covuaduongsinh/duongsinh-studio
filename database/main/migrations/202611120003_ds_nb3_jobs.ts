import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Jobs Studio asked the ds-nb3-exec daemon to run inside a NocoBase 3 App (plan V, V4.3): who asked, what, how it ended and
 * the masked tail of its log. Rows older than 14 days are deleted when a new job starts.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202611120003_ds_nb3_jobs',
  async up({ builder }) {
    await builder.createCollection('dsNb3Jobs', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('appId', { length: 64 }).notNull();
      collection.string('command', { length: 40 }).notNull();
      collection.boolean('isWrite').notNull();
      collection.string('actorType', { length: 20 }).notNull();
      collection.string('actorId', { length: 64 }).notNull();
      // queued is never stored: the row is made when the daemon is asked. running | succeeded | failed | timeout | denied
      collection.string('status', { length: 20 }).notNull();
      collection.integer('exitCode').nullable();
      collection.string('errorCode', { length: 40 }).nullable();
      collection.text('logTail').nullable();
      collection.string('logSha256', { length: 64 }).nullable();
      collection.integer('durationMs').nullable();
      collection.datetime('startedAt').notNull();
      collection.datetime('finishedAt').nullable();
      collection.datetime('createdAt').notNull();

      collection.primary('id', { name: 'pk_ds_nb3_jobs' });
      collection.index(['appId', 'createdAt'], {
        name: 'ix_ds_nb3_jobs_app_created_at',
      });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('dsNb3Jobs');
  },
});

export default migration;
