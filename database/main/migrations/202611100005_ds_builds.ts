import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * What CI reports of building a repository's Apps, the API key Studio keeps for that CI, and links that download a
 * release's archive without a session (only each link's hash is kept).
 */
const migration: MigrationDefinition = defineMigration({
  name: '202611100005_ds_builds',

  async up({ builder }) {
    await builder.createCollection('dsBuilds', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('appId', { length: 128 }).notNull();
      collection.string('repositoryId', { length: 64 });
      collection.string('sha', { length: 64 }).notNull();
      collection.string('state', { length: 16 }).notNull();
      collection.text('logsUrl');
      collection.text('message');
      collection.string('releaseId', { length: 64 });
      collection.datetime('uploadedAt');
      collection.datetime('reportedAt').notNull();
      collection.datetime('updatedAt').notNull();

      collection.primary('id', { name: 'pk_ds_builds' });
      collection.unique(['appId', 'sha'], { name: 'uq_ds_builds_app_sha' });
      collection.index(['repositoryId', 'reportedAt'], {
        name: 'idx_ds_builds_repository',
      });
    });
    await builder.createCollection('dsRepositoryCiKeys', (collection) => {
      collection.string('repositoryId', { length: 64 }).notNull();
      collection.string('keyId', { length: 64 }).notNull();
      collection.text('lastError');
      collection.datetime('createdAt').notNull();

      collection.primary('repositoryId', { name: 'pk_ds_repository_ci_keys' });
    });
    await builder.createCollection('dsReleaseDownloads', (collection) => {
      collection.string('tokenHash', { length: 64 }).notNull();
      collection.string('appId', { length: 128 }).notNull();
      collection.string('releaseId', { length: 64 }).notNull();
      collection.string('createdById', { length: 64 }).notNull();
      collection.datetime('expiresAt').notNull();
      collection.datetime('createdAt').notNull();

      collection.primary('tokenHash', { name: 'pk_ds_release_downloads' });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('dsReleaseDownloads');
    await builder.dropCollection('dsRepositoryCiKeys');
    await builder.dropCollection('dsBuilds');
  },
});

export default migration;
