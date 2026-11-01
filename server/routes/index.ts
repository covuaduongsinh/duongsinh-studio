import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';
import { accessRoutes } from './access.js';
import { projectManagerRoutes } from './project-manager.js';

const routes: readonly AppRouteContribution<Application>[] = [
  accessRoutes,
  projectManagerRoutes,
];

export default routes;
