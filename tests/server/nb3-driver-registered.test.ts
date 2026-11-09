// @vitest-environment node
import { expect } from 'vitest';
import { createAppTest } from '@nocobase/app-testing/server';
import { releasesDriversToken } from '@nocobase/app-plugin-releases/server/tokens';
import { createStandaloneServer } from '../../server/standalone.js';

const test = createAppTest({
  createServer: createStandaloneServer,
  config: {
    app: { publicOrigin: 'http://localhost' },
    auth: { secret: 'test-auth-secret-at-least-32-characters' },
    secrets: {
      keys: [
        { version: 1, key: 'test-secrets-key-at-least-32-characters-long' },
      ],
    },
  },
});

test('the application registers the dokploy driver beside the stored-builds one', ({
  app,
}) => {
  const drivers = app.container.resolve(releasesDriversToken);
  const dokploy = drivers.get('dokploy');
  expect(dokploy?.capabilities.urlModes).toEqual(['subdomain']);
  expect(dokploy?.capabilities.onDemand).toBeUndefined();
  expect(drivers.get('external')).toBeDefined();
  // Without Dokploy settings a driver still validates its environment and refuses nothing at registration.
  expect(() =>
    dokploy?.validate?.(
      { dataDir: '/x', hostDir: '/y', hosts: { a: 'studio.dsc.edu.vn' } },
      null,
    ),
  ).toThrow(/reserved/u);
});
