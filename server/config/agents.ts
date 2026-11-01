import {
  defineAppConfig,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import type { AgentsConfig } from '@nocobase/app-plugin-agents/server/tokens';

// The agents plugin ships no config factory, so the application declares its `agents` section here. Runs install and
// call this application's own CLI (`nocobase.cli.bin` in package.json), and runners name the application after it.
const agents: AppConfigFactory<AgentsConfig> = defineAppConfig(() => ({
  cli: { name: 'ds-studio' },
  app: { id: 'duongsinh-studio', name: 'Dương Sinh Studio' },
}));

export default agents;
