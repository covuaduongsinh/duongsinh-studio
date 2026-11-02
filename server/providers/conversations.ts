import type { Application } from '@nocobase/app-server/application';
import type { AuthEnv } from '@nocobase/app-plugin-authentication';
import { agentSessionsToken } from '@nocobase/app-plugin-agent-sessions/server/tokens';
import {
  agentsToken,
  runIdentityOf,
  type ConversationService,
} from '@nocobase/app-plugin-agents/server/tokens';
import {
  projectsAccessToken,
  projectsIssueSessionToken,
  projectsPlanHooksToken,
  projectsPlanSourceToken,
  projectsToken,
  type Viewer,
} from '@nocobase/app-plugin-projects/server/tokens';
import type { PlanDecided } from '@nocobase/app-plugin-projects/shared/plans';
import { ServiceProvider } from '@nocobase/service-provider';
import type { Context } from 'hono';
import {
  CONVERSATION_SOURCES,
  ISSUE_KIND,
  PROJECT_KIND,
  conversationOfPlan,
  createConversationRules,
  createIssueContextResolver,
  createIssueLinkResolver,
  createIssueSessionIntegration,
  createProjectContextResolver,
  createSessionProjects,
  planDecidedNews,
  planSourceOf,
  sessionInstructions,
  type StudioReadDeps,
} from '../conversations/studio-conversations.js';
import { userIdentity } from './projects-access.js';

/** The CLI agents and sessions name in their instructions (`package.json` `nocobase.cli.bin`). */
const CLI = 'ds-studio';

type AgentsTx = Parameters<ConversationService['deliver']>[0];
type AgentsEvent = Parameters<AgentsTx['emit']>[0];

/**
 * Sessions & Ask agent (S4, `server/conversations/studio-conversations.ts`): where conversations with runner agents
 * start and what a page pins resolves to, the rules their runs read, the plans their agents propose and what the
 * conversation hears once the person decides them; and, for sessions on a person's own computer (agent-sessions),
 * the issues and projects they work for.
 */
export default class ConversationsProvider extends ServiceProvider<Application> {
  readonly name = 'app/conversations';
  private readonly releases: (() => void)[] = [];

  private reads(): StudioReadDeps {
    const { container } = this.app;
    return {
      projects: () => container.resolve(projectsToken),
      viewerOf: async (userId): Promise<Viewer | null> => {
        if (!container.has(projectsAccessToken)) return null;
        return {
          userId,
          actor: { type: 'user', id: userId },
          permissions: await container
            .resolve(projectsAccessToken)
            .permissionsOf(userIdentity(userId)),
        };
      },
    };
  }

  override register(): void {
    const { container } = this.app;
    // A run in a person's conversation proposes its plans as that conversation; a run on an issue proposes none.
    container.singleton(
      projectsPlanSourceToken,
      () => (context) =>
        Promise.resolve(
          planSourceOf(
            runIdentityOf((context as Context<AuthEnv>).get('auth'))?.run?.run ??
              null,
          ),
        ),
    );
    container.singleton(projectsPlanHooksToken, () => ({
      onPlanDecided: (tx, decided) => this.planDecided(tx, decided),
    }));
    container.singleton(projectsIssueSessionToken, () =>
      createIssueSessionIntegration({
        creationContext: (userId, sessionId) =>
          container
            .resolve(agentSessionsToken)
            .creationContext(userId, sessionId),
        link: (sessionId, issueId) =>
          container
            .resolve(agentSessionsToken)
            .link(sessionId, ISSUE_KIND, issueId),
      }),
    );
  }

  /**
   * Tells the conversation a plan came from how the person decided it, in the transaction that recorded the decision:
   * the agents plugin joins it (its unit of work runs on the same connection) and its events are announced once that
   * transaction has had the chance to commit. A rehearsal tells nothing.
   */
  private async planDecided(
    tx: { readonly conn: AgentsTx['conn']; readonly rehearsal?: boolean },
    decided: PlanDecided,
  ): Promise<void> {
    const { container } = this.app;
    const conversationId = conversationOfPlan(decided.source);
    if (tx.rehearsal || !conversationId || !container.has(agentsToken)) return;
    const agents = container.resolve(agentsToken);
    const pending: AgentsEvent[] = [];
    try {
      await agents.conversations.deliver(
        { conn: tx.conn, emit: (event) => pending.push(event) },
        conversationId,
        planDecidedNews(decided),
      );
    } catch (error) {
      // The decision stands whatever the conversation hears: a conversation deleted meanwhile is no reason to undo it.
      console.error(
        `Could not tell conversation ${conversationId} about plan ${decided.planId}.`,
        error,
      );
      return;
    }
    setTimeout(() => {
      for (const event of pending) agents.events.emit(event);
    }, 0);
  }

  override async boot(): Promise<void> {
    const { container } = this.app;
    const reads = this.reads();
    if (container.has(agentsToken) && container.has(projectsToken)) {
      const conversations = container.resolve(agentsToken).conversations;
      for (const source of CONVERSATION_SOURCES)
        if (!conversations.sources.has(source.key))
          this.releases.push(conversations.sources.register(source));
      this.releases.push(
        conversations.contextKinds.register(
          ISSUE_KIND,
          createIssueContextResolver(reads),
        ),
        conversations.contextKinds.register(
          PROJECT_KIND,
          createProjectContextResolver(reads),
        ),
        conversations.rules.provide(createConversationRules()),
      );
    }
    if (container.has(agentSessionsToken) && container.has(projectsToken)) {
      const sessions = container.resolve(agentSessionsToken);
      sessions.registerLinkKind(ISSUE_KIND, createIssueLinkResolver(reads));
      sessions.registerProjects(createSessionProjects(reads));
      sessions.registerInstructions(sessionInstructions(CLI));
    }
  }

  override async shutdown(): Promise<void> {
    for (const release of this.releases.splice(0)) release();
  }
}
