import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * What each person wants sent outside Studio and which decisions they were told about, and budgets of runs and tokens
 * with what happened to them.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202611100006_ds_outbound_budgets',

  async up({ builder }) {
    await builder.createCollection('dsNotificationPreferences', (collection) => {
      collection.string('userId', { length: 64 }).notNull();
      collection.boolean('emailDecisions').notNull().defaultTo(true);
      collection.boolean('emailReports').notNull().defaultTo(true);
      collection.boolean('pushDecisions').notNull().defaultTo(true);
      collection.datetime('updatedAt').notNull();

      collection.primary('userId', { name: 'pk_ds_notification_preferences' });
    });
    await builder.createCollection('dsDecisionAlerts', (collection) => {
      collection.string('userId', { length: 64 }).notNull();
      collection.string('alertKey', { length: 191 }).notNull();
      collection.datetime('sentAt').notNull();

      collection.primary(['userId', 'alertKey'], {
        name: 'pk_ds_decision_alerts',
      });
    });
    await builder.createCollection('dsBudgets', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('scope', { length: 16 }).notNull();
      collection.string('scopeId', { length: 64 }).notNull();
      collection.string('period', { length: 16 }).notNull();
      collection.integer('maxRuns');
      collection.bigInt('maxTokens');
      collection.string('createdById', { length: 64 }).notNull();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();

      collection.primary('id', { name: 'pk_ds_budgets' });
      collection.unique(['scope', 'scopeId', 'period'], {
        name: 'uq_ds_budgets_scope_period',
      });
    });
    await builder.createCollection('dsBudgetEvents', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('budgetId', { length: 64 }).notNull();
      collection.string('periodKey', { length: 16 }).notNull();
      collection.string('kind', { length: 16 }).notNull();
      collection.string('actorId', { length: 64 });
      collection.datetime('createdAt').notNull();

      collection.primary('id', { name: 'pk_ds_budget_events' });
      collection.unique(['budgetId', 'periodKey', 'kind'], {
        name: 'uq_ds_budget_events_once',
      });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('dsBudgetEvents');
    await builder.dropCollection('dsBudgets');
    await builder.dropCollection('dsDecisionAlerts');
    await builder.dropCollection('dsNotificationPreferences');
  },
});

export default migration;
