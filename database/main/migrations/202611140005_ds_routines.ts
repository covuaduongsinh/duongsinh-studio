import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Routines (plan T, T6): work that comes back on a schedule, over one or more projects. A routine is off until a person
 * turns it on, and opens one issue in each of its projects at its time, from a template and, when it has one, a playbook.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202611140005_ds_routines',
  async up({ builder }) {
    await builder.createCollection('dsRoutines', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('name', { length: 200 }).notNull();
      collection.string('playbookSlug', { length: 64 }).nullable();
      collection.text('template').notNull();
      // Five fields, in Vietnam's time zone.
      collection.string('cron', { length: 64 }).notNull();
      collection.boolean('enabled').notNull().defaultTo(false);
      // The person whose permissions the routine's issues are made with.
      collection.string('createdById', { length: 64 }).notNull();
      collection.datetime('lastRunAt').nullable();
      collection.text('lastResult').nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_ds_routines' });
    });
    await builder.createCollection('dsRoutineProjects', (collection) => {
      collection.string('routineId', { length: 64 }).notNull();
      collection.string('projectId', { length: 64 }).notNull();
      collection.primary(['routineId', 'projectId'], {
        name: 'pk_ds_routine_projects',
      });
      collection.index(['projectId'], { name: 'ix_ds_routine_projects_project' });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('dsRoutineProjects');
    await builder.dropCollection('dsRoutines');
  },
});

export default migration;
