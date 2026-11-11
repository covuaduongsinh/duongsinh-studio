import { defineMigration, type MigrationDefinition } from '@nocobase/db';

// A project can turn off Studio merging the pull request of a finished stage by itself (`server/git/service.ts`,
// `autoMergeStage`). On by default: a project with no settings row, and every existing row, merges its stages.
const migration: MigrationDefinition = defineMigration({
  name: '202611110002_ds_autopilot_stage_merge',

  async up({ builder }) {
    await builder.alterCollection('dsAutopilotSettings', (collection) => {
      collection.boolean('autoMergeStages').notNull().defaultTo(true);
    });
  },

  async down({ builder }) {
    await builder.alterCollection('dsAutopilotSettings', (collection) => {
      collection.dropField('autoMergeStages');
    });
  },
});

export default migration;
