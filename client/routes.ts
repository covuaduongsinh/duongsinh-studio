import {
  BookOpen,
  Bot,
  BrainIcon,
  ChartColumn,
  CircleUserRound,
  Cpu,
  FolderKanban,
  GitBranch,
  Hash,
  LayoutDashboard,
  Home,
  BellRing,
  KeyRound,
  UserCog,
  UserPlus,
  CalendarClock,
  Wallet,
  Library,
  PackageIcon,
  PackagePlus,
  Sparkles,
  ServerCog,
  ListTodo,
  Server,
  ShieldCheck,
  FileCheck,
  GraduationCap,
  Tags,
  type LucideIcon,
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
  type AppClientRouteAuthz,
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
 * The projects plugin's "New issue" dialog opens on "Manual" unless the person chose a tab (V0.1): its AI tab splits
 * every bullet of a long prompt into one issue each. The plugin's `IssueCreationModeContext='manual'` would hide the AI
 * tab altogether, so the route's own loader is wrapped instead (`pages/issues/new-issue-entry.tsx`). The application
 * hosts `issueChildRoutes` itself, so this is composition, not a second declaration of the plugin's route.
 */
const withManualNewIssue = (
  route: AppClientRouteDefinition,
): AppClientRouteDefinition => {
  const load = route.componentLoader;
  if (route.name !== 'pm-issue-new' || load === undefined) return route;
  return {
    ...route,
    componentLoader: async () => {
      const [page, entry] = await Promise.all([
        load(),
        import('./pages/issues/new-issue-entry.js'),
      ]);
      return { ...page, default: entry.withManualDefault(page.default) };
    },
  };
};

/**
 * The projects plugin's `/projects` (the list and "New project"), routed by the application (`projects({ routes: false })`
 * in `client/plugins.ts`) so a project's own page can be its child. The plugin's definition carries no menu entry or
 * breadcrumb; their titles are the application's.
 */
const projectsPage: AppClientRouteDefinition = {
  ...projectsRoute,
  navigation: { title: 'navigation.projects', icon: FolderKanban, order: 40 },
  breadcrumb: { title: 'navigation.projects' },
  children: [
    ...(projectsRoute.children ?? []),
    {
      // /projects/:projectId: the project's page, laid over the list.
      name: 'project-detail',
      path: ':projectId',
      breadcrumb: { title: 'projectDetail.breadcrumb' },
      componentLoader: () => import('./pages/projects/detail/index.js'),
      // One route per tab; the bare path opens Overview (the page redirects). The tabs inherit the project page's
      // authorization, and each has its own breadcrumb title (which also names it among the page permissions).
      children: [
        {
          name: 'project-overview',
          path: 'overview',
          breadcrumb: { title: 'projectDetail.tabs.overview' },
          componentLoader: () =>
            import('./pages/projects/detail/overview.js').then((module) => ({
              default: module.ProjectOverviewTab,
            })),
        },
        {
          name: 'project-issues',
          path: 'issues',
          breadcrumb: { title: 'projectDetail.tabs.issues' },
          componentLoader: () =>
            import('./pages/projects/detail/issues.js').then((module) => ({
              default: module.ProjectIssuesTab,
            })),
        },
        {
          name: 'project-knowledge',
          path: 'knowledge',
          breadcrumb: { title: 'projectDetail.tabs.knowledge' },
          componentLoader: () =>
            import('./pages/projects/detail/knowledge.js').then((module) => ({
              default: module.ProjectKnowledgeTab,
            })),
        },
        {
          name: 'project-memory-tab',
          path: 'memory',
          breadcrumb: { title: 'projectDetail.tabs.memory' },
          componentLoader: () =>
            import('./pages/projects/detail/memory.js').then((module) => ({
              default: module.ProjectMemoryTab,
            })),
        },
        {
          name: 'project-members',
          path: 'members',
          breadcrumb: { title: 'projectDetail.tabs.members' },
          componentLoader: () =>
            import('./pages/projects/detail/members.js').then((module) => ({
              default: module.ProjectMembersTab,
            })),
        },
        {
          name: 'project-releases',
          path: 'releases',
          breadcrumb: { title: 'projectDetail.tabs.releases' },
          componentLoader: () =>
            import('./pages/projects/detail/releases.js').then((module) => ({
              default: module.ProjectReleasesTab,
            })),
        },
        {
          name: 'project-settings',
          path: 'settings',
          breadcrumb: { title: 'projectDetail.tabs.settings' },
          componentLoader: () =>
            import('./pages/projects/detail/settings.js').then((module) => ({
              default: module.ProjectSettingsTab,
            })),
        },
      ],
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
    navigation: { title: 'navigation.today', icon: Home, order: 10 },
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
    // Dương Sinh: out of the sidebar since V1.2 (the header bell and the Today page lead here); the title stays for the
    // breadcrumb and the page-permission list.
    breadcrumb: { title: 'navigation.inbox' },
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
    breadcrumb: { title: 'navigation.myIssues' },
    componentLoader: () => import('./pages/my-issues/index.js'),
  },
  {
    // The viewer's agent sessions and chat workspace matching the Studio layout.
    name: 'my-sessions',
    path: '/sessions',
    auth: 'required',
    authz: 'skip',
    navigation: { title: 'navigation.mySessions', icon: Sparkles, order: 30 },
    componentLoader: () => import('./pages/sessions/index.js'),
    children: [
      {
        name: 'session-detail',
        path: ':conversationId',
        componentLoader: () => import('./pages/sessions/index.js'),
      },
    ],
  },
  {
    // How delivery goes and what is stuck. The server limits every figure to what the viewer may see.
    name: 'dashboard',
    path: '/dashboard',
    auth: 'required',
    authz: pmPage('reports'),
    navigation: {
      title: 'navigation.dashboard',
      icon: LayoutDashboard,
      order: 70,
    },
    componentLoader: () => import('./pages/dashboard/index.js'),
  },
  {
    // The open issues the viewer takes part in. Whoever reaches issues reaches it; the server answers only those they see.
    name: 'follow-ups',
    path: '/follow-ups',
    auth: 'required',
    authz: pmPage('pm-issues'),
    breadcrumb: { title: 'navigation.followUps' },
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
    navigation: { title: 'navigation.issues', icon: ListTodo, order: 20 },
    componentLoader: () => import('./pages/issues/index.js'),
    children: [
      ...issueChildRoutes.map(withManualNewIssue),
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
    breadcrumb: { title: 'navigation.projectMemory' },
    componentLoader: () => import('./pages/project-memory/index.js'),
  },
  {
    // The knowledge plugin's view over the spaces the viewer reads: the shared space and their projects' spaces. The
    // plugin's own route is off (`knowledge({ routes: false })`): it shows one space and knows no projects.
    name: 'knowledge',
    path: '/knowledge',
    auth: 'required',
    authz: pmPage('knowledge'),
    navigation: { title: 'navigation.knowledge', icon: Library, order: 60 },
    componentLoader: () => import('./pages/knowledge/index.js'),
  },
  {
    // A project with its repository and first issue, in one step. The server checks who may create and link each.
    name: 'project-setup',
    path: '/project-setup',
    auth: 'required',
    authz: pmPage('pm-projects'),
    breadcrumb: { title: 'navigation.projectSetup' },
    componentLoader: () => import('./pages/projects/setup.js'),
  },
  {
    // Where Dương Sinh's work is: previews, staging, versions of each repository and what waits for production
    // (`server/routes/deploys.ts`). Behind the releases plugin's page grant, which the built-in roles hold.
    name: 'releases-hub',
    path: '/releases',
    auth: 'required',
    authz: pmPage('rel-apps'),
    navigation: { title: 'navigation.releases', icon: PackageIcon, order: 50 },
    componentLoader: () => import('./pages/releases/index.js'),
  },
  {
    // Registers a NocoBase 3 App for a repository (`POST /api/nb3Apps/register`, the owner only; the page is under the same grant
    // as the Releases page and the server refuses anyone else). Opened from a button on the Releases page, so no navigation.
    name: 'releases-register',
    path: '/releases/register',
    auth: 'required',
    authz: pmPage('rel-apps'),
    componentLoader: () => import('./pages/releases/register-app.js'),
  },
  {
    // Dương Sinh's hosted environments (preview, staging, production), all outside Studio and recorded here.
    name: 'hosted-environments',
    path: '/environments',
    auth: 'required',
    authz: pmPage('rel-apps'),
    breadcrumb: { title: 'navigation.environments' },
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
    parent: 'settingsAi',
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
    name: 'settingsVerifications',
    parent: 'settingsAi',
    path: '/verifications',
    auth: 'required',
    authz: {
      resource: { type: 'settings', id: 'agents.agents' },
      action: 'read',
    },
    navigation: {
      title: 'navigation.verifications',
      description: 'navigation.verificationsDescription',
      icon: ShieldCheck,
    },
    componentLoader: () => import('./pages/settings/verifications.js'),
  },
  {
    name: 'settingsReviews',
    parent: 'settingsAi',
    path: '/reviews',
    auth: 'required',
    authz: {
      resource: { type: 'settings', id: 'agents.agents' },
      action: 'read',
    },
    navigation: {
      title: 'navigation.reviews',
      description: 'navigation.reviewsDescription',
      icon: FileCheck,
    },
    componentLoader: () => import('./pages/settings/reviews.js'),
  },
  {
    name: 'settingsLessons',
    parent: 'settingsAi',
    path: '/lessons',
    auth: 'required',
    authz: {
      resource: { type: 'settings', id: 'agents.agents' },
      action: 'read',
    },
    navigation: {
      title: 'navigation.lessons',
      description: 'navigation.lessonsDescription',
      icon: GraduationCap,
    },
    componentLoader: () => import('./pages/settings/lessons.js'),
  },
  {
    name: 'settingsPlaybooks',
    parent: 'settingsAi',
    path: '/playbooks',
    auth: 'required',
    authz: {
      resource: { type: 'settings', id: 'agents.agents' },
      action: 'read',
    },
    navigation: {
      title: 'navigation.playbooks',
      description: 'navigation.playbooksDescription',
      icon: BookOpen,
    },
    componentLoader: () => import('./pages/settings/playbooks.js'),
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
    parent: 'settingsAccount',
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
    parent: 'settingsAi',
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
    parent: 'settingsAi',
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
    // Work that comes back on a schedule, off until someone turns it on. The server checks `studio.routines` too.
    name: 'settingsRoutines',
    parent: 'settingsAi',
    path: '/routines',
    auth: 'required',
    authz: {
      resource: { type: 'settings', id: 'studio.routines' },
      action: 'read',
    },
    navigation: {
      title: 'navigation.routines',
      description: 'navigation.routinesDescription',
      icon: CalendarClock,
    },
    componentLoader: () => import('./pages/settings/routines.js'),
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
    parent: 'settingsPersonal',
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
    parent: 'settingsPersonal',
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
    breadcrumb: { title: 'navigation.agents' },
  },
  {
    ...runtimesRoute,
    breadcrumb: { title: 'navigation.runtimes' },
  },
  {
    ...skillsRoute,
    breadcrumb: { title: 'navigation.skills' },
  },
  {
    ...usageRoute,
    breadcrumb: { title: 'navigation.usage' },
  },
  {
    ...modelsRoute,
    breadcrumb: { title: 'navigation.models' },
  },
]);

/**
 * Pages that left the sidebar in V1.2 (the menu is eight entries) and are still one tap away inside Settings: each is a
 * settings entry that opens the page where it has always been (`/agents`, `/runtimes`, ...), with the same grant. Their
 * paths, names and authorization are untouched, so stored page grants, the plugin's own links and notices still work;
 * `pages/settings/shortcut.tsx` only forwards. Moving the pages under `/settings` would change their URLs and the
 * plugin's overlays under them.
 */
const settingsShortcut = (
  name: string,
  parent: string,
  target: string,
  title: string,
  icon: LucideIcon,
  authz: AppClientRouteAuthz | undefined,
): AppClientRouteDefinition => ({
  name,
  parent,
  path: `/go${target}`,
  auth: 'required',
  authz,
  navigation: { title, icon },
  componentLoader: () => import('./pages/settings/shortcut.js'),
});

const settingsShortcutRoutes: AppClientRouteContribution = defineAppRoutes([
  settingsShortcut(
    'settingsGoAgents',
    'settingsAi',
    '/agents',
    'navigation.agents',
    Bot,
    agentsRoute.authz,
  ),
  settingsShortcut(
    'settingsGoRuntimes',
    'settingsAi',
    '/runtimes',
    'navigation.runtimes',
    Server,
    runtimesRoute.authz,
  ),
  settingsShortcut(
    'settingsGoSkills',
    'settingsAi',
    '/skills',
    'navigation.skills',
    BookOpen,
    skillsRoute.authz,
  ),
  settingsShortcut(
    'settingsGoModels',
    'settingsAi',
    '/models',
    'navigation.models',
    Cpu,
    modelsRoute.authz,
  ),
  settingsShortcut(
    'settingsGoUsage',
    'settingsAi',
    '/usage',
    'navigation.usage',
    ChartColumn,
    usageRoute.authz,
  ),
  settingsShortcut(
    'settingsGoProjectMemory',
    'settingsBusiness',
    '/project-memory',
    'navigation.projectMemory',
    BrainIcon,
    pmPage('pm-projects'),
  ),
  settingsShortcut(
    'settingsGoProjectSetup',
    'settingsBusiness',
    '/project-setup',
    'navigation.projectSetup',
    PackagePlus,
    pmPage('pm-projects'),
  ),
  settingsShortcut(
    'settingsGoEnvironments',
    'settingsSystem',
    '/environments',
    'navigation.environments',
    ServerCog,
    pmPage('rel-apps'),
  ),
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
      settingsShortcutRoutes,
    ],
    config.get<boolean>('notificationTemplates.invitationConfigured') === true,
  );
}

const routes: readonly AppClientRouteContribution[] = createApplicationRoutes();

export default routes;
