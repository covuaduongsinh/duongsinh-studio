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
};

export type AppServerResource = LocaleResource<typeof enUS>;

export default enUS;
