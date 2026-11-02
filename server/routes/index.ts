import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';
import { accessRoutes } from './access.js';
import { gitRoutes } from './git.js';
import { projectManagerRoutes } from './project-manager.js';
import { projectMemoryRoutes } from './project-memory.js';

const routes: readonly AppRouteContribution<Application>[] = [
  accessRoutes,
  projectManagerRoutes,
  gitRoutes,
  projectMemoryRoutes,
];

export default routes;
