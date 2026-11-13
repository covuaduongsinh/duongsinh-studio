import type { PagePermissionTitles } from './page-permissions.js';

/** Permission labels for application pages without navigation/breadcrumb titles (including overlays).
 * Keys are existing route names; values are application translation keys.
 * Do not add navigation/breadcrumbs or change authorization ids just to name a permission.
 */
export const pagePermissionTitles: PagePermissionTitles = {
  // The projects plugin's overlays and plan page, routed by the application under /issues and /projects.
  'pm-issue-new': 'pagePermissions.newIssue',
  'pm-plan': 'pagePermissions.plan',
  'pm-subtask-new': 'pagePermissions.newSubIssue',
  'pm-project-new': 'pagePermissions.newProject',
  // Registering a NocoBase 3 App (plan V, V5.3): an owner's form opened from the Releases page.
  'releases-register': 'pagePermissions.registerApp',
  // The agents plugin's overlays under /runtimes and /skills.
  'runtimes-connect': 'pagePermissions.addRuntime',
  'skills-new': 'pagePermissions.newSkill',
  'skills-detail': 'pagePermissions.skillDetail',
};
