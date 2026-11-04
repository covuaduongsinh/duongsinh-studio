import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';
import { accessRoutes } from './access.js';
import { deployRoutes } from './deploys.js';
import { gitRoutes } from './git.js';
import { kbRoutes } from './kb.js';
import { projectManagerRoutes } from './project-manager.js';
import { projectMemoryRoutes } from './project-memory.js';
import { reviewRoutes } from './reviews.js';
import { webhookRoutes } from './webhooks.js';

const routes: readonly AppRouteContribution<Application>[] = [
  accessRoutes,
  projectManagerRoutes,
  gitRoutes,
  reviewRoutes,
  webhookRoutes,
  projectMemoryRoutes,
  kbRoutes,
  deployRoutes,
];

export default routes;
