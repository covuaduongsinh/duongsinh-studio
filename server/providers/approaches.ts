import { agentsToken } from '@nocobase/app-plugin-agents/server/tokens';
import type { Application } from '@nocobase/app-server/application';
import { databaseManagerToken } from '@nocobase/db';
import {
  ServiceProvider,
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';
import {
  createTwoApproachesService,
  type TwoApproachesService,
} from '../approaches/service.js';
import { agentWakerToken } from './agent-executor.js';

export const twoApproachesServiceToken: ServiceToken<TwoApproachesService> =
  createServiceToken<TwoApproachesService>('app/two-approaches');

/** Two approaches for one issue, on request (plan T, T12). */
export default class ApproachesProvider extends ServiceProvider<Application> {
  readonly name = 'app/approaches';

  override register(): void {
    const { container } = this.app;
    container.singleton(twoApproachesServiceToken, () =>
      createTwoApproachesService({
        conn: () => container.resolve(databaseManagerToken).connection(),
        agents: () => container.resolve(agentsToken),
        waker: () => container.resolve(agentWakerToken),
      }),
    );
  }
}
