import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';
import { accessRoutes } from './access.js';
import { autopilotRoutes } from './autopilot.js';
import { budgetRoutes } from './budgets.js';
import { buildRoutes } from './builds.js';
import { deployRoutes } from './deploys.js';
import { gitRoutes } from './git.js';
import { inboxRoutes } from './inbox.js';
import { issueCriteriaRoutes } from './issue-criteria.js';
import { issueWorkRoutes } from './issue-work.js';
import { kbRoutes } from './kb.js';
import { projectManagerRoutes } from './project-manager.js';
import { organizationKeyRoutes } from './organization-keys.js';
import { projectMemoryRoutes } from './project-memory.js';
import { projectSetupRoutes } from './project-setups.js';
import { reportRoutes } from './reports.js';
import { reviewRoutes } from './reviews.js';
import { webhookRoutes } from './webhooks.js';

const routes: readonly AppRouteContribution<Application>[] = [
  accessRoutes,
  autopilotRoutes,
  projectManagerRoutes,
  gitRoutes,
  reviewRoutes,
  issueWorkRoutes,
  issueCriteriaRoutes,
  inboxRoutes,
  reportRoutes,
  projectSetupRoutes,
  organizationKeyRoutes,
  webhookRoutes,
  projectMemoryRoutes,
  kbRoutes,
  budgetRoutes,
  buildRoutes,
  deployRoutes,
];

export default routes;
