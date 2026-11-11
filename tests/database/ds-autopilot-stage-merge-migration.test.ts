import path from 'node:path';
import type { MigrationSource } from '@nocobase/db';
import { describeMigration } from '@nocobase/app-testing/server';

const sources: readonly MigrationSource[] = [
  {
    packageName: 'ds-autopilot-stage-merge-test',
    directory: path.resolve(
      import.meta.dirname,
      '../../database/main/migrations',
    ),
  },
];

describeMigration('202611110002_ds_autopilot_stage_merge', {
  sources,
  up: async ({ expectCollection }) => {
    await expectCollection('dsAutopilotSettings').toHaveField(
      'autoMergeStages',
      { nullable: false },
    );
  },
  down: async ({ expectCollection }) => {
    await expectCollection('dsAutopilotSettings').not.toHaveField(
      'autoMergeStages',
    );
  },
});
