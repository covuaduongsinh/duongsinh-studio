import path from 'node:path';
import type { MigrationSource } from '@nocobase/db';
import { describeMigration } from '@nocobase/app-testing/server';

const sources: readonly MigrationSource[] = [
  {
    packageName: 'ds-reactions-test',
    directory: path.resolve(
      import.meta.dirname,
      '../../database/main/migrations',
    ),
  },
];

describeMigration('202611140002_ds_reactions', {
  sources,
  up: async ({ expectCollection }) => {
    await expectCollection('dsReactionRules').toHaveField('event', {
      nullable: false,
    });
    await expectCollection('dsReactionRules').toHaveField('maxAttempts', {
      nullable: false,
    });
    await expectCollection('dsReactionRules').toHaveField('projectId', {
      nullable: true,
    });
    await expectCollection('dsReactionAttempts').toHaveField('headSha', {
      nullable: false,
    });
    await expectCollection('dsReactionAttempts').toHaveField('runId', {
      nullable: true,
    });
  },
  down: async ({ expectCollection }) => {
    await expectCollection('dsReactionRules').not.toExist();
    await expectCollection('dsReactionAttempts').not.toExist();
  },
});
