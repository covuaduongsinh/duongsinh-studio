import { defineMigration, type MigrationDefinition } from '@nocobase/db';

// Releases, S5.4–S5.5 (`server/releases/service.ts`). Dương Sinh's environments run outside Studio (a NocoBase 2
// compose on the VPS, production deployed by the owner through Dokploy), so Studio records rather than deploys:
//
// - `dsEnvironments`: preview, staging and production as Studio knows them (the releases plugin's environments need a
//   driver that runs Apps, which these are not);
// - `dsRepositoryApps`: the App id a repository is known by in each environment (typed again to approve);
// - `dsReleaseLines`: which tags of a repository's branch are versions (`stable`: `main`, `v*`);
// - `dsVersions` and `dsVersionTasks`: each tag found, and the issues whose merged pull requests it carries;
// - `dsDeploymentRecords`: "this version is on staging / production" and rollbacks, by whom and why;
// - `dsDeploymentRequests`: a request someone made for the owner to decide (marking production).
const migration: MigrationDefinition = defineMigration({
  name: '202611060001_ds_releases',
  async up({ builder }) {
    await builder.createCollection('dsEnvironments', (collection) => {
      collection.string('key', { length: 32 }).notNull();
      collection.string('name', { length: 100 }).notNull();
      collection.string('purpose', { length: 16 }).notNull();
      collection.string('runsOn', { length: 16 }).notNull();
      collection.boolean('recordOnly').notNull();
      collection.boolean('protected').notNull();
      collection.json('approvers').notNull();
      collection.integer('maxApps').nullable();
      collection.integer('idleStopMinutes').nullable();
      collection.boolean('removeOnClose').notNull();
      collection.string('publicUrlPattern', { length: 300 }).nullable();
      collection.text('description').nullable();
      collection.integer('position').notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('key', { name: 'pk_ds_environments' });
    });
    await builder.createCollection('dsRepositoryApps', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('repositoryId', { length: 64 }).notNull();
      collection.string('environmentKey', { length: 32 }).notNull();
      collection.string('appId', { length: 100 }).notNull();
      collection.string('url', { length: 500 }).nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_ds_repository_apps' });
      collection.unique(['repositoryId', 'environmentKey'], {
        name: 'ux_ds_repository_apps_pair',
      });
    });
    await builder.createCollection('dsReleaseLines', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('repositoryId', { length: 64 }).notNull();
      collection.string('lineKey', { length: 32 }).notNull();
      collection.string('branch', { length: 255 }).notNull();
      collection.string('pattern', { length: 100 }).notNull();
      collection.string('stripPrefix', { length: 32 }).nullable();
      collection.datetime('syncedAt').nullable();
      collection.text('syncError').nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_ds_release_lines' });
      collection.unique(['repositoryId', 'lineKey'], {
        name: 'ux_ds_release_lines_repository_line',
      });
    });
    await builder.createCollection('dsVersions', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('repositoryId', { length: 64 }).notNull();
      collection.string('lineKey', { length: 32 }).notNull();
      collection.string('tag', { length: 200 }).notNull();
      collection.string('sha', { length: 64 }).notNull();
      collection.datetime('committedAt').nullable();
      collection.string('previousVersionId', { length: 64 }).nullable();
      collection.integer('taskCount').notNull();
      collection.datetime('discoveredAt').notNull();
      collection.datetime('deletedAt').nullable();
      collection.primary('id', { name: 'pk_ds_versions' });
      collection.unique(['repositoryId', 'tag'], {
        name: 'ux_ds_versions_repository_tag',
      });
    });
    await builder.createCollection('dsVersionTasks', (collection) => {
      collection.string('versionId', { length: 64 }).notNull();
      collection.string('issueId', { length: 64 }).notNull();
      collection.string('pullRequestId', { length: 64 }).notNull();
      collection.primary(['versionId', 'issueId'], {
        name: 'pk_ds_version_tasks',
      });
      collection.index('issueId', { name: 'ix_ds_version_tasks_issue' });
    });
    await builder.createCollection('dsDeploymentRecords', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('repositoryId', { length: 64 }).notNull();
      collection.string('versionId', { length: 64 }).notNull();
      collection.string('environmentKey', { length: 32 }).notNull();
      collection.string('kind', { length: 16 }).notNull();
      collection.text('note').notNull();
      collection.string('markedById', { length: 64 }).notNull();
      collection.string('requestId', { length: 64 }).nullable();
      collection.datetime('createdAt').notNull();
      collection.primary('id', { name: 'pk_ds_deployment_records' });
      collection.index('repositoryId', {
        name: 'ix_ds_deployment_records_repository',
      });
    });
    await builder.createCollection('dsDeploymentRequests', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('repositoryId', { length: 64 }).notNull();
      collection.string('versionId', { length: 64 }).notNull();
      collection.string('environmentKey', { length: 32 }).notNull();
      collection.string('kind', { length: 16 }).notNull();
      collection.text('note').notNull();
      collection.string('requestedById', { length: 64 }).notNull();
      collection.string('status', { length: 16 }).notNull();
      collection.string('decidedById', { length: 64 }).nullable();
      collection.text('decisionNote').nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('decidedAt').nullable();
      collection.primary('id', { name: 'pk_ds_deployment_requests' });
      collection.index('status', { name: 'ix_ds_deployment_requests_status' });
    });
  },
  async down({ builder }) {
    for (const name of [
      'dsDeploymentRequests',
      'dsDeploymentRecords',
      'dsVersionTasks',
      'dsVersions',
      'dsReleaseLines',
      'dsRepositoryApps',
      'dsEnvironments',
    ])
      await builder.dropCollection(name);
  },
});

export default migration;
