import type { AgentActionOption } from '@nocobase/app-plugin-agents/shared/agents';
import * as agentsAccess from '@nocobase/app-plugin-agents/shared/access';
import * as kbAccess from '@nocobase/app-plugin-knowledge/shared/access';
import * as pmAccess from '@nocobase/app-plugin-projects/shared/access';
import * as relAccess from '@nocobase/app-plugin-releases/shared/access';
import { appText } from './ids.js';

/**
 * A business action as Studio knows it: what the agents plugin offers in an agent's Capabilities tab (`option`), and
 * where the authorization plugin grants it (`resource` and the action `names` of its levels, such as
 * `comment.related` and `comment.all`).
 */
export interface StudioAction {
  readonly option: AgentActionOption;
  readonly resource: { readonly type: string; readonly id: string };
  readonly names: readonly string[];
  /**
   * Held through another action's grant (`resource` and `names` are that action's): a person holds it with that
   * action, and it adds nothing to what a run may do over the API (`runKeyScope`), so a run needs both.
   */
  readonly borrowed?: boolean;
}

interface Flags {
  readonly defaultOn?: boolean;
  /** Listed to show the boundary only: never granted to an agent. */
  readonly peopleOnly?: boolean;
}

const peopleOnly = appText('studioAgents.actions.peopleOnly');

function option(
  key: string,
  group: string,
  texts: Pick<AgentActionOption, 'title' | 'groupTitle' | 'description'>,
  flags: Flags,
): AgentActionOption {
  return {
    key,
    group,
    ...texts,
    ...(flags.defaultOn ? { defaultOn: true } : {}),
    ...(flags.peopleOnly ? { grantable: false, reason: peopleOnly } : {}),
  };
}

function pm<B extends pmAccess.Business>(
  business: B,
  action: pmAccess.BusinessAction<B>,
  flags: Flags = {},
): StudioAction {
  const key = pmAccess.businessKey(business, action);
  return {
    option: option(
      key,
      business,
      {
        title: pmAccess.actionText(key, 'title'),
        description: pmAccess.actionText(key, 'description'),
        groupTitle: pmAccess.businessText(business, 'title'),
      },
      flags,
    ),
    resource: { type: pmAccess.RESOURCE_TYPE, id: business },
    names: pmAccess.levelActionsOf(key).map((level) => level.name),
  };
}

function rel(
  action: relAccess.BusinessAction<'rel.apps'>,
  flags: Flags = {},
): StudioAction {
  const key = relAccess.businessKey('rel.apps', action);
  return {
    option: option(
      key,
      'rel.apps',
      {
        title: relAccess.actionText(key, 'title'),
        description: relAccess.actionText(key, 'description'),
        groupTitle: relAccess.businessText('rel.apps', 'title'),
      },
      flags,
    ),
    resource: relAccess.businessResource('rel.apps'),
    names: relAccess.levelActionsOf(key).map((level) => level.name),
  };
}

function kb(key: kbAccess.BusinessKey, flags: Flags = {}): StudioAction {
  return {
    option: option(
      key,
      'kb.knowledge',
      {
        title: kbAccess.actionText(key, 'title'),
        description: kbAccess.actionText(key, 'description'),
        groupTitle: kbAccess.businessText('kb.knowledge', 'title'),
      },
      flags,
    ),
    resource: { type: kbAccess.RESOURCE_TYPE, id: 'kb.knowledge' },
    names: kbAccess.levelActionsOf(key).map((level) => level.name),
  };
}

function agentsEdit(): StudioAction {
  const key = 'agents.agents/edit' as const;
  return {
    option: option(
      key,
      'agents.agents',
      {
        title: agentsAccess.actionText(key, 'title'),
        description: agentsAccess.actionText(key, 'description'),
        groupTitle: agentsAccess.businessText('agents.agents', 'title'),
      },
      { peopleOnly: true },
    ),
    resource: { type: agentsAccess.RESOURCE_TYPE, id: 'agents.agents' },
    names: agentsAccess.levelActionsOf(key).map((level) => level.name),
  };
}

/** The business action `POST /api/git/pullRequests` performs. */
export const OPEN_PR_ACTION = 'studio.git/open-pr';

/**
 * `studio.git/open-pr`: opening an issue's pull request through Studio. Studio's own action, which the authorization
 * plugin does not grant: whoever may edit issues holds it.
 */
function gitOpenPr(flags: Flags): StudioAction {
  return {
    option: option(
      OPEN_PR_ACTION,
      'studio.git',
      {
        title: appText('studioGit.actions.openPr.title'),
        description: appText('studioGit.actions.openPr.description'),
        groupTitle: appText('studioGit.actions.groupTitle'),
      },
      flags,
    ),
    resource: { type: pmAccess.RESOURCE_TYPE, id: 'pm.issues' },
    names: pmAccess.levelActionsOf('pm.issues/edit').map((level) => level.name),
    borrowed: true,
  };
}

/** The business action the projects plugin's plan routes check for a run (`PLANS_USE_ACTION`). */
export const PLANS_USE_ACTION = 'pm.plans/use';

/**
 * `pm.plans/use`: proposing and reading operation plans of the person the agent works for, as an agent in a person's
 * conversation does. The authorization plugin does not grant it either: whoever may view issues holds it, since a plan
 * only proposes and the person executes it with their own permissions.
 */
function plansUse(flags: Flags): StudioAction {
  return {
    option: option(
      PLANS_USE_ACTION,
      'pm.plans',
      {
        title: appText('studioChat.actions.plansUse.title'),
        description: appText('studioChat.actions.plansUse.description'),
        groupTitle: appText('studioChat.actions.groupTitle'),
      },
      flags,
    ),
    resource: { type: pmAccess.RESOURCE_TYPE, id: 'pm.issues' },
    names: pmAccess.levelActionsOf('pm.issues/view').map((level) => level.name),
    borrowed: true,
  };
}

/**
 * Every business action Studio knows, in the order the Capabilities tab lists them (the Studio demo's set, §S2 of the
 * plan). An executing agent starts with what working an issue needs: reading projects and issues, editing and
 * commenting on them, and uploading files. Knowledge's offering action is `propose` in this version.
 */
export const STUDIO_ACTIONS: readonly StudioAction[] = [
  pm('pm.projects', 'view', { defaultOn: true }),
  pm('pm.projects', 'create'),
  pm('pm.projects', 'manage'),
  pm('pm.projects', 'delete', { peopleOnly: true }),
  pm('pm.issues', 'view', { defaultOn: true }),
  pm('pm.issues', 'create'),
  pm('pm.issues', 'edit', { defaultOn: true }),
  pm('pm.issues', 'comment', { defaultOn: true }),
  pm('pm.issues', 'close'),
  pm('pm.issues', 'change-owner'),
  pm('pm.issues', 'delete'),
  pm('pm.issues', 'moderate-comments', { peopleOnly: true }),
  pm('pm.attachments', 'upload', { defaultOn: true }),
  gitOpenPr({ defaultOn: true }),
  plansUse({ defaultOn: true }),
  rel('view'),
  rel('read-logs'),
  rel('deploy'),
  rel('deploy-protected', { peopleOnly: true }),
  kb('kb.knowledge/read', { defaultOn: true }),
  kb('kb.knowledge/propose'),
  agentsEdit(),
];

/** The actions every agent starts with. */
export const DEFAULT_AGENT_ACTIONS: readonly string[] = STUDIO_ACTIONS.filter(
  (action) => action.option.defaultOn === true,
).map((action) => action.option.key);
