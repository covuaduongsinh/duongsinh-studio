import path from 'node:path';
import type { MigrationSource } from '@nocobase/db';
import { describeMigration } from '@nocobase/app-testing/server';
import { expect } from 'vitest';

const sources: readonly MigrationSource[] = [
  {
    packageName: 'ds-reviews-test',
    directory: path.resolve(import.meta.dirname, '../../database/main/migrations'),
  },
];

const TABLES = ['dsReviews'];

// The table behind structured review submissions (AP1).
describeMigration('2026110801_ds_reviews', {
  sources,
  up: async ({ connection, expectCollection }) => {
    for (const name of TABLES) await expectCollection(name).toExist();
    expect((await expectCollection('dsReviews').toExist()).primaryKey).toEqual(['id']);
    await expectCollection('dsReviews').toHaveField('issueId', { nullable: true });
    await expectCollection('dsReviews').toHaveField('headSha', { nullable: false });
    await expectCollection('dsReviews').toHaveField('verdict', { nullable: false });
    await expectCollection('dsReviews').toHaveField('mustFix', { nullable: false });
    await expectCollection('dsReviews').toHaveField('kind', { nullable: false });

    const review = {
      id: 'rev-1',
      pullRequestId: 'pr-1',
      issueId: 'iss-1',
      headSha: 'abc1234',
      reviewerAgentId: 'agent-reviewer',
      reviewerRunId: 'run-1',
      authorAgentId: 'agent-author',
      verdict: 'approve',
      mustFix: 0,
      shouldFix: 1,
      kind: 'code',
      sameModel: false,
      checklist: JSON.stringify({ tests: true }),
      summary: 'LGTM',
      createdAt: new Date(),
    };
    await connection.query.insertInto('dsReviews').values(review).execute();
  },
  down: async ({ expectCollection }) => {
    for (const name of TABLES) await expectCollection(name).not.toExist();
  },
});
