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
  Home,
  Library,
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

import systemSettingsRoutes from './pages/settings/routes.js';

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
 * The projects plugin's settings pages, appended to the prepared Settings group: the issue prefix and the shared
 * labels. Each opens with the settings item the plugin registers and its endpoints check (`pm.general`, `pm.labels`).
 */
const projectSettingsRoutes: AppClientRouteContribution = defineAppRoutes([
  {
    name: 'settingsIssuePrefix',
    parent: 'settings',
    path: '/issue-prefix',
    auth: 'required',
    authz: { resource: { type: 'settings', id: 'pm.general' }, action: 'read' },
    navigation: { title: 'navigation.issuePrefix', icon: Hash },
    componentLoader: () => import('./pages/settings/projects-general.js'),
  },
  {
    name: 'settingsIssueLabels',
    parent: 'settings',
    path: '/issue-labels',
    auth: 'required',
    authz: { resource: { type: 'settings', id: 'pm.labels' }, action: 'read' },
    navigation: { title: 'navigation.issueLabels', icon: Tags },
    componentLoader: () => import('./pages/settings/projects-labels.js'),
  },
  {
    // GitHub connections and linked repositories. Every endpoint of `server/routes/git.ts` the page calls requires an
    // administrator: the `pm.members` `define-roles` settings item, which the page checks too.
    name: 'settingsGit',
    parent: 'settings',
    path: '/git',
    auth: 'required',
    authz: {
      resource: { type: 'settings', id: 'pm.members' },
      action: 'define-roles',
    },
    navigation: { title: 'navigation.git', icon: GitBranch },
    componentLoader: () => import('./pages/settings/git.js'),
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
// registered, and the projects plugin's settings join them.
const routes: readonly AppClientRouteContribution[] = [
  appRoutes,
  agentRoutes,
  systemSettingsRoutes,
  projectSettingsRoutes,
];

export default routes;
