import { defineMigration, type MigrationDefinition } from '@nocobase/db';

// Git hosting, S5.2: a connection of kind `app` is a GitHub App made from a manifest. Its id, its private key and its
// webhook secret (both sealed through the secrets service), the installation Studio acts through and how its webhook
// is doing live in `dsGitApps`; a manifest Studio sent to GitHub waits in `dsGitAppManifests` until GitHub sends the
// person back with a code (once); `dsGitWebhookDeliveries` remembers the deliveries handled so a redelivery is not
// handled twice.
const migration: MigrationDefinition = defineMigration({
  name: '202611050001_ds_git_apps',
  async up({ builder }) {
    await builder.createCollection('dsGitApps', (collection) => {
      collection.string('connectionId', { length: 64 }).notNull();
      collection.string('appId', { length: 64 }).notNull();
      collection.string('slug', { length: 200 }).notNull();
      collection.string('htmlUrl', { length: 500 }).notNull();
      collection.string('ownerLogin', { length: 200 }).nullable();
      collection.text('privateKeySealed').notNull();
      collection.text('webhookSecretSealed').notNull();
      collection.string('installationId', { length: 64 }).nullable();
      collection.string('installationAccount', { length: 200 }).nullable();
      collection.string('installationTargetType', { length: 32 }).nullable();
      collection.json('permissions').notNull();
      collection.json('events').notNull();
      collection.datetime('lastDeliveryAt').nullable();
      collection.string('lastEvent', { length: 64 }).nullable();
      collection.text('lastError').nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('connectionId', { name: 'pk_ds_git_apps' });
    });
    await builder.createCollection('dsGitAppManifests', (collection) => {
      collection.string('state', { length: 128 }).notNull();
      collection.string('connectionId', { length: 64 }).notNull();
      collection.string('name', { length: 100 }).notNull();
      collection.string('organization', { length: 200 }).nullable();
      collection.string('apiBaseUrl', { length: 500 }).notNull();
      collection.string('createdById', { length: 64 }).notNull();
      collection.datetime('expiresAt').notNull();
      collection.datetime('createdAt').notNull();
      collection.primary('state', { name: 'pk_ds_git_app_manifests' });
    });
    await builder.createCollection('dsGitWebhookDeliveries', (collection) => {
      collection.string('id', { length: 128 }).notNull();
      collection.string('connectionId', { length: 64 }).notNull();
      collection.string('event', { length: 64 }).notNull();
      collection.datetime('receivedAt').notNull();
      collection.primary('id', { name: 'pk_ds_git_webhook_deliveries' });
      collection.index('receivedAt', {
        name: 'ix_ds_git_webhook_deliveries_received',
      });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('dsGitWebhookDeliveries');
    await builder.dropCollection('dsGitAppManifests');
    await builder.dropCollection('dsGitApps');
  },
});

export default migration;
