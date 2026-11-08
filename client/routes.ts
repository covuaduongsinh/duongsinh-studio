import {
  BookOpen,
  Bot,
  BrainIcon,
  ChartColumn,
  CircleUserRound,
  Cpu,
  EyeIcon,
  FolderKanban,
  GitBranch,
  Hash,
  LayoutDashboard,
  Home,
  InboxIcon,
  BellRing,
  KeyRound,
  UserCog,
  UserPlus,
  Wallet,
  Library,
  PackageIcon,
  PackagePlus,
  Sparkles,
  ServerCog,
  ListTodo,
  Server,
  Tags,
} from 'lucide-react';
import { chatLinkRoutes } from '@nocobase/app-plugin-agents/client/chat';
import {
  agentsRoute,
  modelsRoute,
  runtimesRoute,
  skillsRoute,
  usageRoute,
} from '@nocobase/app-plugin-agents/client/routes';
import {
  defineAppRoutes,
  type AppClientRouteContribution,
  type AppClientRouteDefinition,
} from '@nocobase/app-client/plugins';
import {
  issueChildRoutes,
  issueDetailChildRoutes,
  projectsRoute,
} from '@nocobase/app-plugin-projects/client/pages';

import { createAppClientConfig } from '@nocobase/app-client';
import { readAppClientRuntimeConfig } from '@nocobase/app-client/runtime';

import { includeNotificationTemplateRoutes } from './pages/settings/notification-routes.js';
import systemSettingsRoutes from './pages/settings/routes.js';
import settingsShellRoutes from './pages/settings/shell-routes.js';

/** A page the projects plugin's page grants open (`pm-issues`, `pm-my-issues`, `pm-projects`). */
const pmPage = (id: string) =>
  ({ resource: { type: 'page', id }, action: 'access' }) as const;

/**
 * The projects plugin's `/projects` (the list and "New project"), routed by the application (`projects({ routes: false })`
 * in `client/plugins.ts`) so a project's own page can be its child. The plugin's definition carries no menu entry or
 * breadcrumb; their titles are the application's.
 */
const projectsPage: AppClientRouteDefinition = {
  ...projectsRoute,
  navigation: { title: 'navigation.projects', icon: FolderKanban },
  breadcrumb: { title: 'navigation.projects' },
  children: [
    ...(projectsRoute.children ?? []),
    {
      // /projects/:projectId: the project's page, laid over the list.
      name: 'project-detail',
      path: ':projectId',
      breadcrumb: { title: 'projectDetail.breadcrumb' },
      componentLoader: () => import('./pages/projects/detail.js'),
    },
  ],
};

