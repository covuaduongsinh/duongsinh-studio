import type {
  KnowledgeAccessResolver,
  KnowledgeReader,
} from '@nocobase/app-plugin-knowledge/server/tokens';
import type {
  KnowledgeAccess,
  SpaceRef,
} from '@nocobase/app-plugin-knowledge/shared/knowledge';

/**
 * Dương Sinh Studio's knowledge spaces, as the Studio demo names them: one system space (`system`, key empty) every
 * signed-in person relates to, and one space per project (`project`, the project's id) that inherits it.
 */
export const SYSTEM_SCOPE = 'system';
export const PROJECT_SCOPE = 'project';
export const SYSTEM_SPACE: SpaceRef = { scope: SYSTEM_SCOPE, scopeId: '' };
export const SYSTEM_TITLE = 'Dương Sinh';

/** The actor kind agent runs read and propose as (the projects plugin's `agent` principal kind). */
export const AGENT_ACTOR = 'agent';

export const KB_ACTIONS = ['read', 'propose', 'edit', 'manage'] as const;
export type KbAction = (typeof KB_ACTIONS)[number];
/** How far a person holds one business action `kb.knowledge/<action>`: the highest level of their roles. */
export type KbLevel = 'all' | 'related' | 'none';

const DENIED: KnowledgeAccess = {
  read: false,
  propose: false,
  edit: false,
  manage: false,
};

/** What the resolver reads; each is asked at most once per reader and request (cached below). */
export interface KnowledgeAccessDeps {
  /** Whether the person's roles are unrestricted (the `owner` role): every space, every level. */
  unrestricted(userId: string): Promise<boolean>;
  /** The level of `kb.knowledge/<action>` the person's roles give. */
  level(userId: string, action: KbAction): Promise<KbLevel>;
  /** Whether the person sees the project (`visible`) and manages it (`manage`, its lead or an administrator); null when it does not exist. */
  project(
    userId: string,
    projectId: string,
  ): Promise<{ readonly visible: boolean; readonly manage: boolean } | null>;
  /** A project's name; null when it does not exist. */
  projectName(projectId: string): Promise<string | null>;
  /** The business actions an agent is configured with; null when the agent does not exist. */
  agentActions(agentId: string): Promise<ReadonlySet<string> | null>;
  /** Display names keyed `kind:id`, for people (`user`) and agents. */
  names(
    refs: readonly { readonly kind: string; readonly id: string }[],
  ): Promise<ReadonlyMap<string, string>>;
}

/** The space in its normal form, or null when Studio has no such space. */
export function normalSpace(space: SpaceRef): SpaceRef | null {
  if (space.scope === SYSTEM_SCOPE) return space.scopeId ? null : SYSTEM_SPACE;
  if (space.scope === PROJECT_SCOPE) {
    const id = space.scopeId.trim();
    return id ? { scope: PROJECT_SCOPE, scopeId: id } : null;
  }
  return null;
}

/**
 * Who may do what in a space:
 *
 * - `all` of an action reaches every space. `related` reaches the system space for reading and proposing only (changing
 *   it takes `all`, which only administrators hold), and a project's space for whoever sees the project (`read`,
 *   `propose`) or manages it (`edit`, `manage`: its lead and administrators), as the knowledge plugin describes the
 *   assembling application's relation (`shared/access.ts` of the plugin).
 * - The owner role (unrestricted) holds everything everywhere.
 * - An agent acting for a person holds the lower of what the person holds and what the agent is configured with
 *   (`kb.knowledge/read`, `kb.knowledge/propose`), never more than `propose`: the plugin enforces that cap as well.
 */
export function createKnowledgeAccess(
  deps: KnowledgeAccessDeps,
): KnowledgeAccessResolver {
  const forReader = (reader: KnowledgeReader) => {
    const memo = new Map<string, Promise<unknown>>();
    const once = <T>(key: string, work: () => Promise<T>): Promise<T> => {
      let pending = memo.get(key) as Promise<T> | undefined;
      if (!pending) {
        pending = work();
        memo.set(key, pending);
      }
      return pending;
    };
    const userId = reader.userId;
    const unrestricted = () =>
      once('unrestricted', () => deps.unrestricted(userId));
    const level = (action: KbAction) =>
      once(`level:${action}`, () => deps.level(userId, action));
    const project = (projectId: string) =>
      once(`project:${projectId}`, () => deps.project(userId, projectId));
    const agent = () =>
      reader.actor && reader.actor.kind === AGENT_ACTOR
        ? once(`agent:${reader.actor.id}`, () =>
            deps.agentActions(reader.actor?.id ?? ''),
          )
        : Promise.resolve(null);

    const personHolds = async (
      space: SpaceRef,
      action: KbAction,
    ): Promise<boolean> => {
      if (await unrestricted()) return true;
      const held = await level(action);
      if (held === 'all') return true;
      if (held !== 'related') return false;
      const reading = action === 'read' || action === 'propose';
      // Everyone relates to the system space as a reader; changing it takes the `all` level (administrators).
      if (space.scope === SYSTEM_SCOPE) return reading;
      const found = await project(space.scopeId);
      if (!found) return false;
      return reading ? found.visible : found.manage;
    };

    return {
      async access(raw: SpaceRef): Promise<KnowledgeAccess> {
        const space = normalSpace(raw);
        if (!space || !userId) return DENIED;
        // A project space exists only while its project does, whoever asks.
        if (
          space.scope === PROJECT_SCOPE &&
          (await deps.projectName(space.scopeId)) === null
        )
          return DENIED;
        let actorActions: ReadonlySet<string> | null = null;
        if (reader.actor) {
          // Agents are the only actors Studio knows; any other kind reads nothing.
          if (reader.actor.kind !== AGENT_ACTOR) return DENIED;
          actorActions = await agent();
          if (!actorActions) return DENIED;
        }
        const allowed = async (action: KbAction): Promise<boolean> => {
          if (actorActions) {
            if (action === 'edit' || action === 'manage') return false;
            if (!actorActions.has(`kb.knowledge/${action}`)) return false;
          }
          return personHolds(space, action);
        };
        const [read, propose, edit, manage] = await Promise.all(
          KB_ACTIONS.map(allowed),
        );
        // Every level includes the ones below it, and none holds without `read`.
        if (!read) return DENIED;
        return {
          read,
          propose: propose || edit || manage,
          edit: edit || manage,
          manage,
        };
      },
    };
  };

  return {
    space: normalSpace,
    inherits: (space) =>
      normalSpace(space)?.scope === PROJECT_SCOPE ? [SYSTEM_SPACE] : [],
    forReader,
    async title(space) {
      const normal = normalSpace(space);
      if (!normal) return null;
      if (normal.scope === SYSTEM_SCOPE) return SYSTEM_TITLE;
      return deps.projectName(normal.scopeId);
    },
    names: (refs) => deps.names(refs),
  };
}
