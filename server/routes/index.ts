import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';
import { accessRoutes } from './access.js';
import { autopilotRoutes } from './autopilot.js';
import { reactionRoutes } from './reactions.js';
import { issueTierRoutes } from './issue-tier.js';
import { branchProtectionRoutes } from './branch-protection.js';
import { harnessExportRoutes } from './harness-export.js';
import { uiSmokeRoutes } from './ui-smoke.js';
import { budgetRoutes } from './budgets.js';
import { buildRoutes } from './builds.js';
import { deployRoutes } from './deploys.js';
import { gitRoutes } from './git.js';
import { hostLoadRoutes } from './host-load.js';
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
import { benchRoutes } from './bench.js';
import { lessonRoutes } from './lessons.js';
import { nb3AppsRegisterRoutes } from './nb3-apps-register.js';
import { nb3JobRoutes } from './nb3-jobs.js';
import { secretFindingsRoutes } from './secret-findings.js';
import { playbookRoutes } from './playbooks.js';
import { runnerRoutes } from './runner.js';
import { verificationPlanRoutes } from './verification-plan.js';
import { verificationRoutes } from './verifications.js';
import { webhookRoutes } from './webhooks.js';

const routes: readonly AppRouteContribution<Application>[] = [
  accessRoutes,
  autopilotRoutes,
  reactionRoutes,
  issueTierRoutes,
  branchProtectionRoutes,
  harnessExportRoutes,
  uiSmokeRoutes,
  projectManagerRoutes,
  gitRoutes,
  hostLoadRoutes,
  reviewRoutes,
  verificationRoutes,
  verificationPlanRoutes,
  benchRoutes,
  lessonRoutes,
  nb3JobRoutes,
  nb3AppsRegisterRoutes,
  secretFindingsRoutes,
  playbookRoutes,
  runnerRoutes,
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
