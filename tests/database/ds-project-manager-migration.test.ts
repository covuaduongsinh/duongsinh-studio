import path from 'node:path';
import type { MigrationSource } from '@nocobase/db';
import { describeMigration } from '@nocobase/app-testing/server';
import { expect } from 'vitest';

const sources: readonly MigrationSource[] = [
  {
    packageName: 'ds-project-manager-test',
    directory: path.resolve(
      import.meta.dirname,
      '../../database/main/migrations',
    ),
  },
];

// The one-row table behind GET/PATCH /api/projectManager (`server/agents/project-manager-settings.ts`).
describeMigration('202611020003_ds_project_manager', {
  sources,
  up: async ({ connection, expectCollection }) => {
    const table = await expectCollection('dsProjectManager').toExist();
    expect(Object.keys(table.fields)).toEqual([
      'id',
      'name',
      'description',
      'firstChoiceAgentId',
      'fallbackAgentId',
      'fallbackAfterSeconds',
      'delegationQueueTimeoutSeconds',
      'commentRunLimit',
      'principles',
      'updatedAt',
    ]);
    expect(table.primaryKey).toEqual(['id']);
    for (const field of [
      'description',
      'firstChoiceAgentId',
      'fallbackAgentId',
      'principles',
    ])
      await expectCollection('dsProjectManager').toHaveField(field, {
        nullable: true,
      });
    const row = {
      id: 'default',
      name: 'Project manager',
      description: null,
      firstChoiceAgentId: null,
      fallbackAgentId: null,
      fallbackAfterSeconds: 120,
      delegationQueueTimeoutSeconds: 600,
      commentRunLimit: 20,
      principles: null,
      updatedAt: new Date(),
    };
    await connection.query.insertInto('dsProjectManager').values(row).execute();
    // One row per id.
    await expect(
      connection.query.insertInto('dsProjectManager').values(row).execute(),
    ).rejects.toThrow();
  },
  down: async ({ expectCollection }) => {
    await expectCollection('dsProjectManager').not.toExist();
  },
});
