import type {
  ConversationNews,
  ConversationRuleLines,
  ConversationRules,
  ConversationSourceKind,
  PageContextResolver,
  ResolvedRef,
} from '@nocobase/app-plugin-agents/server/tokens';
import { CONVERSATION_SUBJECT } from '@nocobase/app-plugin-agents/shared/conversations';
import type {
  AgentSessionsService,
  LinkResolver,
  LinkView,
} from '@nocobase/app-plugin-agent-sessions/server';
import type {
  IssueSessionIntegration,
  Projects,
  Viewer,
} from '@nocobase/app-plugin-projects/server/tokens';
import type {
  IssueDetail,
  IssueListItem,
  StatusDefinition,
} from '@nocobase/app-plugin-projects/shared/issues';
import type {
  PlanDecided,
  PlanSource,
} from '@nocobase/app-plugin-projects/shared/plans';
import { appText } from '../agents/ids.js';

/** The person a session's resolver reads for (not exported by the plugin under a name of its own). */
type SessionViewer = Parameters<LinkResolver['resolve']>[1];
type ProjectSource = Parameters<AgentSessionsService['registerProjects']>[0];

/**
 * Sessions & Ask agent (S4): what Dương Sinh Studio adds to the agents plugin's conversations (where they start, what a
 * page's context resolves to, the rules of their runs, the plans their agents propose) and to the agent-sessions plugin
 * (the issues and projects a session on a person's own computer works for). Every function here is plain and testable;
 * `server/providers/conversations.ts` wires them in.
 */

/** The source the "Ask agent" button of the agents plugin's chat block starts conversations with (`launchers.tsx`). */
export const ASK_AGENT_SOURCE = 'askAgent';
/** The page context kinds Studio's pages pin: the issue and the project they show. */
export const ISSUE_KIND = 'issue';
export const PROJECT_KIND = 'project';
/** A plan an agent proposed in a conversation (`PlanSource.kind`), keyed so a newer plan replaces the open one. */
export const CONVERSATION_PLAN = 'conversation';
/** The news a conversation hears when its plan is decided (`ConversationNotice` `code: 'news'`, `type`). */
export const PLAN_DECIDED_NEWS = 'ds.plan.decided';

export const CONVERSATION_SOURCES: readonly ConversationSourceKind[] = [
  { key: ASK_AGENT_SOURCE, title: appText('studioChat.sources.askAgent') },
];

/**
 * The rules every conversation run of Studio reads in its system layer (`conversations.rules.provide`), in English as
 * the plugin's own rules are, with the language they answer in spelled out.
 */
export function conversationRuleLines(cli: string): ConversationRuleLines {
  return {
    rules: [
      'Answer in Vietnamese, the language of Công ty CP Cờ vua Dương Sinh, unless the person writes in another language; keep code, commands and identifiers as they are.',
      'Never connect to, run scripts against or change the production NocoBase 2 at https://nocobase.dsc.edu.vn (or dokploy.dsc.edu.vn): it holds real students’, parents’ and fees data. Work only on development copies.',
      'Never print, copy or ask for secrets (tokens, keys, passwords, *.secret files) or personal data of students and parents; say what is missing instead.',
      `Read before answering: an issue with \`${cli} issue get <ID>\`, its pull requests with \`${cli} pr list\`, the knowledge base with \`${cli} kb search\` / \`${cli} kb read\`, the project memory with \`${cli} memory list\` / \`${cli} memory read\`. Cite what you used: the issue identifier, the knowledge document id, the memory file.`,
      'This conversation is read-only by default: do not edit code, push, merge, comment on issues or change their status. When the person asks for work to be created or changed (new issues, sub-issues, comments, a project), propose one operation plan with the plan commands; the person reviews and executes it in the conversation. Never write issues directly.',
      'Ask one short question when the request is ambiguous, then stop.',
    ],
  };
}

