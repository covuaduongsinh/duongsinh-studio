import { defineMigration, type MigrationDefinition } from '@nocobase/db';

// Project autopilot settings and audit events (AP2, `server/autopilot/evaluator.ts`):
//
// - `dsAutopilotSettings`: per-project configuration for autopilot (enabled, merge method,
//   max merges/day, concurrency cap, stall timeout, sensitive paths & policies).
// - `dsAutopilotEvents`: audit log of autopilot actions (merged, skipped, opened, stalled, blocked, paused).
const migration: MigrationDefinition = defineMigration({
  name: '2026110802_ds_autopilot',
  async up({ builder }) {
    await builder.createCollection('dsAutopilotSettings', (collection) => {
      collection.string('projectId', { length: 64 }).notNull();
      collection.boolean('enabled').notNull().defaultTo(false);
      collection.string('mergeMethod', { length: 16 }).notNull().defaultTo('squash');
      collection.integer('maxMergesPerDay').nullable();
      collection.integer('maxActiveIssues').nullable();
      collection.integer('stallMinutes').notNull().defaultTo(30);
      collection.json('sensitivePaths').nullable();
      collection.string('sensitivePolicy', { length: 16 }).notNull().defaultTo('extraReview');
      collection.text('pausedReason').nullable();
      collection.datetime('updatedAt').notNull();
      collection.string('updatedById', { length: 64 }).nullable();
      collection.primary('projectId', { name: 'pk_ds_autopilot_settings' });
    });

    await builder.createCollection('dsAutopilotEvents', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('projectId', { length: 64 }).notNull();
      collection.string('issueId', { length: 64 }).nullable();
      collection.string('pullRequestId', { length: 64 }).nullable();
      collection.string('kind', { length: 16 }).notNull();
      collection.text('reason').nullable();
      collection.json('data').nullable();
      collection.datetime('createdAt').notNull();
      collection.primary('id', { name: 'pk_ds_autopilot_events' });
      collection.index(['projectId'], { name: 'ix_ds_autopilot_events_project' });
      collection.index(['projectId', 'createdAt'], { name: 'ix_ds_autopilot_events_project_time' });
      collection.index(['issueId'], { name: 'ix_ds_autopilot_events_issue' });
      collection.index(['pullRequestId'], { name: 'ix_ds_autopilot_events_pull' });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('dsAutopilotEvents');
    await builder.dropCollection('dsAutopilotSettings');
  },
});

export default migration;
