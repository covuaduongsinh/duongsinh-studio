import type { LocaleResource } from '@nocobase/i18n';

// The application's own server-side wording, in the application's namespace: the labels the agents and projects plugins
// show for what the application contributes to them (`server/agents/ids.ts` `appText`), and the comment a run leaves
// on its issue. Use `overrides` to reword a plugin's.
const enUS = {
  studioAgents: {
    subjects: {
      issue: 'Issue',
    },
    triggers: {
      statusChange: 'Issue started',
      assigned: 'Assigned',
      comment: 'Comment',
      mention: 'Mention',
      unblocked: 'Unblocked',
    },
    kinds: {
      agent: 'Agent',
    },
    projectManager: {
      name: 'Project manager',
    },
    actions: {
      peopleOnly: 'Only people do this; it is never given to an agent.',
    },
    runFinished: {
      completed: 'Run {{runId}} finished.',
      failed: 'Run {{runId}} failed ({{reason}}).',
      cancelled: 'Run {{runId}} was stopped.',
    },
  },
  studioGit: {
    // The `ds.pr.merged` / `ds.pr.closed` comment messages, for a page that words them in the reader's language.
    comments: {
      merged: 'Pull request {{repo}}#{{number}} was merged.',
      closed: 'Pull request {{repo}}#{{number}} was closed without merging.',
    },
    errors: {
      GIT_CONNECTION_NOT_FOUND: 'The git connection does not exist.',
      GIT_CONNECTION_NO_TOKEN: 'The git connection has no token.',
      GIT_CONNECTION_IN_USE:
        'The git connection still links repositories; remove them first.',
      GIT_TOKEN_REJECTED: 'GitHub refused the token.',
      GIT_REPOSITORY_UNREACHABLE:
        'The connection’s token cannot reach the repository {{repo}}.',
      GIT_REPOSITORY_READ_ONLY:
        'The connection’s token may not push to {{repo}}.',
      GIT_REPOSITORY_LINKED: 'The repository {{repo}} is linked already.',
      GIT_REPOSITORY_ATTACHED:
        'The repository {{repo}} serves this project already.',
      GIT_REPOSITORY_NOT_FOUND: 'The repository is not linked.',
      GIT_HOST_UNAVAILABLE: 'GitHub cannot be reached now; try again later.',
      SECRETS_NOT_CONFIGURED:
        'The secrets keys are not configured, so the token cannot be kept.',
      PROJECTS_UNAVAILABLE: 'Projects are not available.',
      PULL_REQUEST_NOT_FOUND: 'The pull request does not exist.',
      MERGE_BLOCKED: 'The pull request cannot be merged yet ({{blocker}}).',
      MERGE_REFUSED_BY_HOST: 'GitHub refused to merge the pull request.',
      ISSUE_HAS_NO_REPOSITORY:
        'The issue {{issue}} has no repository: add one to its project first.',
      GIT_REPOSITORY_NOT_IN_PROJECT:
        'That repository does not serve the project of {{issue}}.',
      PULL_REQUEST_REFUSED_BY_HOST:
        'GitHub refused to open a pull request from {{head}}: push the branch with at least one commit first.',
    },
    // The business action of an agent's Capabilities tab.
    actions: {
      groupTitle: 'Code hosting',
      openPr: {
        title: 'Open pull requests',
        description:
          'Open the pull request of an issue’s branch through Studio. Whoever may edit issues holds it.',
      },
    },
  },
};

export type AppServerResource = LocaleResource<typeof enUS>;

export default enUS;
