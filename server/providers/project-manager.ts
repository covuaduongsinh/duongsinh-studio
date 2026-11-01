import type { Application } from '@nocobase/app-server/application';
import {
  agentsToken,
  type Agents,
} from '@nocobase/app-plugin-agents/server/tokens';
import type { Agent } from '@nocobase/app-plugin-agents/shared/agents';
import { databaseManagerToken } from '@nocobase/db';
import { ServiceProvider } from '@nocobase/service-provider';
import { DEFAULT_AGENT_ACTIONS } from '../agents/actions.js';
import { AGENT_DEFAULT_INSTRUCTIONS } from '../agents/agent-instructions.js';
import { PROJECT_MANAGER_ID, appText } from '../agents/ids.js';
import { PROJECT_MANAGER_PRINCIPLES } from '../agents/project-manager-principles.js';
import {
  readProjectManagerSettings,
  type ProjectManagerSettings,
} from '../agents/project-manager-settings.js';

/** The most entries an agent's list holds (`MAX_MODEL_ENTRIES` of the agents plugin). */
const MAX_MODEL_ENTRIES = 20;

/**
 * Keeps the project manager (`ds-project-manager`) as its settings say: their name, description and principles, and
 * the tools and models of the first-choice agent then of the fallback, in that order. Without a first choice it has no
 * tool and model: it exists, is enabled and is every new issue's default executor, but takes no work.
 */
export async function syncProjectManager(
  agents: Agents,
  settings: ProjectManagerSettings,
): Promise<Agent> {
  const conn = agents.tx.read();
  const entries: Agent['modelEntries'][number][] = [];
  for (const id of [settings.firstChoiceAgentId, settings.fallbackAgentId]) {
    if (!id) continue;
    const agent = await agents.agents.find(conn, id);
    for (const entry of agent?.modelEntries ?? [])
      if (
        !entries.some(
          (kept) => kept.tool === entry.tool && kept.model === entry.model,
        )
      )
        entries.push(entry);
  }
  return agents.agents.ensureSystem({
    id: PROJECT_MANAGER_ID,
    name: settings.name,
    nameText: appText('studioAgents.projectManager.name'),
    description: settings.description,
    instructions: settings.principles ?? PROJECT_MANAGER_PRINCIPLES,
    actions: [...DEFAULT_AGENT_ACTIONS],
    modelEntries: entries.slice(0, MAX_MODEL_ENTRIES),
  });
}

/**
 * The project manager and the instructions and business actions every agent discovered from runners gets
 * (`agents.setDefaults`, written to existing agents by `applyDefaults`).
 */
export default class ProjectManagerProvider extends ServiceProvider<Application> {
  readonly name = 'app/project-manager';
  private release?: () => void;

  override async boot(): Promise<void> {
    const { container } = this.app;
    if (!container.has(agentsToken)) return;
    const agents = container.resolve(agentsToken);
    this.release = agents.agents.setDefaults(() => ({
      instructions: AGENT_DEFAULT_INSTRUCTIONS,
      actions: [...DEFAULT_AGENT_ACTIONS],
    }));
    // Command hosts (`pnpm nocobase …`, which log to stderr) also boot providers, possibly before the tables exist; only
    // the serving process writes the agents, as the agents plugin does for its own startup work.
    if (this.app.consoleLogStream === 'stderr') return;
    await syncProjectManager(
      agents,
      await readProjectManagerSettings(
        container.resolve(databaseManagerToken).connection(),
      ),
    );
    await agents.agents.applyDefaults();
  }

  override async shutdown(): Promise<void> {
    this.release?.();
    this.release = undefined;
  }
}
