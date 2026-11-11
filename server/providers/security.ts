import type { Application } from '@nocobase/app-server/application';
import {
  ServiceProvider,
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';
import { SecretFindingsService } from '../security/service.js';

export const secretFindingsServiceToken: ServiceToken<SecretFindingsService> =
  createServiceToken<SecretFindingsService>('app/secret-findings');

export default class SecurityProvider extends ServiceProvider<Application> {
  readonly name = 'app/security';

  override register(): void {
    const { container } = this.app;
    container.singleton(
      secretFindingsServiceToken,
      () => new SecretFindingsService(this.app),
    );
  }
}
