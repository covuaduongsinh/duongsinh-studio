import foundation from '@nocobase/app-plugin-foundation/client';
import defaultAccess from '@nocobase/app-plugin-authz-default-access/client';
import sharingRules from '@nocobase/app-plugin-authz-sharing-rules/client';
import restrictionRules from '@nocobase/app-plugin-authz-restriction-rules/client';
import {
  defineClientPlugins,
  type AppClientPlugins,
} from '@nocobase/app-client/plugins';
import apiKeys from '@nocobase/app-plugin-api-keys/client';
import authentication from '@nocobase/app-plugin-authentication/client';
import authorization from '@nocobase/app-plugin-authorization/client';
import databaseExplorer from '@nocobase/app-plugin-database-explorer/client';
import users from '@nocobase/app-plugin-users/client';
import notificationInApp from '@nocobase/app-plugin-notification-in-app/client';
import i18n from '@nocobase/app-plugin-i18n/client';
import notification from '@nocobase/app-plugin-notification/client';
import scheduler from '@nocobase/app-plugin-scheduler/client';
import file from '@nocobase/app-plugin-file/client';
import mail from '@nocobase/app-plugin-mail/client';
import agents from '@nocobase/app-plugin-agents/client';
import agentSessions from '@nocobase/app-plugin-agent-sessions/client';
import knowledge from '@nocobase/app-plugin-knowledge/client';
import releases from '@nocobase/app-plugin-releases/client';
import projects from '@nocobase/app-plugin-projects/client';

// Array order is contribution order. A plugin is enabled by appearing in this
// list; removing its entry and its import disables it.
const clientPlugins: AppClientPlugins = defineClientPlugins([
  authentication(),
  authorization(),
  defaultAccess(),
  sharingRules(),
  restrictionRules(),
  databaseExplorer(),
  users(),
  apiKeys(),
  i18n(),
  notificationInApp(),
  notification(),
  file(),
  scheduler(),
  mail(),
  foundation({ settingsGroup: true }),
  agents(),
  // The page tells people to connect a computer with this application's own CLI (`nocobase.cli.bin` in package.json).
  agentSessions({ cli: 'ds-studio' }),
  knowledge(),
  releases(),
  // The application routes the plugin's pages itself (`client/routes.ts`): its `/projects` gains the application's
  // project page as a child, and `/issues` hosts the plugin's New issue dialog and plan page.
  projects({ routes: false }),
]);

export default clientPlugins;