export function createConversationRules(): ConversationRules {
  return (_conn, context) => Promise.resolve(conversationRuleLines(context.cli));
}

/** What Studio reads to resolve the issues and projects people pin, as the person may see them. */
export interface StudioReadDeps {
  readonly projects: () => Projects;
  /** The person as the projects plugin authorizes them; null when they cannot be (no permissions source). */
  readonly viewerOf: (userId: string) => Promise<Viewer | null>;
}

const issueUrl = (identifier: string) => `/issues/${encodeURIComponent(identifier)}`;
const projectUrl = (id: string) => `/projects/${encodeURIComponent(id)}`;

/**
 * The issues a person pins to a conversation (`conversations.contextKinds.register('issue')`): those they may see, by
 * id or identifier. Read outside a transaction (the agents plugin resolves page context on its own read connection),
 * so the person's permissions are read through the projects plugin.
 */
export function createIssueContextResolver(
  deps: StudioReadDeps,
): PageContextResolver {
  return async (_conn, userId, ids) => {
    const found = new Map<string, ResolvedRef>();
    if (ids.length === 0) return found;
    const viewer = await deps.viewerOf(userId);
    if (!viewer) return found;
    const summaries = await deps.projects().issueQueries.summaries(viewer, ids);
    for (const id of ids) {
      const issue = summaries.find(
        (candidate) => candidate.id === id || candidate.identifier === id,
      );
      if (issue)
        found.set(id, {
          title: issue.title,
          key: issue.identifier,
          url: issueUrl(issue.identifier),
        });
    }
    return found;
  };
}

/** The projects a person pins (`conversations.contextKinds.register('project')`): those they may see. */
export function createProjectContextResolver(
  deps: StudioReadDeps,
): PageContextResolver {
  return async (_conn, userId, ids) => {
    const found = new Map<string, ResolvedRef>();
    if (ids.length === 0) return found;
    const viewer = await deps.viewerOf(userId);
    if (!viewer) return found;
    const visible = await deps.projects().projects.list(viewer);
    for (const id of ids) {
      const project = visible.find((candidate) => candidate.id === id);
      if (project)
        found.set(id, {
          title: project.name,
          key: null,
          url: projectUrl(project.id),
        });
    }
    return found;
  };
}

/**
 * Where a run's plan comes from (`projectsPlanSourceToken`): an agent in a person's conversation proposes as that
 * conversation, keyed so its newer plan voids the open one; an agent working on an issue proposes none (its changes go
 * through the issue's own flow).
 */
export function planSourceOf(
  run: {
    readonly id: string;
    readonly subjectKind: string;
    readonly subjectId: string;
  } | null,
): PlanSource | null {
  if (!run || run.subjectKind !== CONVERSATION_SUBJECT) return null;
  return {
    kind: CONVERSATION_PLAN,
    key: `${CONVERSATION_PLAN}:${run.subjectId}`,
    data: { conversationId: run.subjectId, runId: run.id },
  };
}

/** The conversation a plan came from, when it came from one. */
export function conversationOfPlan(source: PlanSource): string | null {
  if (source.kind !== CONVERSATION_PLAN) return null;
  const data = source.data;
  if (typeof data === 'object' && data !== null && 'conversationId' in data) {
    const id = (data as { conversationId?: unknown }).conversationId;
    if (typeof id === 'string' && id) return id;
  }
  const key = source.key ?? '';
  return key.startsWith(`${CONVERSATION_PLAN}:`)
    ? key.slice(CONVERSATION_PLAN.length + 1) || null
    : null;
}

const OUTCOME_WORDS: Readonly<Record<PlanDecided['outcome'], string>> = {
  executed: 'executed',
  failed: 'failed',
  stale: 'went stale (something it changes moved since it was checked)',
  voided: 'was voided',
  undone: 'was undone',
};

/**
 * What a conversation hears when the person decides its agent's plan (`conversations.deliver`): a news line for the
 * person, and for the agent (woken, except for a voided plan, which wakes nobody) what came of each row, so it can
 * tell the person and continue.
 */
