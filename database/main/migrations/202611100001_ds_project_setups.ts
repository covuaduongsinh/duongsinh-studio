import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * How a project was set up (`POST /api/projectSetups`), and the skills a project created from now on starts with
 * (`/api/projectDefaultSkills`).
 */
const migration: MigrationDefinition = defineMigration({
  name: '202611100001_ds_project_setups',

  async up({ builder }) {
    await builder.createCollection('dsProjectSetups', (collection) => {
      collection.string('projectId', { length: 64 }).notNull();
      collection.string('method', { length: 16 }).notNull();
      collection.string('appTemplate', { length: 32 });
      collection.string('issueId', { length: 64 });
      collection.string('createdById', { length: 64 }).notNull();
      collection.datetime('createdAt').notNull();

      collection.primary('projectId', { name: 'pk_ds_project_setups' });
    });
    await builder.createCollection('dsProjectDefaultSkills', (collection) => {
      collection.string('skillId', { length: 64 }).notNull();
      collection.integer('position').notNull();

      collection.primary('skillId', { name: 'pk_ds_project_default_skills' });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('dsProjectDefaultSkills');
    await builder.dropCollection('dsProjectSetups');
  },
});

export default migration;
