import { defineMigration, type MigrationDefinition } from '@nocobase/db';

// Git hosting, S3 part 1: connections to a code host (a token, sealed through the secrets service), the repositories
// linked through them, which projects work in which repository, and the pull requests read from the host.
const migration: MigrationDefinition = defineMigration({
  name: '202611030001_ds_git',
  async up({ builder }) {
    await builder.createCollection('dsGitConnections', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('provider', { length: 32 }).notNull();
      collection.string('kind', { length: 32 }).notNull();
      collection.string('name', { length: 100 }).notNull();
      collection.string('account', { length: 200 }).nullable();
      collection.string('apiBaseUrl', { length: 500 }).notNull();
      collection.text('tokenSealed').nullable();
      collection.string('createdById', { length: 64 }).nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_ds_git_connections' });
    });
    await builder.createCollection('dsRepositories', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('connectionId', { length: 64 }).notNull();
      collection.string('fullName', { length: 200 }).notNull();
      collection.string('hostRepoId', { length: 64 }).nullable();
      collection.string('cloneUrl', { length: 500 }).notNull();
      collection.string('webUrl', { length: 500 }).notNull();
      collection.string('defaultBranch', { length: 200 }).notNull();
      collection.string('branchPrefix', { length: 100 }).notNull();
      collection.string('checksSource', { length: 32 }).notNull();
      collection.json('requiredChecks').notNull();
      collection.integer('pollSeconds').notNull();
      collection.datetime('polledAt').nullable();
      collection.text('pollError').nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_ds_repositories' });
      collection.unique(['connectionId', 'fullName'], {
        name: 'ux_ds_repositories_connection_name',
      });
      collection.index('cloneUrl', { name: 'ix_ds_repositories_clone_url' });
    });
    await builder.createCollection('dsProjectRepositories', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('projectId', { length: 64 }).notNull();
      collection.string('repositoryId', { length: 64 }).notNull();
      collection.string('resourceId', { length: 64 }).nullable();
      collection.boolean('isPrimary').notNull();
      collection.datetime('createdAt').notNull();
      collection.primary('id', { name: 'pk_ds_project_repositories' });
      collection.unique(['projectId', 'repositoryId'], {
        name: 'ux_ds_project_repositories_pair',
      });
      collection.index('repositoryId', {
        name: 'ix_ds_project_repositories_repository',
      });
    });
    await builder.createCollection('dsPullRequests', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('repositoryId', { length: 64 }).notNull();
      collection.integer('number').notNull();
      collection.string('issueId', { length: 64 }).nullable();
      collection.string('linkedBy', { length: 32 }).nullable();
      collection.string('headBranch', { length: 255 }).notNull();
      collection.string('headSha', { length: 64 }).notNull();
      collection.string('baseBranch', { length: 255 }).notNull();
      collection.string('state', { length: 16 }).notNull();
      collection.boolean('draft').notNull();
      collection.text('title').notNull();
      collection.string('url', { length: 500 }).notNull();
      collection.string('authorLogin', { length: 200 }).nullable();
      collection.string('mergeability', { length: 16 }).notNull();
      collection.string('hostMergeState', { length: 32 }).nullable();
      collection.string('ciState', { length: 16 }).notNull();
      collection.json('checks').notNull();
      collection.string('mergeCommitSha', { length: 64 }).nullable();
      collection.datetime('mergedAt').nullable();
      collection.string('mergedById', { length: 64 }).nullable();
      collection.text('mergeForcedReason').nullable();
      collection.datetime('closedAt').nullable();
      collection.datetime('snapshotAt').nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_ds_pull_requests' });
      collection.unique(['repositoryId', 'number'], {
        name: 'ux_ds_pull_requests_repository_number',
      });
      collection.index('issueId', { name: 'ix_ds_pull_requests_issue' });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('dsPullRequests');
    await builder.dropCollection('dsProjectRepositories');
    await builder.dropCollection('dsRepositories');
    await builder.dropCollection('dsGitConnections');
  },
});

export default migration;
