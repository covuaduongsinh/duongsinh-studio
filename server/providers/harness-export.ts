import type { Application } from '@nocobase/app-server/application';
import { agentsToken } from '@nocobase/app-plugin-agents/server/tokens';
import { databaseManagerToken } from '@nocobase/db';
import {
  ServiceProvider,
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';
import {
  createHarnessExportService,
  type HarnessExportService,
} from '../harness-export/service.js';
import { gitServiceToken } from './git.js';

export const harnessExportServiceToken: ServiceToken<HarnessExportService> =
  createServiceToken<HarnessExportService>('app/harness-export');

/** Writes the rules Studio keeps for a project into its repository as a pull request (plan T, T4). */
export default class HarnessExportProvider extends ServiceProvider<Application> {
  readonly name = 'app/harness-export';

  override register(): void {
    const { container } = this.app;
    container.singleton(harnessExportServiceToken, () =>
      createHarnessExportService({
        conn: () => container.resolve(databaseManagerToken).connection(),
        git: () => container.resolve(gitServiceToken),
        agents: () => container.resolve(agentsToken),
      }),
    );
  }
}
