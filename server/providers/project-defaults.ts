import {
  agentsToken,
  type Agents,
} from '@nocobase/app-plugin-agents/server/tokens';
import { GLOBAL_SKILL_TARGET } from '@nocobase/app-plugin-agents/shared/skills';
import {
  projectsAccessToken,
  projectsToken,
} from '@nocobase/app-plugin-projects/server/tokens';
import type { Application } from '@nocobase/app-server/application';
import { databaseManagerToken, type DatabaseConnection } from '@nocobase/db';
import { ServiceProvider } from '@nocobase/service-provider';
import { BUILTIN_SKILLS } from '../agents/builtin-skills.js';
import { appText, PROJECT_SCOPE } from '../agents/ids.js';
import { str } from '../git/rows.js';

const DEFAULT_SKILLS = 'dsProjectDefaultSkills';

/** The skills a project created from now on starts with, in order. */
export async function projectDefaultSkills(
  conn: DatabaseConnection,
): Promise<string[]> {
  const rows = await conn.query
    .selectFrom(DEFAULT_SKILLS)
    .select(['skillId'])
    .orderBy('position')
    .execute();
  return rows.map((row) => str(row.skillId));
}

/** Replaces the skills projects created from now on start with; existing projects keep their own. */
export async function setProjectDefaultSkills(
  conn: DatabaseConnection,
  skillIds: readonly string[],
): Promise<void> {
  await conn.query.deleteFrom(DEFAULT_SKILLS).allowAllRows().execute();
  if (skillIds.length > 0)
    await conn.query
      .insertInto(DEFAULT_SKILLS)
      .values(skillIds.map((skillId, position) => ({ skillId, position })))
      .execute();
}

/**
 * Makes projects a scope of skills and variables, copies the default skills to each new project, and creates Studio's
 * own skills once. A skill the team later edits or removes stays as they left it, because it is created only when
 * missing and only then attached.
 */
export default class ProjectDefaultsProvider extends ServiceProvider<Application> {
  readonly name = 'app/project-defaults';
  private readonly releases: (() => void)[] = [];

  override async boot(): Promise<void> {
    const { container } = this.app;
    if (!container.has(agentsToken) || !container.has(projectsToken)) return;
    const agents = container.resolve(agentsToken);
    const projects = container.resolve(projectsToken);
    const conn = () => container.resolve(databaseManagerToken).connection();

    this.releases.push(
      agents.scopes.register({
        key: PROJECT_SCOPE,
        title: appText('studioAgents.scopes.project'),
        access: async (projectId, userId) => {
          const permissions = await this.permissionsOf(userId);
          if (!permissions) return null;
          const access = await projects.projects.accessTo(permissions, {
            projectId,
          });
          if (!access) return null;
          return {
            visible: access.visible === true,
            manage: access.manage === true,
          };
        },
      }),
      projects.events.on('project.created', async ({ projectId }) => {
        const skillIds = await projectDefaultSkills(conn());
        if (skillIds.length === 0) return;
        await agents.skills.attach(
          { scope: PROJECT_SCOPE, scopeId: projectId },
          skillIds,
        );
      }),
    );
    // Starting the application matters more than these skills; the skill library can make them by hand.
    try {
      await this.ensureBuiltinSkills(agents);
    } catch (error) {
      console.warn('Studio could not create its own skills', error);
    }
  }

  private async permissionsOf(userId: string) {
    const access = this.app.container.resolve(projectsAccessToken);
    if (!access.permissionsOfUser) return null;
    return {
      userId,
      actor: { type: 'user' as const, id: userId },
      permissions: await access.permissionsOfUser(userId),
    };
  }

  private async ensureBuiltinSkills(agents: Agents): Promise<void> {
    const { container } = this.app;
    const conn = container.resolve(databaseManagerToken).connection();
    if (
      !(await container
        .resolve(databaseManagerToken)
        .collections()
        .getPhysical(DEFAULT_SKILLS))
    )
      return;
    const existing = new Set(
      (await agents.skills.list()).map((item) => item.slug),
    );
    const defaults = await projectDefaultSkills(conn);
    const globals = await agents.skills.attached(GLOBAL_SKILL_TARGET);
    for (const builtin of BUILTIN_SKILLS) {
      if (existing.has(builtin.slug)) continue;
      const created = await agents.skills.create(null, {
        content: builtin.content,
      });
      if (builtin.reach === 'global') globals.push(created.id);
      else defaults.push(created.id);
    }
    await agents.skills.attach(GLOBAL_SKILL_TARGET, globals);
    await setProjectDefaultSkills(conn, defaults);
  }

  override async shutdown(): Promise<void> {
    for (const release of this.releases.splice(0)) release();
  }
}
