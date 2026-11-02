import type { Application } from '@nocobase/app-server/application';
import { cliToken } from '@nocobase/app-server/router';
import { authorizationToken } from '@nocobase/app-plugin-authorization';
import { agentsToken } from '@nocobase/app-plugin-agents/server/tokens';
import {
  knowledgeAccessToken,
  knowledgeToken,
} from '@nocobase/app-plugin-knowledge/server/tokens';
import {
  levelActionsOf,
  RESOURCE_TYPE,
} from '@nocobase/app-plugin-knowledge/shared/access';
import {
  projectsAccessToken,
  projectsToken,
} from '@nocobase/app-plugin-projects/server/tokens';
import { userManagementServiceToken } from '@nocobase/app-plugin-users/server/tokens';
import { databaseManagerToken } from '@nocobase/db';
import { ServiceProvider } from '@nocobase/service-provider';
import {
  AGENT_ACTOR,
  createKnowledgeAccess,
  type KbAction,
  type KbLevel,
} from '../knowledge/access.js';
import {
  createKnowledgeMount,
  createKnowledgeSection,
  type KnowledgeRunDeps,
} from '../knowledge/runs.js';
import { REPLACED_PLUGIN_COMMANDS } from '../routes/kb.js';
import { userIdentity } from './projects-access.js';

const AGENTS_TABLE = 'agAgents';
const PROJECTS_TABLE = 'pmProjects';

function actionsOf(value: unknown): string[] {
  let parsed: unknown = value;
  // Database JSON codecs may hand back the serialized value as a string.
  while (typeof parsed === 'string') parsed = JSON.parse(parsed) as unknown;
  return Array.isArray(parsed)
    ? parsed.filter((item): item is string => typeof item === 'string')
    : [];
}

/**
 * Knowledge (S4): the spaces and who may do what in each (`knowledgeAccessToken`, `server/knowledge/access.ts`), the
 * knowledge a run may read beside its repositories (the `knowledge` mount) and in its brief, and the application's
 * `kb search` / `kb read` taking over the command line from the plugin's person-only ones.
 */
export default class KnowledgeProvider extends ServiceProvider<Application> {
  readonly name = 'app/knowledge';
  private releases: (() => void)[] = [];

  override register(): void {
    const { container } = this.app;
    const conn = () => container.resolve(databaseManagerToken).connection();
    const authz = () => container.resolve(authorizationToken);
    container.singleton(knowledgeAccessToken, () =>
      createKnowledgeAccess({
        unrestricted: async (userId) =>
          (await authz().for(userIdentity(userId)).snapshot()).unrestricted,
        level: async (userId, action: KbAction): Promise<KbLevel> => {
          const context = authz().for(userIdentity(userId));
          for (const { level, name } of [
            ...levelActionsOf(`kb.knowledge/${action}`),
          ].reverse()) {
            if (
              await context.can({
                resource: { type: RESOURCE_TYPE, id: 'kb.knowledge' },
                action: name,
              })
            )
              return level === 'all' ? 'all' : 'related';
          }
          return 'none';
        },
        project: async (userId, projectId) => {
          const viewer = {
            userId,
            actor: { type: 'user' as const, id: userId },
            permissions: await container
              .resolve(projectsAccessToken)
              .permissionsOf(userIdentity(userId)),
          };
          const info = await container
            .resolve(projectsToken)
            .projects.accessTo(viewer, { projectId });
          return info ? { visible: info.visible, manage: info.manage } : null;
        },
        projectName: async (projectId) => {
          const row = await conn()
            .query.selectFrom(PROJECTS_TABLE)
            .select(['name'])
            .where('id', '=', projectId)
            .executeTakeFirst();
          return row ? String(row.name) : null;
        },
        agentActions: async (agentId) => {
          const row = await conn()
            .query.selectFrom(AGENTS_TABLE)
            .select(['actions'])
            .where('id', '=', agentId)
            .executeTakeFirst();
          return row ? new Set(actionsOf(row.actions)) : null;
        },
        names: async (refs) => {
          const names = new Map<string, string>();
          const agentIds = refs
            .filter((ref) => ref.kind === AGENT_ACTOR)
            .map((ref) => ref.id);
          if (agentIds.length) {
            const rows = await conn()
              .query.selectFrom(AGENTS_TABLE)
              .select(['id', 'name'])
              .where('id', 'in', agentIds)
              .execute();
            for (const row of rows)
              names.set(`${AGENT_ACTOR}:${String(row.id)}`, String(row.name));
          }
          if (container.has(userManagementServiceToken)) {
            const users = container.resolve(userManagementServiceToken);
            for (const ref of refs.filter((item) => item.kind === 'user')) {
              try {
                const user = await users.get(ref.id);
                if (user.name) names.set(`user:${ref.id}`, user.name);
              } catch {
                // A person no longer here is shown as removed by the plugin.
              }
            }
          }
          return names;
        },
      }),
    );
  }

  override async boot(): Promise<void> {
    const { container } = this.app;
    if (container.has(cliToken))
      this.releases.push(
        container
          .resolve(cliToken)
          .exclude({ operationIds: [...REPLACED_PLUGIN_COMMANDS] }),
      );
    if (!container.has(agentsToken) || !container.has(knowledgeToken)) return;
    const agents = container.resolve(agentsToken);
    const deps: KnowledgeRunDeps = {
      knowledge: () => container.resolve(knowledgeToken),
      projectOf: async (issueId) =>
        container.has(projectsToken)
          ? ((
              await container
                .resolve(projectsToken)
                .issueContext.contextFor(
                  container.resolve(databaseManagerToken).connection(),
                  issueId,
                )
            )?.project?.id ?? null)
          : null,
      cli: 'ds-studio',
      onError: (error) =>
        console.error(
          'The knowledge a run may read could not be decided.',
          error,
        ),
    };
    this.releases.push(agents.mounts.register(createKnowledgeMount(deps)));
    this.releases.push(
      agents.briefs.sections.register(createKnowledgeSection(deps)),
    );
  }

  override async shutdown(): Promise<void> {
    for (const release of this.releases.splice(0)) release();
  }
}
