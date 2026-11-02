import path from 'node:path';
import type { MigrationSource } from '@nocobase/db';
import { describeMigration } from '@nocobase/app-testing/server';
import { expect } from 'vitest';

const sources: readonly MigrationSource[] = [
  {
    packageName: 'ds-git-apps-test',
    directory: path.resolve(
      import.meta.dirname,
      '../../database/main/migrations',
    ),
  },
];

// The tables behind GitHub App connections and their webhook (`server/git/apps.ts`).
describeMigration('202611050001_ds_git_apps', {
  sources,
  up: async ({ connection, expectCollection }) => {
    const apps = await expectCollection('dsGitApps').toExist();
    expect(apps.primaryKey).toEqual(['connectionId']);
    expect(Object.keys(apps.fields)).toEqual(
      expect.arrayContaining([
        'appId',
        'slug',
        'htmlUrl',
        'privateKeySealed',
        'webhookSecretSealed',
        'installationId',
        'permissions',
        'events',
        'lastDeliveryAt',
        'lastError',
      ]),
    );
    await expectCollection('dsGitApps').toHaveField('installationId', {
      nullable: true,
    });
    const manifests = await expectCollection('dsGitAppManifests').toExist();
    expect(manifests.primaryKey).toEqual(['state']);
    const deliveries = await expectCollection(
      'dsGitWebhookDeliveries',
    ).toExist();
    expect(deliveries.primaryKey).toEqual(['id']);

    // A delivery is handled once: its id cannot be stored twice.
    const delivery = {
      id: 'delivery-1',
      connectionId: 'c1',
      event: 'pull_request',
      receivedAt: new Date(),
    };
    await connection.query
      .insertInto('dsGitWebhookDeliveries')
      .values(delivery)
      .execute();
    await expect(
      connection.query
        .insertInto('dsGitWebhookDeliveries')
        .values(delivery)
        .execute(),
    ).rejects.toThrow();
  },
  down: async ({ expectCollection }) => {
    for (const name of [
      'dsGitApps',
      'dsGitAppManifests',
      'dsGitWebhookDeliveries',
    ])
      await expectCollection(name).not.toExist();
  },
});
