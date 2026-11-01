import type { Application } from '@nocobase/app-server/application';
import { type AuthEnv } from '@nocobase/app-plugin-authentication';
import { authorizationToken } from '@nocobase/app-plugin-authorization';
import type { Context } from 'hono';
import {
  agentsToken,
  runIdentityOf,
  type ActionGate,
  type CallerIdentity,
} from '@nocobase/app-plugin-agents/server/tokens';
import type {
  AuthorizationContext,
  KeyScope,
} from '@nocobase/authorization/core';
import { ServiceProvider } from '@nocobase/service-provider';
import { STUDIO_ACTIONS, type StudioAction } from '../agents/actions.js';
import { userIdentity } from './projects-access.js';

async function holds(
  context: AuthorizationContext,
  action: StudioAction,
): Promise<boolean> {
  for (const name of action.names)
    if (await context.can({ resource: action.resource, action: name }))
      return true;
  return false;
}

/** The business actions a person holds now through their permission sets, kept to an API key's scope if they use one. */
export async function personActions(
  context: AuthorizationContext,
): Promise<Set<string>> {
  const snapshot = await context.snapshot();
  const held = new Set<string>();
  for (const action of STUDIO_ACTIONS)
    if (snapshot.unrestricted || (await holds(context, action)))
      held.add(action.option.key);
  return held;
}

/**
 * Who holds which business actions (`agentsToken.gate`): a person their own; a run those its agent is configured with
 * that the person it acts for also holds.
 */
export function createStudioGate(
  contextOf: (userId: string, keyScope?: KeyScope) => AuthorizationContext,
): ActionGate {
  return {
    async allowed(identity: CallerIdentity): Promise<ReadonlySet<string>> {
      const own = await personActions(
        contextOf(identity.userId, identity.keyScope),
      );
      if (identity.kind !== 'run') return own;
      const configured = new Set(identity.agent?.actions ?? []);
      return new Set([...own].filter((action) => configured.has(action)));
    },
  };
}

/**
 * A run's requests as far as the authorization plugin is concerned: the actions its gate allows, as a key scope. A
 * request with a run token otherwise acts with every permission of the person the run acts for; with this scope every
 * check outside the run's actions is denied (`AuthorizationContext.can`), so the projects plugin's permissions shrink
 * to them too.
 */
export function runKeyScope(
  runId: string,
  actions: ReadonlySet<string>,
): KeyScope {
  const permitted = STUDIO_ACTIONS.filter((action) =>
    actions.has(action.option.key),
  );
  return {
    keyId: `run:${runId}`,
    allows: (resource, name) =>
      permitted.some(
        (action) =>
          action.resource.type === resource.type &&
          action.resource.id === resource.id &&
          action.names.includes(name),
      ),
    objects: () => 'all',
    permissions: permitted.map((action) => ({
      resource: action.resource,
      actions: action.names,
    })),
  };
}

/** Offers agents Studio's business actions, says who holds them, and bounds what runs do over the API by the same answer. */
export default class AgentActionsProvider extends ServiceProvider<Application> {
  readonly name = 'app/agent-actions';
  private readonly releases: (() => void)[] = [];

  override async boot(): Promise<void> {
    const { container } = this.app;
    if (!container.has(agentsToken) || !container.has(authorizationToken))
      return;
    const agents = container.resolve(agentsToken);
    const authz = container.resolve(authorizationToken);
    const gate = createStudioGate((userId, keyScope) =>
      authz.for(userIdentity(userId, keyScope)),
    );
    this.releases.push(
      agents.actions.provide(() =>
        STUDIO_ACTIONS.map((action) => action.option),
      ),
      agents.gate.set(gate),
    );
    authz.use(async (request, next) => {
      const run = request.keyScope
        ? undefined
        : runIdentityOf((request.http as Context<AuthEnv>).get('auth'));
      if (run?.run)
        request.keyScope = runKeyScope(
          run.run.run.id,
          await agents.gate.allowed(run),
        );
      await next();
    });
  }

  override async shutdown(): Promise<void> {
    for (const release of this.releases.splice(0)) release();
  }
}
