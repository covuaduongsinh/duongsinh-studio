import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * What the demo's git contract adds: checks reported by CI or agents instead of read from the host, checks that are
 * shown but decide nothing, pull requests that do not move their issue when merged, and people's own host tokens.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202611100003_ds_git_contract',

  async up({ builder }) {
    await builder.createCollection('dsReportedChecks', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('repositoryId', { length: 64 }).notNull();
      collection.string('sha', { length: 64 }).notNull();
      collection.string('name', { length: 255 }).notNull();
      collection.string('status', { length: 16 }).notNull();
      collection.string('source', { length: 16 }).notNull();
      collection.text('url');
      collection.text('summary');
      collection.string('runId', { length: 64 });
      collection.datetime('reportedAt').notNull();

      collection.primary('id', { name: 'pk_ds_reported_checks' });
      collection.unique(['repositoryId', 'sha', 'name'], {
        name: 'uq_ds_reported_checks_commit_name',
      });
      collection.index(['repositoryId', 'reportedAt'], {
        name: 'idx_ds_reported_checks_repository',
      });
    });
    await builder.createCollection('dsGitAuthorizations', (collection) => {
      collection.string('userId', { length: 64 }).notNull();
      collection.string('connectionId', { length: 64 }).notNull();
      collection.text('tokenSealed').notNull();
      collection.string('login', { length: 255 }).notNull();
      collection.string('method', { length: 16 }).notNull();
      collection.datetime('connectedAt').notNull();

      collection.primary(['userId', 'connectionId'], {
        name: 'pk_ds_git_authorizations',
      });
    });
    await builder.alterCollection('dsRepositories', (collection) => {
      collection.json('referenceChecks');
    });
    await builder.alterCollection('dsPullRequests', (collection) => {
      collection.boolean('autoCompleteDisabled').notNull().defaultTo(false);
    });
  },

  async down({ builder }) {
    await builder.alterCollection('dsPullRequests', (collection) => {
      collection.dropField('autoCompleteDisabled');
    });
    await builder.alterCollection('dsRepositories', (collection) => {
      collection.dropField('referenceChecks');
    });
    await builder.dropCollection('dsGitAuthorizations');
    await builder.dropCollection('dsReportedChecks');
  },
});

export default migration;
