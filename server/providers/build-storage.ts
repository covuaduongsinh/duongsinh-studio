import {
  releasesDriversToken,
  releasesToken,
} from '@nocobase/app-plugin-releases/server/tokens';
import type { Application } from '@nocobase/app-server/application';
import { ServiceProvider } from '@nocobase/service-provider';
import { appText } from '../agents/ids.js';

/** The release environment Studio keeps builds in: their Apps run outside it, through Dokploy. */
export const EXTERNAL_ENVIRONMENT = 'external';
const EXTERNAL_DRIVER = 'external';

const REFUSAL =
  'Studio stores builds here; it does not run them. The App Host is off on this server.';

const NOT_RUNNING = {
  state: 'failed',
  version: null,
  deploymentId: null,
  startedAt: null,
  error: REFUSAL,
} as const;

/**
 * Lets the releases plugin keep Apps and their releases without running any. The plugin refuses an App without an
 * environment and an environment without a driver, and the App Host stays off because this server has no memory to
 * spare, so this driver stores and refuses every deployment. Turning the Host on later replaces it per environment.
 */
export default class BuildStorageProvider extends ServiceProvider<Application> {
  readonly name = 'app/build-storage';

  override async boot(): Promise<void> {
    const { container } = this.app;
    if (!container.has(releasesDriversToken) || !container.has(releasesToken))
      return;
    const drivers = container.resolve(releasesDriversToken);
    const driver: Parameters<typeof drivers.register>[0] = {
      kind: EXTERNAL_DRIVER,
      title: appText('studioBuilds.externalDriver'),
      configSchema: { type: 'object', additionalProperties: false },
      capabilities: { logs: false, urlModes: ['subdomain'] },
      open: () =>
        Promise.resolve({
          check: () => Promise.resolve({ ok: true, message: REFUSAL }),
          apply: () => Promise.resolve(NOT_RUNNING),
          start: () => Promise.resolve(NOT_RUNNING),
          stop: () => Promise.resolve(NOT_RUNNING),
          restart: () => Promise.resolve(NOT_RUNNING),
          remove: () => Promise.resolve(),
          status: () => Promise.resolve(new Map()),
          restore: () => Promise.resolve(),
          logs: () =>
            Promise.resolve({
              entries: [],
              cursor: '',
              hasMore: false,
              available: false,
              reset: false,
            }),
          url: () => null,
          close: () => Promise.resolve(),
        }),
    };
    drivers.register(driver);
    const releases = container.resolve(releasesToken);
    try {
      const present = await releases.environments.list(releases.system);
      if (!present.some((item) => item.id === EXTERNAL_ENVIRONMENT))
        await releases.environments.create(releases.system, {
          id: EXTERNAL_ENVIRONMENT,
          name: 'Ngoài Studio',
          driver: EXTERNAL_DRIVER,
          config: {},
        });
    } catch (error) {
      // A database not migrated yet: the next start creates it.
      console.warn('Studio could not prepare its build storage', error);
    }
  }
}
