import type { Application } from '@nocobase/app-server/application';
import {
  agentsToken,
  type Agents,
} from '@nocobase/app-plugin-agents/server/tokens';
import { ServiceProvider } from '@nocobase/service-provider';
import { AGENT_DEFAULT_INSTRUCTIONS } from '../agents/agent-instructions.js';
import { PROJECT_MANAGER_ID, appText } from '../agents/ids.js';
import { PROJECT_MANAGER_PRINCIPLES } from '../agents/project-manager-principles.js';

/** The business actions every agent starts with: those the application offers as on by default. */
function defaultActions(agents: Agents): string[] {
  return agents.actions
    .list()
    .filter((action) => action.defaultOn === true && action.grantable !== false)
    .map((action) => action.key);
}

/**
 * The project manager (`ds-project-manager`, the application's own agent and every new issue's default executor) and
 * the instructions every agent discovered from runners gets.
 *
 * The project manager runs on a runner with the tool and model of the agent people pick as its first choice. That
 * setting does not exist yet, so it is created with no tool and model: it exists, is enabled and is offered as an
 * executor, but takes no work (`findWorkable` is null) until its entries are set. Its existing entries are kept on
 * every boot so that whatever sets them later is not undone here.
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
      actions: defaultActions(agents),
    }));
    // Command hosts (`pnpm nocobase …`, which log to stderr) also boot providers, possibly before the agents tables
    // exist; only the serving process writes the agents, as the agents plugin does for its own startup work.
    if (this.app.consoleLogStream === 'stderr') return;
    const existing = await agents.agents.find(
      agents.tx.read(),
      PROJECT_MANAGER_ID,
    );
    await agents.agents.ensureSystem({
      id: PROJECT_MANAGER_ID,
      name: 'Project manager',
      nameText: appText('studioAgents.projectManager.name'),
      description:
        'Điều phối issue: chọn agent cho từng bước, giao việc bằng comment và chuẩn bị bàn giao để nghiệm thu.',
      instructions: PROJECT_MANAGER_PRINCIPLES,
      actions: defaultActions(agents),
      modelEntries: existing?.modelEntries ?? [],
    });
    await agents.agents.applyDefaults();
  }

  override async shutdown(): Promise<void> {
    this.release?.();
    this.release = undefined;
  }
}
