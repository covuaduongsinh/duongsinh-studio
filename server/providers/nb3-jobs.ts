import type { Application } from '@nocobase/app-server/application';
import { databaseManagerToken } from '@nocobase/db';
import {
  ServiceProvider,
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';
import { channelFromEnv } from '../nb3-jobs/channel.js';
import {
  createNb3JobsService,
  type Nb3JobsService,
} from '../nb3-jobs/service.js';

export const nb3JobsToken: ServiceToken<Nb3JobsService> =
  createServiceToken<Nb3JobsService>('app/nb3-jobs');

/**
 * Jobs in NocoBase 3 Apps through the host daemon (V4). Off until `NB3_EXEC_SOCKET` and `NB3_EXEC_KEY_FILE` are set; then
 * Studio signs each request with the key file and the daemon runs only what its own allowlist names.
 */
export default class Nb3JobsProvider extends ServiceProvider<Application> {
  readonly name = 'app/nb3-jobs';

  override register(): void {
    const { container } = this.app;
    container.singleton(nb3JobsToken, () =>
      createNb3JobsService({
        connection: () => container.resolve(databaseManagerToken).connection(),
        channel: () => channelFromEnv(),
      }),
    );
  }
}
