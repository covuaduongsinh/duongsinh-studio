import {
  agentsToken,
  type Agents,
} from '@nocobase/app-plugin-agents/server/tokens';
import { GLOBAL_SKILL_TARGET } from '@nocobase/app-plugin-agents/shared/skills';
import { authorizationToken } from '@nocobase/app-plugin-authorization';
import { notificationServiceToken } from '@nocobase/app-plugin-notification/server';
import {
  projectsAccessToken,
  projectsToken,
} from '@nocobase/app-plugin-projects/server/tokens';
import type { Application } from '@nocobase/app-server/application';
import { i18nToken } from '@nocobase/app-server/i18n';
import { databaseManagerToken, type DatabaseConnection } from '@nocobase/db';
import { APP_NS } from '@nocobase/i18n';
import { ServiceProvider } from '@nocobase/service-provider';
import { ADMINISTRATOR_SET_KEYS } from '../access/roles.js';
import {
  BUILTIN_SKILLS,
  type BuiltinSkill,
  isBuiltinPublishedContent,
  skillContentHash,
} from '../agents/builtin-skills.js';
import { appText, PROJECT_SCOPE } from '../agents/ids.js';
import { str } from '../git/rows.js';

const DEFAULT_SKILLS = 'dsProjectDefaultSkills';
const INBOX_CHANNEL = 'inbox';

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

export interface SyncBuiltinSkillsOptions {
  readonly app: Application;
  readonly agents: Agents;
  readonly builtins?: readonly BuiltinSkill[];
}

export interface SyncBuiltinSkillsReport {
  readonly created: readonly string[];
  readonly upgraded: readonly string[];
  readonly retained: readonly string[];
}

async function notifyBuiltinSkillConflict(
  app: Application,
  builtin: BuiltinSkill,
): Promise<void> {
  const { container } = app;
  if (!container.has(notificationServiceToken)) return;

  let to: string[] = [];
  if (container.has(authorizationToken)) {
    const authz = container.resolve(authorizationToken);
    const userIds = new Set<string>();
    for (const setKey of ADMINISTRATOR_SET_KEYS) {
      const assignments = await authz.permissionSets.listAssignments(setKey);
      for (const a of assignments) {
        if (a.subject.type === 'user') userIds.add(a.subject.id);
      }
    }
    to = [...userIds];
  }
  if (to.length === 0 && container.has(databaseManagerToken)) {
    const db = container.resolve(databaseManagerToken);
    const users = await db
      .connection()
      .query.selectFrom('user')
      .select(['id', 'kind'])
      .where('kind', '!=', 'service')
      .execute();
    to = users.map((u) => str(u.id)).filter(Boolean);
  }
  if (to.length === 0) return;

  let title = `Kỹ năng ${builtin.slug} có bản dựng sẵn mới (phiên bản ${builtin.revision})`;
  let body = `Kỹ năng "${builtin.slug}" đã được chỉnh sửa thủ công nên Studio giữ nguyên nội dung hiện tại, không tự động ghi đè. Bạn có thể kiểm tra và cập nhật thủ công trong thư viện kỹ năng.`;

  if (container.has(i18nToken)) {
    try {
      const i18n = container.resolve(i18nToken);
      const locale = i18n.getDefaultLocale();
      await i18n.ensureLocaleLoaded(locale);
      const t = i18n.getFixedT(APP_NS, locale);
      title = t('studioBuiltinSkills.retainedTitle', {
        slug: builtin.slug,
        revision: builtin.revision,
      });
      body = t('studioBuiltinSkills.retainedBody', {
        slug: builtin.slug,
        revision: builtin.revision,
      });
    } catch {
      // Fallback to Vietnamese strings
    }
  }

  const key = `builtin-skill-conflict:${builtin.slug}:${builtin.revision}`;
  await container.resolve(notificationServiceToken).send({
    idempotencyKey: key,
    source: {
      type: 'duongsinh-studio/skills',
      referenceId: key,
    },
    messages: {
      [INBOX_CHANNEL]: {
        to,
        title,
        body,
        target: { type: 'route', path: '/skills' },
      },
    },
  });
}

/**
 * Ensures builtin skills exist in the library, upgrades them when newer revisions are published and their current
 * version has not been modified by hand, and preserves manual edits while notifying administrators.
 */
export async function ensureBuiltinSkills(
  options: SyncBuiltinSkillsOptions,
): Promise<SyncBuiltinSkillsReport> {
  const { app, agents, builtins = BUILTIN_SKILLS } = options;
  const { container } = app;
  const conn = container.resolve(databaseManagerToken).connection();
  if (
    !(await container
      .resolve(databaseManagerToken)
      .collections()
      .getPhysical(DEFAULT_SKILLS))
  )
    return { created: [], upgraded: [], retained: [] };

  const existingSkills = await agents.skills.list();
  const bySlug = new Map(existingSkills.map((item) => [item.slug, item]));
  const defaults = await projectDefaultSkills(conn);
  const globals = await agents.skills.attached(GLOBAL_SKILL_TARGET);
  let defaultsChanged = false;
  let globalsChanged = false;

  const created: string[] = [];
  const upgraded: string[] = [];
  const retained: string[] = [];

  for (const builtin of builtins) {
    const existing = bySlug.get(builtin.slug);
    if (!existing) {
      const createdSkill = await agents.skills.create(null, {
        content: builtin.content,
      });
      created.push(builtin.slug);
      if (builtin.reach === 'global') {
        globals.push(createdSkill.id);
        globalsChanged = true;
      } else {
        defaults.push(createdSkill.id);
        defaultsChanged = true;
      }
      continue;
    }

    const detail = await agents.skills.get(existing.id);
    const currentHash = skillContentHash(detail.content);
    const targetHash = skillContentHash(builtin.content);

    if (currentHash === targetHash) {
      continue;
    }

    const isUnmodified = isBuiltinPublishedContent(builtin, detail.content);
    if (isUnmodified) {
      await agents.skills.save(existing.id, null, {
        content: builtin.content,
        files: [],
        note: `Nâng cấp lên bản dựng sẵn (phiên bản ${builtin.revision})`,
        expectedRevision: detail.version,
      });
      upgraded.push(builtin.slug);
    } else {
      retained.push(builtin.slug);
      await notifyBuiltinSkillConflict(app, builtin);
    }
  }

  if (globalsChanged) {
    await agents.skills.attach(GLOBAL_SKILL_TARGET, globals);
  }
  if (defaultsChanged) {
    await setProjectDefaultSkills(conn, defaults);
  }

  return { created, upgraded, retained };
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
    await ensureBuiltinSkills({ app: this.app, agents });
  }

  override async shutdown(): Promise<void> {
    for (const release of this.releases.splice(0)) release();
  }
}
