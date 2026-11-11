import path from 'node:path';
import type { MigrationSource } from '@nocobase/db';
import { describeMigration } from '@nocobase/app-testing/server';
import { expect } from 'vitest';

const sources: readonly MigrationSource[] = [
  {
    packageName: 'ds-lessons-test',
    directory: path.resolve(
      import.meta.dirname,
      '../../database/main/migrations',
    ),
  },
];

describeMigration('202611110007_ds_lessons', {
  sources,
  up: async ({ expectCollection }) => {
    const lessons = await expectCollection('dsLessons').toExist();
    expect(lessons.primaryKey).toEqual(['id']);
    await expectCollection('dsLessons').toHaveField('projectId', {
      nullable: true,
    });
    await expectCollection('dsLessons').toHaveField('issueId', {
      nullable: true,
    });
    await expectCollection('dsLessons').toHaveField('reviewId', {
      nullable: true,
    });
    await expectCollection('dsLessons').toHaveField('mistake', {
      nullable: false,
    });
    await expectCollection('dsLessons').toHaveField('rule', {
      nullable: false,
    });
    await expectCollection('dsLessons').toHaveField('tag', {
      nullable: false,
    });
    await expectCollection('dsLessons').toHaveField('target', {
      nullable: false,
    });
    await expectCollection('dsLessons').toHaveField('targetRef', {
      nullable: true,
    });
    await expectCollection('dsLessons').toHaveField('status', {
      nullable: false,
    });
    await expectCollection('dsLessons').toHaveField('proposedByType', {
      nullable: false,
    });
    await expectCollection('dsLessons').toHaveField('proposedById', {
      nullable: true,
    });
    await expectCollection('dsLessons').toHaveField('decidedBy', {
      nullable: true,
    });
    await expectCollection('dsLessons').toHaveField('appliedRef', {
      nullable: true,
    });
    await expectCollection('dsLessons').toHaveField('createdAt', {
      nullable: false,
    });
    await expectCollection('dsLessons').toHaveField('updatedAt', {
      nullable: false,
    });
  },
  down: async ({ expectCollection }) => {
    await expectCollection('dsLessons').not.toExist();
  },
});