export function planDecidedNews(decided: PlanDecided): ConversationNews {
  const created = decided.rows
    .map((row) => row.created)
    .filter((ref): ref is NonNullable<typeof ref> => ref !== null)
    .map((ref) => JSON.stringify(ref));
  const failedRows = decided.rows.filter((row) => !row.ok).length;
  const title = `Plan "${decided.title}" ${OUTCOME_WORDS[decided.outcome]}`;
  const lines = [
    `${title} (plan ${decided.planId}).`,
    ...(created.length > 0 ? [`Created: ${created.join(', ')}.`] : []),
    ...(failedRows > 0 ? [`${failedRows} row(s) failed.`] : []),
    ...(decided.failure ? [`Failure: ${JSON.stringify(decided.failure)}.`] : []),
    'Tell the person briefly what changed (in Vietnamese), then stop.',
  ];
  const wake = decided.outcome !== 'voided';
  return {
    notice: {
      code: 'news',
      type: PLAN_DECIDED_NEWS,
      title,
      params: {
        planId: decided.planId,
        outcome: decided.outcome,
        title: decided.title,
      },
    },
    ...(wake
      ? {
          input: {
            type: 'signal' as const,
            actor: { kind: 'system' as const, id: 'studio', name: 'Dương Sinh Studio' },
            text: lines.join('\n'),
          },
          wake: true,
        }
      : {}),
  };
}

// Sessions on a person's own computer (agent-sessions).

type StatusView = NonNullable<LinkView['status']>;

/** How an issue stands in a session's bar, in Vietnamese, the application's language. */
export function issueStatusView(
  issue: Pick<IssueListItem, 'statusKey' | 'ownerUserId'>,
  statuses: readonly StatusDefinition[],
  viewerId: string,
): StatusView {
  const definition = statuses.find((status) => status.key === issue.statusKey);
  const label = definition?.name ?? issue.statusKey;
  switch (issue.statusKey) {
    case 'blocked':
      return { label, tone: 'attention', icon: 'blocked', needsYou: null };
    case 'in_review':
      return issue.ownerUserId === viewerId
        ? {
            label,
            tone: 'attention',
            icon: 'review',
            needsYou: 'Chờ bạn nghiệm thu',
          }
        : { label, tone: 'active', icon: 'review', needsYou: null };
    case 'done':
      return { label, tone: 'done', icon: 'done', needsYou: null };
    case 'cancelled':
      return { label, tone: 'done', icon: 'closed', needsYou: null };
    default:
      return definition?.category === 'started'
        ? { label, tone: 'active', icon: 'started', needsYou: null }
        : { label, tone: 'idle', icon: 'backlog', needsYou: null };
  }
}

function issueLinkView(
  issue: IssueListItem,
  statuses: readonly StatusDefinition[],
  viewerId: string,
): LinkView {
  return {
    key: issue.identifier,
    title: issue.title,
    group: issue.project?.name ?? null,
    status: issueStatusView(issue, statuses, viewerId),
    href: issueUrl(issue.identifier),
    startable: false,
  };
}

/** What an issue's progress says to a session's agent (`session work`, `issue get` from a session). */
export function issueProgress(issue: IssueListItem): Record<string, unknown> {
  return {
    status: issue.statusKey,
    executor: issue.executorName,
    owner: issue.owner?.name ?? null,
    project: issue.project?.name ?? null,
    blockedBy: issue.blockedCount,
    subIssues: issue.subtaskCount,
  };
}

const sessionViewer =
  (deps: StudioReadDeps) =>
  (viewer: SessionViewer): Promise<Viewer | null> =>
    deps.viewerOf(viewer.userId);

/**
 * The issues a session works for (`agentSessions.registerLinkKind('issue')`): what the person may see of them, and the
 * ones they may mention with `#`. Work is started in Studio, not from a session (`startable: false`).
 */
