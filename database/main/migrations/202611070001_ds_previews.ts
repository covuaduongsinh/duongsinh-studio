import { defineMigration, type MigrationDefinition } from '@nocobase/db';

// Previews and staging of NocoBase 2 (S5.6, `server/previews/service.ts`):
//
// - `dsPreviewSlots`: the Dokploy compose Studio created for each slot (`preview`, `staging`): the only composes the
//   Dokploy client may touch (`server/previews/dokploy.ts`);
// - `dsPreviews`: each preview or staging deploy — the pull request (or `main`) and commit, the workflow run whose
//   plugins it installs, its status and why, and the sealed credentials of its sample NocoBase.
//
// The preview environment's row is also brought to one slot at `preview.dsc.edu.vn` (no wildcard name exists) unless an
// administrator changed it since S5.4.
const migration: MigrationDefinition = defineMigration({
  name: '202611070001_ds_previews',
  async up({ builder, query }) {
    await builder.createCollection('dsPreviewSlots', (collection) => {
      collection.string('slot', { length: 16 }).notNull();
      collection.string('composeId', { length: 64 }).notNull();
      collection.string('appName', { length: 100 }).nullable();
      collection.string('previewId', { length: 64 }).nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('slot', { name: 'pk_ds_preview_slots' });
    });
    await builder.createCollection('dsPreviews', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('slot', { length: 16 }).notNull();
      collection.string('repositoryId', { length: 64 }).notNull();
      collection.integer('pullNumber').nullable();
      collection.string('pullRequestId', { length: 64 }).nullable();
      collection.string('issueId', { length: 64 }).nullable();
      collection.string('branch', { length: 255 }).notNull();
      collection.string('sha', { length: 64 }).notNull();
      collection.bigInt('runId').nullable();
      collection.string('logsUrl', { length: 500 }).nullable();
      collection.string('status', { length: 16 }).notNull();
      collection.text('reason').nullable();
      collection.string('url', { length: 500 }).nullable();
      collection.text('credentialsSealed').nullable();
      collection.string('callbackHash', { length: 128 }).nullable();
      collection.string('requestedById', { length: 64 }).nullable();
      collection.datetime('readyAt').nullable();
      collection.datetime('lastUsedAt').nullable();
      collection.datetime('stoppedAt').nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_ds_previews' });
      collection.index(['slot', 'status'], { name: 'ix_ds_previews_slot_status' });
      collection.index(['repositoryId', 'pullNumber'], { name: 'ix_ds_previews_pull' });
    });
    await query
      .updateTable('dsEnvironments')
      .set({
        maxApps: 1,
        publicUrlPattern: 'https://preview.dsc.edu.vn',
        description:
          'NocoBase 2 dựng tạm cho pull request có nhãn `preview`, dữ liệu mẫu; một chỗ duy nhất ở preview.dsc.edu.vn (PR khác xếp hàng), rảnh 30 phút thì dừng, xoá khi PR đóng.',
        updatedAt: new Date(),
      })
      .where('key', '=', 'preview')
      .where('publicUrlPattern', '=', 'https://pr-{number}.preview.dsc.edu.vn')
      .execute();
  },
  async down({ builder, query }) {
    await builder.dropCollection('dsPreviews');
    await builder.dropCollection('dsPreviewSlots');
    await query
      .updateTable('dsEnvironments')
      .set({ maxApps: 2, publicUrlPattern: 'https://pr-{number}.preview.dsc.edu.vn', updatedAt: new Date() })
      .where('key', '=', 'preview')
      .where('publicUrlPattern', '=', 'https://preview.dsc.edu.vn')
      .execute();
  },
});

export default migration;
