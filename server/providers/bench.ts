import type { Application } from '@nocobase/app-server/application';
import { databaseManagerToken } from '@nocobase/db';
import {
  ServiceProvider,
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';
import { createBenchService, type BenchService } from '../bench/service.js';

export const benchServiceToken: ServiceToken<BenchService> =
  createServiceToken<BenchService>('app/bench');

export default class BenchProvider extends ServiceProvider<Application> {
  readonly name = 'app/bench';

  override register(): void {
    const { container } = this.app;
    container.singleton(benchServiceToken, () =>
      createBenchService({
        database: container.resolve(databaseManagerToken),
      }),
    );
  }
}
