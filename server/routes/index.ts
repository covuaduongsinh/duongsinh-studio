import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';
import { accessRoutes } from './access.js';
import { gitRoutes } from './git.js';
import { kbRoutes } from './kb.js';
import { projectManagerRoutes } from './project-manager.js';
import { projectMemoryRoutes } from './project-memory.js';
import { webhookRoutes } from './webhooks.js';

const routes: readonly AppRouteContribution<Application>[] = [
  accessRoutes,
  projectManagerRoutes,
  gitRoutes,
  webhookRoutes,
  projectMemoryRoutes,
  kbRoutes,
];

export default routes;
