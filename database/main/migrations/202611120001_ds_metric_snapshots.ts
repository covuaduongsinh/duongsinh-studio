import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Figures that no table holds: taps from opening the app to "needs me", the first bundle size, the work page's load time on 4G
 * (plan V, "Đo trước"). A person records each reading with a note on how it was taken, so V1 and V3 can be compared with it.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202611120001_ds_metric_snapshots',
  async up({ builder }) {
    await builder.createCollection('dsMetricSnapshots', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('metric', { length: 40 }).notNull(); // 'tapsToNeedMe' | 'firstBundleBytes' | 'issueLoad4gMs'
      collection.integer('value').notNull();
      collection.text('note').nullable();
      collection.datetime('takenAt').notNull();
      collection.string('takenByUserId', { length: 64 }).nullable();
      collection.datetime('createdAt').notNull();

      collection.primary('id', { name: 'pk_ds_metric_snapshots' });
      collection.index(['metric', 'takenAt'], {
        name: 'ix_ds_metric_snapshots_metric_taken_at',
      });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('dsMetricSnapshots');
  },
});

export default migration;
