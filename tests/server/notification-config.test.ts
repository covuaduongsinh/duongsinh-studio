// @vitest-environment node
import { expect } from 'vitest';
import { createAppTest } from '@nocobase/app-testing/server';
import { createStandaloneServer } from '../../server/standalone.js';

const test = createAppTest({
  createServer: createStandaloneServer,
  config: {
    app: { publicOrigin: 'http://localhost' },
    auth: { secret: 'test-auth-secret-at-least-32-characters' },
    // As production's config.yml has it: naming the inbox must not lose the other channels.
    notification: { channels: { inbox: { type: 'in-app' } } },
  },
});

test('a config file naming only the inbox keeps web push and the email channel, which stays off', ({
  app,
}) => {
  const { channels } = app.config.get<{
    channels: Record<string, { enabled?: boolean; type?: string }>;
  }>('notification');
  expect(Object.keys(channels).sort()).toEqual(
    ['inbox', 'studio-email', 'webPush'].sort(),
  );
  expect(channels['studio-email']?.enabled).toBe(false);
});
