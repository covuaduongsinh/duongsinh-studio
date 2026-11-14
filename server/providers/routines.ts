import { agentsToken } from '@nocobase/app-plugin-agents/server/tokens';
import { authorizationToken } from '@nocobase/app-plugin-authorization';
import {
  projectsAccessToken,
  projectsToken,
} from '@nocobase/app-plugin-projects/server/tokens';
import type { Application } from '@nocobase/app-server/application';
import { jobExecutorServiceToken } from '@nocobase/app-server/jobs';
import { databaseManagerToken } from '@nocobase/db';
import type { ScheduleExecutor } from '@nocobase/jobs';
import {
  ServiceProvider,
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';
import { appText } from '../agents/ids.js';
import {
  createRoutinesService,
  type RoutinesService,
} from '../routines/service.js';
import { budgetServiceToken } from './outbound.js';

export const routinesServiceToken: ServiceToken<RoutinesService> =
  createServiceToken<RoutinesService>('app/routines');

export const ROUTINES_SETTINGS = 'studio.routines';

/** Work that comes back on a schedule (plan T, T6): the service, its settings permission and its schedules. */
export default class RoutinesProvider extends ServiceProvider<Application> {
  readonly name = 'app/routines';
  private executor?: ScheduleExecutor;

  override register(): void {
    const { container } = this.app;
    container.singleton(routinesServiceToken, () =>
      createRoutinesService({
        conn: () => container.resolve(databaseManagerToken).connection(),
        projects: () => container.resolve(projectsToken),
        budgets: () => container.resolve(budgetServiceToken),
        executor: () => this.executor,
        viewerOf: async (userId) => {
          const access = container.resolve(projectsAccessToken);
          if (!access.permissionsOfUser) return null;
          return {
            userId,
            actor: { type: 'user', id: userId },
            permissions: await access.permissionsOfUser(userId),
          };
        },
      }),
    );
  }

  override async boot(): Promise<void> {
    const { container } = this.app;
    if (!container.has(authorizationToken)) return;
    const authz = container.resolve(authorizationToken);
    authz.settings.add({
      id: ROUTINES_SETTINGS,
      title: appText('studioRoutines.settingsTitle'),
      actions: [
        { name: 'read', title: appText('studioOrgKeys.read') },
        { name: 'manage', title: appText('studioOrgKeys.manage') },
      ],
    });
    authz.ui.place(
      { type: 'settings', id: ROUTINES_SETTINGS },
      { section: 'studio' },
    );
    await Promise.resolve();
  }

  override async start(): Promise<void> {
    // A command-line run has no clock to keep.
    if (this.app.consoleLogStream === 'stderr') return;
    const { container } = this.app;
    if (!container.has(agentsToken) || !container.has(projectsToken)) return;
    // The scope autopilot uses: its `start` owns `setup()` and `shutdown()`; this only adds the routines' own jobs.
    this.executor = container
      .resolve(jobExecutorServiceToken)
      .getScheduleExecutor('duongsinh-studio');
    const database = container.resolve(databaseManagerToken);
    if (!(await database.collections().getPhysical('dsRoutines'))) return;
    await container.resolve(routinesServiceToken).syncAll();
  }

  override async shutdown(): Promise<void> {
    this.executor = undefined;
    await Promise.resolve();
  }
}
