import type { Application } from '@nocobase/app-server/application';
import { authorizationToken } from '@nocobase/app-plugin-authorization';
import {
  agentsAccessToken,
  type AgentsAccess,
} from '@nocobase/app-plugin-agents/server/tokens';
import {
  RESOURCE_TYPE,
  levelActionsOf,
  type Scope,
} from '@nocobase/app-plugin-agents/shared/access';
import { ServiceProvider } from '@nocobase/service-provider';

/**
 * Tells the agents plugin how far each person's business actions reach (today only `agents.agents/edit`: the skills
 * they created, or every one), read from the same permission sets as the Studio roles (`server/access/roles.ts`).
 * Unbound, every level would be `none`.
 */
export default class AgentsAccessProvider extends ServiceProvider<Application> {
  readonly name = 'app/agents-access';

  override register(): void {
    this.app.container.singleton(agentsAccessToken, (): AgentsAccess => {
      const authz = () => this.app.container.resolve(authorizationToken);
      return {
        scopeOf: async (identity, key): Promise<Scope> => {
          const context = authz().for(identity);
          if ((await context.snapshot()).unrestricted) return 'all';
          const business = key.slice(0, key.lastIndexOf('/'));
          for (const { level, name } of [...levelActionsOf(key)].reverse()) {
            const held = await context.can({
              resource: { type: RESOURCE_TYPE, id: business },
              action: name,
            });
            if (held)
              return level === 'all'
                ? 'all'
                : { users: [identity.principal.id] };
          }
          return 'none';
        },
      };
    });
  }
}