const appRoutes: AppClientRouteContribution = defineAppRoutes([
  {
    // Every signed-in user reaches the landing page. `authz: 'skip'` takes it out of page authorization entirely, so
    // no permission change can leave a user signed in with nowhere to land.
    authz: 'skip',
    auth: 'required',
    componentLoader: () => import('./pages/home/index.js'),
    name: 'home',
    navigation: { title: 'navigation.home', icon: Home },
    path: '/',
  },
  {
    // Declares no navigation, so the application decides where its entry goes (for example a sidebar item with an
    // unread badge). The plugin's API answers each person's own messages only, so the page needs no authorization of
    // its own.
    authz: 'skip',
    auth: 'required',
    componentLoader: () => import('./pages/inbox.js'),
    name: 'inbox',
    path: '/inbox',
    // Dương Sinh: the template keeps it out of the menu, but here it is where every decision waits.
    navigation: { title: 'navigation.inbox', icon: InboxIcon },
  },
  {
    auth: 'guest',
    authz: 'skip',
    componentLoader: () => import('./pages/auth/login.js'),
    name: 'login',
    path: '/login',
  },
  {
    auth: 'guest',
    authz: 'skip',
    componentLoader: () => import('./pages/auth/register.js'),
    name: 'register',
    path: '/register',
  },
  {
    auth: 'guest',
    authz: 'skip',
    componentLoader: () => import('./pages/auth/forgot-password.js'),
    name: 'forgot-password',
    path: '/forgot-password',
  },
  {
    auth: 'guest',
    authz: 'skip',
    componentLoader: () => import('./pages/auth/reset-password.js'),
    name: 'reset-password',
    path: '/reset-password',
  },
  {
    // Where a command line's sign-in sends the person to approve it (`pages/auth/device.tsx`). Optional rather than
    // required so it renders outside the shell, like the sign-in pages; the page sends a guest to sign in and back.
    auth: 'optional',
    authz: 'skip',
    componentLoader: () => import('./pages/auth/device.js'),
    name: 'device',
    path: '/device',
  },
  {
    // The viewer's owned or executed issues. The issues it lists open on the issue page under /issues.
    name: 'my-issues',
    path: '/my-issues',
    auth: 'required',
    authz: pmPage('pm-my-issues'),
    navigation: { title: 'navigation.myIssues', icon: CircleUserRound },
    componentLoader: () => import('./pages/my-issues/index.js'),
  },
  {
    // How delivery goes and what is stuck. The server limits every figure to what the viewer may see.
    name: 'dashboard',
    path: '/dashboard',
    auth: 'required',
    authz: pmPage('reports'),
    navigation: { title: 'navigation.dashboard', icon: LayoutDashboard },
    componentLoader: () => import('./pages/dashboard/index.js'),
  },
  {
    // The open issues the viewer takes part in. Whoever reaches issues reaches it; the server answers only those they see.
    name: 'follow-ups',
    path: '/follow-ups',
    auth: 'required',
    authz: pmPage('pm-issues'),
    navigation: { title: 'navigation.followUps', icon: EyeIcon },
    componentLoader: () => import('./pages/follow-ups/index.js'),
  },
  {
    // Every issue the viewer can see, as a list or a board. Its children render at the page's outlet: the plugin's
    // "New issue" dialog (`new`) and plan page (`plans/:planId`), and the issue's own page (`:issueId`), which hosts
    // the plugin's "New sub-issue" dialog (`new-subtask`).
    name: 'issues',
    path: '/issues',
    auth: 'required',
    authz: pmPage('pm-issues'),
    navigation: { title: 'navigation.issues', icon: ListTodo },
    componentLoader: () => import('./pages/issues/index.js'),
    children: [
      ...issueChildRoutes,
      {
        name: 'issue-detail',
        path: ':issueId',
        breadcrumb: { title: 'issueDetail.breadcrumb' },
        componentLoader: () => import('./pages/issues/detail/index.js'),
        children: [...issueDetailChildRoutes],
      },
    ],
  },
  projectsPage,
  {
    // What agents remember about each project, from `.nb-studio/memory/` of its repositories. Whoever reaches Projects
    // reaches it; the server answers only the projects the viewer sees.
    name: 'project-memory',
    path: '/project-memory',
    auth: 'required',
    authz: pmPage('pm-projects'),
    navigation: { title: 'navigation.projectMemory', icon: BrainIcon },
    componentLoader: () => import('./pages/project-memory/index.js'),
  },
  {
    // The knowledge plugin's view over the spaces the viewer reads: the shared space and their projects' spaces. The
    // plugin's own route is off (`knowledge({ routes: false })`): it shows one space and knows no projects.
    name: 'knowledge',
    path: '/knowledge',
    auth: 'required',
    authz: pmPage('knowledge'),
    navigation: { title: 'navigation.knowledge', icon: Library },
    componentLoader: () => import('./pages/knowledge/index.js'),
  },
  {
    // A project with its repository and first issue, in one step. The server checks who may create and link each.
    name: 'project-setup',
    path: '/project-setup',
    auth: 'required',
    authz: pmPage('pm-projects'),
    navigation: { title: 'navigation.projectSetup', icon: PackagePlus },
    componentLoader: () => import('./pages/projects/setup.js'),
  },
  {
    // Where Dương Sinh's work is: previews, staging, versions of each repository and what waits for production
    // (`server/routes/deploys.ts`). Behind the releases plugin's page grant, which the built-in roles hold.
    name: 'releases-hub',
    path: '/releases',
    auth: 'required',
    authz: pmPage('rel-apps'),
    navigation: { title: 'navigation.releases', icon: PackageIcon },
    componentLoader: () => import('./pages/releases/index.js'),
  },
  {
    // Dương Sinh's hosted environments (preview, staging, production), all outside Studio and recorded here.
    name: 'hosted-environments',
    path: '/environments',
    auth: 'required',
    authz: pmPage('rel-apps'),
    navigation: { title: 'navigation.environments', icon: ServerCog },
    componentLoader: () => import('./pages/environments/index.js'),
  },
  {
    // One conversation with an agent as a page (the chat panel's "Open full page"). The agents plugin answers each
    // person's own conversations only, so the page needs no authorization of its own.
    name: 'chat-conversation',
    path: '/chat/:conversationId',
    auth: 'required',
    authz: 'skip',
    breadcrumb: { title: 'navigation.chat' },
    componentLoader: () => import('./pages/chat/conversation.js'),
  },
  // Links that open the chat panel on any page (`/chat-link`, `/chat-link/new`, `/chat-link/:conversationId`), as the
  // agents plugin's notices link conversations.
  ...chatLinkRoutes('/chat-link'),
]);

