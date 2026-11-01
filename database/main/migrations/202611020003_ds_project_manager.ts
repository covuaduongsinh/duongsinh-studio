import { defineMigration, type MigrationDefinition } from '@nocobase/db';

// The project manager's settings (one row, id `default`): its name and description, the agents whose tool and model it
// runs with, its waiting limits, and its principles (null: the built-in ones).
const migration: MigrationDefinition = defineMigration({
  name: '202611020003_ds_project_manager',
  async up({ builder }) {
    await builder.createCollection('dsProjectManager', (collection) => {
      collection.string('id', { length: 32 }).notNull();
      collection.string('name', { length: 100 }).notNull();
      collection.text('description').nullable();
      collection.string('firstChoiceAgentId', { length: 200 }).nullable();
      collection.string('fallbackAgentId', { length: 200 }).nullable();
      collection.integer('fallbackAfterSeconds').notNull();
      collection.integer('delegationQueueTimeoutSeconds').notNull();
      collection.integer('commentRunLimit').notNull();
      collection.text('principles').nullable();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_ds_project_manager' });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('dsProjectManager');
  },
});

export default migration;
