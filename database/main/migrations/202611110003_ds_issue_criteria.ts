import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/** Structured criteria for issues (H1a) and project default criteria. */
const migration: MigrationDefinition = defineMigration({
  name: '202611110003_ds_issue_criteria',

  async up({ builder }) {
    await builder.createCollection('dsIssueCriteria', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('issueId', { length: 64 }).notNull();
      collection.integer('position').notNull();
      collection.text('text').notNull();
      collection.string('checkKind', { length: 16 }).notNull();
      collection.text('checkValue');
      collection.string('source', { length: 16 }).notNull();
      collection.string('createdByType', { length: 16 });
      collection.string('createdById', { length: 64 });
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();

      collection.primary('id', { name: 'pk_ds_issue_criteria' });
      collection.index(['issueId', 'position'], {
        name: 'idx_ds_issue_criteria_issue_pos',
      });
    });

    await builder.createCollection(
      'dsProjectDefaultCriteria',
      (collection) => {
        collection.string('id', { length: 64 }).notNull();
        collection.string('projectId', { length: 64 }).notNull();
        collection.integer('position').notNull();
        collection.text('text').notNull();
        collection.string('checkKind', { length: 16 }).notNull();
        collection.text('checkValue');
        collection.datetime('createdAt').notNull();
        collection.datetime('updatedAt').notNull();

        collection.primary('id', { name: 'pk_ds_project_default_criteria' });
        collection.index(['projectId', 'position'], {
          name: 'idx_ds_project_default_criteria_project_pos',
        });
      },
    );
  },

  async down({ builder }) {
    await builder.dropCollection('dsProjectDefaultCriteria');
    await builder.dropCollection('dsIssueCriteria');
  },
});

export default migration;
