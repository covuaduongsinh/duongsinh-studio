import { defineSeed } from '@nocobase/db';

// Dương Sinh defaults for the projects plugin on a fresh install: issues are numbered DS-1, DS-2, … and the workspace
// starts with the labels the agent workflow uses (`no-preview` skips the preview build in CI). Self-contained: seeds
// cannot import the application's own modules. An installation that already numbered issues keeps its prefix, and a
// label that exists is left alone, so administrators' choices survive.

const ISSUE_PREFIX = 'DS';

const LABELS: readonly { id: string; name: string; color: string }[] = [
  { id: 'ds-label-v2', name: 'v2', color: 'blue' },
  { id: 'ds-label-plugin', name: 'plugin', color: 'purple' },
  { id: 'ds-label-docs', name: 'docs', color: 'green' },
  { id: 'ds-label-bug', name: 'bug', color: 'red' },
  { id: 'ds-label-no-preview', name: 'no-preview', color: 'gray' },
];

export default defineSeed({
  name: '202611010002_ds_project_settings',
  transaction: true,
  async run({ query }) {
    const now = new Date();
    const settings = await query
      .selectFrom('pmSettings')
      .select(['id', 'issuePrefix', 'issueCounter'])
      .where('id', '=', 'default')
      .executeTakeFirst();
    if (!settings) {
      // Runs before the plugin's own settings seed: create the row it would create, with our prefix.
      await query
        .insertInto('pmSettings')
        .values({
          id: 'default',
          issuePrefix: ISSUE_PREFIX,
          issueCounter: 0,
          values: JSON.stringify({}),
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    } else if (
      settings.issuePrefix === 'PM' &&
      Number(settings.issueCounter) === 0
    ) {
      await query
        .updateTable('pmSettings')
        .set({ issuePrefix: ISSUE_PREFIX, updatedAt: now })
        .where('id', '=', 'default')
        .execute();
    }

    for (const label of LABELS) {
      const existing = await query
        .selectFrom('pmLabels')
        .select('id')
        .where('name', '=', label.name)
        .executeTakeFirst();
      if (existing) continue;
      await query
        .insertInto('pmLabels')
        .values({ ...label, createdAt: now, updatedAt: now })
        .execute();
    }
  },
});