export function createIssueLinkResolver(deps: StudioReadDeps): LinkResolver {
  const viewerOf = sessionViewer(deps);
  const items = async (viewer: Viewer, ids: readonly string[]) =>
    ids.length === 0
      ? []
      : (
          await deps
            .projects()
            .issueQueries.page(viewer, { issueIds: ids, limit: ids.length })
        ).data;
  return {
    async resolve(refIds, sessionViewerOf) {
      const found = new Map<string, LinkView>();
      const viewer = await viewerOf(sessionViewerOf);
      if (!viewer) return found;
      const statuses = deps.projects().issueQueries.statuses();
      for (const issue of await items(viewer, refIds))
        found.set(issue.id, issueLinkView(issue, statuses, viewer.userId));
      return found;
    },
    async progress(refIds, sessionViewerOf) {
      const found = new Map<string, unknown>();
      const viewer = await viewerOf(sessionViewerOf);
      if (!viewer) return found;
      for (const issue of await items(viewer, refIds))
        found.set(issue.id, issueProgress(issue));
      return found;
    },
    async search(query, sessionViewerOf, { projectId, limit }) {
      const viewer = await viewerOf(sessionViewerOf);
      if (!viewer || !query.trim()) return [];
      const statuses = deps.projects().issueQueries.statuses();
      const page = await deps.projects().issueQueries.page(viewer, {
        q: query.trim(),
        limit,
        ...(projectId ? { projectId } : {}),
      });
      return page.data.map((issue) => ({
        refId: issue.id,
        ...issueLinkView(issue, statuses, viewer.userId),
      }));
    },
  };
}

/** The projects a session may work for (`agentSessions.registerProjects`): those the person sees. */
export function createSessionProjects(deps: StudioReadDeps): ProjectSource {
  const viewerOf = sessionViewer(deps);
  return {
    async list(sessionViewerOf) {
      const viewer = await viewerOf(sessionViewerOf);
      if (!viewer) return [];
      return (await deps.projects().projects.list(viewer)).map((project) => ({
        id: project.id,
        name: project.name,
      }));
    },
  };
}

/**
 * How agents in sessions on a person's computer work with Studio (`agentSessions.registerInstructions`), in English
 * as the plugin asks.
 */
export function sessionInstructions(cli: string): string {
  return [
    'You work for a person of Dương Sinh Studio on their own computer. Answer in Vietnamese unless they write in another language.',
    'Never connect to or run scripts against the production NocoBase 2 (https://nocobase.dsc.edu.vn); never print secrets or students’/parents’ personal data.',
    `When the person wants work tracked, propose the issues first (title, acceptance criteria, project) and create them only after they agree, with \`${cli} issue create\` in this session, so each is tied to the session; prefer one issue per deliverable and sub-issues for steps.`,
    `Read issues with \`${cli} issue get\`, knowledge with \`${cli} kb search\`, project memory with \`${cli} memory list\`; cite what you used.`,
    'Do not move issues between statuses or merge pull requests: Studio’s project manager and the person do that.',
  ].join('\n');
}

/**
 * Issues created from a session (`projectsIssueSessionToken`): the session's project by default, and the new issue tied
 * to the session; an issue read from a session or the CLI carries its progress.
 */
export function createIssueSessionIntegration(deps: {
  readonly creationContext: (
    userId: string,
    sessionId: string,
  ) => Promise<{ readonly projectId: string | null }>;
  readonly link: (sessionId: string, issueId: string) => Promise<void>;
}): IssueSessionIntegration {
  return {
    async creationContext(viewer, sessionId) {
      const { projectId } = await deps.creationContext(viewer.userId, sessionId);
      return {
        projectId,
        link: (issueId: string) => deps.link(sessionId, issueId),
      };
    },
    progress(_viewer, issue: IssueDetail) {
      return Promise.resolve(issueProgress(issue));
    },
  };
}
