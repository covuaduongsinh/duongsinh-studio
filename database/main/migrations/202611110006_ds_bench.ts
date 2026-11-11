import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202611110006_ds_bench',
  async up({ builder }) {
    await builder.createCollection('dsBenchRuns', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('set', { length: 64 }).notNull();
      collection.string('studioCommit', { length: 64 }).notNull();
      collection.string('model', { length: 64 }).notNull();
      collection.json('skillVersions').notNull();
      collection.datetime('startedAt').notNull();
      collection.datetime('finishedAt').nullable();
      collection.string('status', { length: 32 }).notNull();
      collection.string('trigger', { length: 32 }).notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_ds_bench_runs' });
      collection.index('set', { name: 'ix_ds_bench_runs_set' });
      collection.index('status', { name: 'ix_ds_bench_runs_status' });
      collection.index('createdAt', { name: 'ix_ds_bench_runs_created_at' });
    });

    await builder.createCollection('dsBenchResults', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('benchRunId', { length: 64 }).notNull();
      collection.string('taskKey', { length: 64 }).notNull();
      collection.string('issueId', { length: 64 }).nullable();
      collection.string('result', { length: 32 }).notNull();
      collection.text('reason').nullable();
      collection.integer('runs').notNull();
      collection.integer('outputTokens').notNull();
      collection.integer('totalTokens').notNull();
      collection.integer('returns').notNull();
      collection.integer('verifyAttempts').notNull();
      collection.integer('durationMs').notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_ds_bench_results' });
      collection.index('benchRunId', { name: 'ix_ds_bench_results_bench_run' });
      collection.index('taskKey', { name: 'ix_ds_bench_results_task_key' });
      collection.index('issueId', { name: 'ix_ds_bench_results_issue' });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('dsBenchResults');
    await builder.dropCollection('dsBenchRuns');
  },
});

export default migration;
