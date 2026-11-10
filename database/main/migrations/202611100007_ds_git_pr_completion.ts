import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202611100007_ds_git_pr_completion',

  async up({ builder, query }) {
    await builder.alterCollection('dsAutopilotIssueFlags', (collection) => {
      collection.boolean('autoCompleteOnMerge').notNull().defaultTo(false);
    });
    await query
      .updateTable('dsPullRequests')
      .set({ autoCompleteDisabled: true })
      // A pull request that exists before this migration is not completed automatically when it is merged.
      .allowAllRows()
      .execute();
  },

  async down({ builder }) {
    await builder.alterCollection('dsAutopilotIssueFlags', (collection) => {
      collection.dropField('autoCompleteOnMerge');
    });
  },
});

export default migration;
