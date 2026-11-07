import type { LocaleResource } from '@nocobase/i18n';

// The application's own server-side wording, in the application's namespace: the labels the agents and projects plugins
// show for what the application contributes to them (`server/agents/ids.ts` `appText`), and the comment a run leaves
// on its issue. Use `overrides` to reword a plugin's.
const enUS = {
  studioAgents: {
    scopes: {
      project: 'Project',
    },
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
      GIT_PUBLIC_URL_MISSING:
        'Studio has no public address configured, so GitHub could not call it back.',
      GIT_APP_MANIFEST_EXPIRED:
        'This GitHub App request is unknown, used or expired; start again from Settings → Git.',
      GIT_APP_NOT_FOUND: 'The git connection has no GitHub App.',
      GIT_APP_NOT_INSTALLED: 'The GitHub App of {{name}} is not installed yet.',
      GIT_APP_INSTALLATION_AMBIGUOUS:
        'The GitHub App of {{name}} is installed on several accounts; install it from its link again.',
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
  studioChat: {
    // Where a conversation started (`conversations.sources`).
    sources: {
      askAgent: 'Ask agent',
    },
    // The business action of an agent's Capabilities tab.
    actions: {
      groupTitle: 'Plans',
      plansUse: {
        title: 'Propose plans',
        description:
          'Propose operation plans (new issues, comments, dependencies) that the person reviews and executes in the conversation. Whoever may view issues holds it.',
      },
    },
  },
  studioReleases: {
    actions: {
      groupTitle: 'Previews',
      previewsManage: {
        title: 'Manage pull request previews',
        description:
          'Put up, retry and take down the preview of an issue’s pull request. Whoever may edit issues holds it.',
      },
    },
  },
  studioBuilds: {
    externalDriver: 'Outside Studio',
  },
  studioBudgets: {
    blockedTitle: 'The budget is used up: {{scope}}',
    warnedTitle: 'The budget is nearly used up: {{scope}}',
    usedBody: 'Used {{runs}} runs and {{tokens}} tokens {{period}}.',
    scopeGlobal: 'all of Studio',
    periodDay: 'today',
    periodMonth: 'this month',
    settingsTitle: 'Budgets',
  },
  studioOutbound: {
    decisionTitle: 'Decision on {{identifier}}',
  },
  studioOrgKeys: {
    checksTitle: 'Report checks',
    checksDescription:
      'Lets CI report the checks of a repository whose checks come from it.',
    report: 'Report checks',
    section: 'Studio',
    settingsTitle: 'Organization API keys',
    read: 'View',
    manage: 'Manage',
  },
  studioSetups: {
    issueTitle: 'Initialize project',
    templateIssue:
      'Set this repository up from the NocoBase application template `{{- packageName}}@{{- version}}`, the version Studio itself runs.\n\n1. Check `node -v` ≥ 24 and `pnpm -v` ≥ 11; if either is short, stop and report it without installing anything.\n2. In a temporary directory outside the repository: `pnpm create @nocobase/app {{- name}} --template={{- packageName}}@{{- version}} --no-install`. Do not add `@beta` or change the version.\n3. Move every file of the new application, hidden ones included, to the repository root, keeping `.git`. Delete the `README.md` GitHub created and keep the template’s `README.MD`.\n4. At the repository root: `pnpm install`, `pnpm add @nocobase/db-postgres`, `pnpm nocobase config init --dialect sqlite`, `pnpm nocobase config check`.\n5. Do not commit `config.yml`, `.env` or `storage/`. Write `docs/nguon-goc.md`: the template and its version, the date, the versions of the main `@nocobase/*` packages, and the sentence "Created with create-app, not copied from another application."\n6. Commit this baseline straight to the default branch and push, without force-pushing. Everything after it happens on its own branch.\n7. Do not run whole-repository checks (`pnpm check`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm typecheck`) and do not leave `pnpm dev` running.\n\nReport the Node and pnpm versions, the committed files (`git ls-files`) and the contents of `docs/nguon-goc.md`.',
    managerUnavailable:
      'The project manager is not configured, so this task waits. Configure it, then start the task.',
    deployLater:
      'Deploy settings are not applied yet: connect the App from the releases of the project.',
  },
  studioReports: {
    actions: {
      groupTitle: 'Reports',
      read: {
        title: 'Read reports',
        description:
          'Read delivery, cost and acceptance figures for the person who woke the agent.',
      },
    },
    metricsMessage:
      'Metrics {{from}} to {{to}}\nAdoption: {{activeDays}} active days in {{activeWeeks}} weeks, {{activeMembers}} people, {{issuesCreated}} issues and {{commentsCreated}} comments created.\nDelivered: {{deliveredTotal}} issues, {{deliveredByAgent}} by agents (AI share {{share}}).\nReview: {{passed}} passed, {{reworked}} sent back.\nRuns: {{runs}} started, {{completedRuns}} completed, {{failedRuns}} failed, {{lostRuns}} lost; median wait {{wait}}, median run {{duration}}.\nTokens: {{inputTokens}} input and {{outputTokens}} output.\nDecisions: {{asked}} asked, {{decided}} decided (median {{resolve}}), {{open}} open.',
    usageMessage:
      'Usage {{from}} to {{to}} by {{groupBy}}: {{runs}} runs, {{inputTokens}} input and {{outputTokens}} output tokens.',
    weekly: {
      title: 'Weekly report {{from}} to {{to}}',
      body: '### Weekly report {{from}} to {{to}}\n\n- **Issues completed**: {{completed}} (the week before: {{completedBefore}})\n- **Median cycle time**: {{cycle}}\n- **Completed by agents**: {{share}}\n- **Tokens per issue**: {{tokens}}\n- **Run success rate**: {{success}} of {{runs}} runs\n- **Needs attention**: {{blocked}} blocked, {{overdue}} overdue, {{reviews}} waiting for review, {{failed}} failed runs',
    },
  },
  studioReviews: {
    actions: {
      groupTitle: 'Reviews',
      submit: {
        title: 'Submit review',
        description:
          'Submit a structured pull request review with verdicts, checklist items, and findings in read-only mode.',
      },
    },
  },
  studioAutopilot: {
    actions: {
      groupTitle: 'Autopilot',
      manage: {
        title: 'Manage autopilot',
        description: 'Configure and operate autopilot settings for projects.',
      },
    },
  },
};

export type AppServerResource = LocaleResource<typeof enUS>;

export default enUS;
