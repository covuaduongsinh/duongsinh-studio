import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Let GitHub merge when its checks pass (plan T, T3b): a project may ask Studio to enable GitHub's auto-merge on a pull
 * request instead of merging it through the API. Null and false are the same, off; it can only be turned on while the
 * branch protection reads green (T3a).
 */
const migration: MigrationDefinition = defineMigration({
  name: '202611140004_ds_autopilot_auto_merge_on_github',
  async up({ builder }) {
    await builder.alterCollection('dsAutopilotSettings', (collection) => {
      collection.boolean('autoMergeOnGithub').nullable();
    });
  },
  async down({ builder }) {
    await builder.alterCollection('dsAutopilotSettings', (collection) => {
      collection.dropField('autoMergeOnGithub');
    });
  },
});

export default migration;
