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

const TABLE = 'dsAutopilotIssueFlags';

describeMigration('2026110804_ds_autopilot_issue_flags', {
  sources,
  up: async ({ connection, expectCollection }) => {
    const coll = await expectCollection(TABLE).toExist();
    expect(coll.primaryKey).toEqual(['issueId']);

    await expectCollection(TABLE).toHaveField('allowAutoStart', { nullable: false });
    await expectCollection(TABLE).toHaveField('inheritFromParent', { nullable: false });
    await expectCollection(TABLE).toHaveField('createdAt', { nullable: false });
    await expectCollection(TABLE).toHaveField('updatedAt', { nullable: false });

    // Seed dummy row to ensure types and constraints allow insert
    const now = new Date();
    await connection.query
      .insertInto(TABLE)
      .values({
        issueId: 'test-issue-flag-1',
        allowAutoStart: true,
        inheritFromParent: false,
        createdAt: now,
        updatedAt: now,
      })
      .execute();

    const rows = await connection.query
      .selectFrom(TABLE)
      .selectAll()
      .where('issueId', '=', 'test-issue-flag-1')
      .execute();
    expect(rows).toHaveLength(1);
    expect(Boolean(rows[0].allowAutoStart)).toBe(true);
    expect(Boolean(rows[0].inheritFromParent)).toBe(false);
  },
  down: async ({ expectCollection }) => {
    await expectCollection(TABLE).not.toExist();
  },
});