/**
 * The projects plugin's settings pages, as cards on the System settings home: the issue prefix and the shared labels
 * under Business, Git connections under System. Each opens with the settings item the plugin registers and its
 * endpoints check (`pm.general`, `pm.labels`). The categories are pathless, so the URLs stay `/settings/<path>`.
 */
const projectSettingsRoutes: AppClientRouteContribution = defineAppRoutes([
  {
    name: 'settingsIssuePrefix',
    parent: 'settingsBusiness',
    path: '/issue-prefix',
    auth: 'required',
    authz: { resource: { type: 'settings', id: 'pm.general' }, action: 'read' },
    navigation: {
      title: 'navigation.issuePrefix',
      description: 'navigation.issuePrefixDescription',
      icon: Hash,
    },
    componentLoader: () => import('./pages/settings/projects-general.js'),
  },
  {
    name: 'settingsIssueLabels',
    parent: 'settingsBusiness',
    path: '/issue-labels',
    auth: 'required',
    authz: { resource: { type: 'settings', id: 'pm.labels' }, action: 'read' },
    navigation: {
      title: 'navigation.issueLabels',
      description: 'navigation.issueLabelsDescription',
      icon: Tags,
    },
    componentLoader: () => import('./pages/settings/projects-labels.js'),
  },
  {
    name: 'settingsProjectDefaultSkills',
    parent: 'settingsBusiness',
    path: '/project-default-skills',
    auth: 'required',
    authz: {
      resource: { type: 'settings', id: 'agents.agents' },
      action: 'read',
    },
    navigation: {
      title: 'navigation.projectDefaultSkills',
      description: 'navigation.projectDefaultSkillsDescription',
      icon: Sparkles,
    },
    componentLoader: () => import('./pages/settings/project-default-skills.js'),
  },
  {
    // GitHub connections and linked repositories. Every endpoint of `server/routes/git.ts` the page calls requires an
    // administrator: the `pm.members` `define-roles` settings item, which the page checks too.
    name: 'settingsGit',
    parent: 'settingsSystem',
    path: '/git',
    auth: 'required',
    authz: {
      resource: { type: 'settings', id: 'pm.members' },
      action: 'define-roles',
    },
    navigation: {
      title: 'navigation.git',
      description: 'navigation.gitDescription',
      icon: GitBranch,
    },
    componentLoader: () => import('./pages/settings/git.js'),
  },
  {
    // API keys of the organization, for CI and other machines. The server also refuses every key here.
    name: 'settingsOrganizationKeys',
    parent: 'settingsSystem',
    path: '/organization-keys',
    auth: 'required',
    authz: {
      resource: { type: 'settings', id: 'studio.apiKeys' },
      action: 'read',
    },
    navigation: {
      title: 'navigation.organizationKeys',
      description: 'navigation.organizationKeysDescription',
      icon: KeyRound,
    },
    componentLoader: () => import('./pages/settings/organization-keys.js'),
  },
  {
    // The project manager (lead agent): its models, waits and principles. Reading needs the agents settings item's `read`
    // (the server checks it too), changing it `manage`.
    name: 'settingsProjectManager',
    parent: 'settingsSystem',
    path: '/project-manager',
    auth: 'required',
    authz: {
      resource: { type: 'settings', id: 'agents.agents' },
      action: 'read',
    },
    navigation: {
      title: 'navigation.projectManager',
      description: 'navigation.projectManagerDescription',
      icon: UserCog,
    },
    componentLoader: () => import('./pages/settings/project-manager.js'),
  },
  {
    // Limits of runs and tokens. The server also checks this on every request.
    name: 'settingsBudgets',
    parent: 'settingsSystem',
    path: '/budgets',
    auth: 'required',
    authz: {
      resource: { type: 'settings', id: 'studio.budgets' },
      action: 'read',
    },
    navigation: {
      title: 'navigation.budgets',
      description: 'navigation.budgetsDescription',
      icon: Wallet,
    },
    componentLoader: () => import('./pages/settings/budgets.js'),
  },
  {
    // The role a new member is given once when they accept an invitation, and who holds it (`/api/access/settings`).
    // The server checks `pm.members` read, and `define-roles` to change it.
    name: 'settingsNewMemberRole',
    parent: 'settingsAccount',
    path: '/new-member-role',
    auth: 'required',
    authz: {
      resource: { type: 'settings', id: 'pm.members' },
      action: 'read',
    },
    navigation: {
      title: 'navigation.newMemberRole',
      description: 'navigation.newMemberRoleDescription',
      icon: UserPlus,
    },
    componentLoader: () => import('./pages/settings/new-member-role.js'),
  },
  {
    // The signed-in person's own profile, password and API keys. It only ever acts on their own account, through the
    // Better Auth client, so everyone signed in may open it; the server decides again on every call.
    name: 'settingsMyAccount',
    parent: 'settingsAccount',
    path: '/my-account',
    auth: 'required',
    authz: 'skip',
    navigation: {
      title: 'navigation.myAccount',
      description: 'navigation.myAccountDescription',
      icon: CircleUserRound,
    },
    componentLoader: () => import('./pages/settings/my-account/index.js'),
  },
  {
    // Each person's own choices, so everyone signed in may open it.
    name: 'settingsMyNotifications',
    parent: 'settingsAccount',
    path: '/my-notifications',
    auth: 'required',
    authz: 'skip',
    navigation: {
      title: 'navigation.myNotifications',
      description: 'navigation.myNotificationsDescription',
      icon: BellRing,
    },
    componentLoader: () => import('./pages/settings/my-notifications.js'),
  },
]);

