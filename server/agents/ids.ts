import { APP_NS } from '@nocobase/i18n';

/** The subject kind runs on an issue carry (`agentsToken.subjects`). */
export const ISSUE_SUBJECT = 'issue';
/** The projects plugin's principal kind for agents: an issue's executor, someone mentioned, someone who moves issues. */
export const AGENT_KIND = 'agent';
/** The application's own agent that coordinates every issue it executes; new issues get it as their executor. */
export const PROJECT_MANAGER_ID = 'ds-project-manager';
/** Skills and variables kept for one project. */
export const PROJECT_SCOPE = 'project';
/** An issue's branch is this prefix and its identifier (`agent/PM-9`): runs check it out, pull requests come from it. */
export const ISSUE_BRANCH_PREFIX = 'agent/';
/** The application message a run's closing comment carries (`projects.comments.post` `message.type`). */
export const RUN_FINISHED_MESSAGE = 'ds.run.finished';

/** Text the agents and projects plugins show in the reader's language: a key of the application's own locale files. */
export function appText(key: string): {
  readonly key: string;
  readonly ns: string;
} {
  return { key, ns: APP_NS };
}
