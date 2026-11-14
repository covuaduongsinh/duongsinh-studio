import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Reaction rules and their attempts (plan T, T1.1): what Studio does by itself when CI turns red, a branch conflicts,
 * a review asks for changes or a run fails. A rule with no project is the default for every project; a project's own
 * rule wins. The built-in defaults live in code (`server/reactions/service.ts`), so a rule row is only an override.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202611140002_ds_reactions',
  async up({ builder }) {
    await builder.createCollection('dsReactionRules', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('projectId', { length: 64 }).nullable();
      collection.string('event', { length: 24 }).notNull();
      collection.boolean('enabled').notNull().defaultTo(true);
      // Attempts for one push, and for the whole issue.
      collection.integer('maxAttempts').notNull().defaultTo(2);
      collection.integer('maxPerIssue').notNull().defaultTo(5);
      collection.integer('escalateAfterMinutes').nullable();
      // wake | notify
      collection.string('action', { length: 16 }).notNull().defaultTo('wake');
      collection.datetime('updatedAt').notNull();
      collection.string('updatedById', { length: 64 }).nullable();
      collection.primary('id', { name: 'pk_ds_reaction_rules' });
      collection.index(['projectId', 'event'], {
        name: 'ix_ds_reaction_rules_project_event',
      });
    });
    await builder.createCollection('dsReactionAttempts', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('issueId', { length: 64 }).notNull();
      collection.string('projectId', { length: 64 }).nullable();
      collection.string('event', { length: 24 }).notNull();
      collection.string('headSha', { length: 64 }).notNull();
      collection.integer('attempt').notNull();
      collection.string('runId', { length: 64 }).nullable();
      collection.datetime('createdAt').notNull();
      collection.primary('id', { name: 'pk_ds_reaction_attempts' });
      collection.index(['issueId', 'event', 'headSha', 'attempt'], {
        name: 'ux_ds_reaction_attempts_attempt',
        unique: true,
      });
      collection.index(['issueId', 'createdAt'], {
        name: 'ix_ds_reaction_attempts_issue_time',
      });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('dsReactionAttempts');
    await builder.dropCollection('dsReactionRules');
  },
});

export default migration;