/**
 * The agents plugin's pages (it routes none itself): agents found on runtimes, the runtimes, the skill library, usage,
 * and the model services. Each keeps the plugin's path and grant (a page grant named like the route; Models stands
 * behind `agents.services` read); the application adds the menu entries.
 */
const agentRoutes: AppClientRouteContribution = defineAppRoutes([
  {
    ...agentsRoute,
    navigation: { title: 'navigation.agents', icon: Bot },
  },
  {
    ...runtimesRoute,
    navigation: { title: 'navigation.runtimes', icon: Server },
  },
  {
    ...skillsRoute,
    navigation: { title: 'navigation.skills', icon: BookOpen },
  },
  {
    ...usageRoute,
    navigation: { title: 'navigation.usage', icon: ChartColumn },
  },
  {
    ...modelsRoute,
    navigation: { title: 'navigation.models', icon: Cpu },
  },
]);

// The application has business capabilities (projects and issues), so the prepared Users and Roles settings are
// registered in the System settings shell, and the projects plugin's settings join them. The shell stays after the
// agent pages so the sidebar keeps its order.
export function createApplicationRoutes(
  rawConfig: unknown = readAppClientRuntimeConfig(),
): readonly AppClientRouteContribution[] {
  const config = createAppClientConfig({ rawConfig });
  return includeNotificationTemplateRoutes(
    [
      appRoutes,
      agentRoutes,
      settingsShellRoutes,
      systemSettingsRoutes,
      projectSettingsRoutes,
    ],
    config.get<boolean>('notificationTemplates.invitationConfigured') === true,
  );
}

const routes: readonly AppClientRouteContribution[] = createApplicationRoutes();

export default routes;
