import path from 'node:path';
import type { MigrationSource } from '@nocobase/db';
import { describeMigration } from '@nocobase/app-testing/server';
import { expect } from 'vitest';

const sources: readonly MigrationSource[] = [
  {
    packageName: 'ds-autopilot-test',
    directory: path.resolve(import.meta.dirname, '../../database/main/migrations'),
  },
];

const TABLES = ['dsAutopilotSettings', 'dsAutopilotEvents'];

describeMigration('2026110802_ds_autopilot', {
  sources,
  up: async ({ connection, expectCollection }) => {
    for (const name of TABLES) await expectCollection(name).toExist();

    expect((await expectCollection('dsAutopilotSettings').toExist()).primaryKey).toEqual(['projectId']);
    await expectCollection('dsAutopilotSettings').toHaveField('enabled', { nullable: false });
    await expectCollection('dsAutopilotSettings').toHaveField('mergeMethod', { nullable: false });
    await expectCollection('dsAutopilotSettings').toHaveField('maxMergesPerDay', { nullable: true });
    await expectCollection('dsAutopilotSettings').toHaveField('maxActiveIssues', { nullable: true });
    await expectCollection('dsAutopilotSettings').toHaveField('stallMinutes', { nullable: false });
    await expectCollection('dsAutopilotSettings').toHaveField('sensitivePolicy', { nullable: false });

    expect((await expectCollection('dsAutopilotEvents').toExist()).primaryKey).toEqual(['id']);
    await expectCollection('dsAutopilotEvents').toHaveField('projectId', { nullable: false });
    await expectCollection('dsAutopilotEvents').toHaveField('kind', { nullable: false });

    const settings = {
      projectId: 'proj-1',
      enabled: true,
      mergeMethod: 'squash',
      maxMergesPerDay: null,
      maxActiveIssues: 3,
      stallMinutes: 30,
      sensitivePaths: JSON.stringify(['database/**']),
      sensitivePolicy: 'extraReview',
      pausedReason: null,
      updatedAt: new Date(),
      updatedById: 'user-admin',
    };
    await connection.query.insertInto('dsAutopilotSettings').values(settings).execute();

    const event = {
      id: 'event-1',
      projectId: 'proj-1',
      issueId: 'issue-1',
      pullRequestId: 'pr-1',
      kind: 'merged',
      reason: 'All checks passed',
      data: JSON.stringify({ headSha: 'sha-123' }),
      createdAt: new Date(),
    };
    await connection.query.insertInto('dsAutopilotEvents').values(event).execute();
  },
  down: async ({ expectCollection }) => {
    for (const name of TABLES) await expectCollection(name).not.toExist();
  },
});
