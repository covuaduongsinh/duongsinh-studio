import type { Application } from '@nocobase/app-server/application';
import { databaseManagerToken } from '@nocobase/db';
import {
  ServiceProvider,
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';
import {
  createLessonsService,
  type LessonsService,
} from '../lessons/service.js';

export const lessonsServiceToken: ServiceToken<LessonsService> =
  createServiceToken<LessonsService>('app/lessons');

export default class LessonsProvider extends ServiceProvider<Application> {
  readonly name = 'app/lessons';

  override register(): void {
    const { container } = this.app;
    container.singleton(lessonsServiceToken, () =>
      createLessonsService(container.resolve(databaseManagerToken), this.app),
    );
  }
}
