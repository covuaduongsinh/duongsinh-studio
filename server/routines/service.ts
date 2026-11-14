import { randomUUID } from 'node:crypto';
import type { DatabaseConnection } from '@nocobase/db';
import type { ScheduleExecutor } from '@nocobase/jobs';
import type {
  Projects,
  Viewer,
} from '@nocobase/app-plugin-projects/server/tokens';
import { AGENT_KIND, PROJECT_MANAGER_ID } from '../agents/ids.js';
import type { BudgetService } from '../budgets/service.js';
import { bool, str } from '../git/rows.js';
import {
  ROUTINE_TEMPLATES,
  decideRoutineRun,
  isValidCron,
  routineMarker,
  type RoutineSkip,
} from './decide.js';

export const ROUTINE_TZ = 'Asia/Ho_Chi_Minh';

export class RoutineError extends Error {
  constructor(
    readonly reason:
      'INVALID_CRON' | 'NOT_FOUND' | 'NO_PROJECT' | 'UNKNOWN_TEMPLATE',
    message: string,
  ) {
    super(message);
  }
}

export interface RoutineView {
  readonly id: string;
  readonly name: string;
  readonly playbookSlug: string | null;
  readonly template: string;
  readonly cron: string;
  readonly enabled: boolean;
  readonly projectIds: string[];
  readonly lastRunAt: string | null;
  readonly lastResult: string | null;
}

export interface RoutineInput {
  readonly name: string;
  readonly playbookSlug?: string | null;
  readonly template: string;
  readonly cron: string;
  readonly projectIds: readonly string[];
}

export interface RoutineRunReport {
  readonly created: { projectId: string; issueId: string }[];
  readonly skipped: {
    projectId: string;
    reason: RoutineSkip | 'failed';
    detail?: string;
  }[];
}

const NOT_ACTIVE = ['done', 'cancelled', 'closed', 'backlog'];

export function createRoutinesService(deps: {
  readonly conn: () => DatabaseConnection;
  readonly projects: () => Projects;
  readonly budgets: () => BudgetService;
  readonly executor: () => ScheduleExecutor | undefined;
  /** A person's permissions, for the issues a routine makes in their name. */
  readonly viewerOf: (userId: string) => Promise<Viewer | null>;
  readonly now?: () => Date;
}) {
  const now = () => (deps.now ? deps.now() : new Date());
  const jobName = (id: string) => `routine-${id}`;

  async function view(row: Record<string, unknown>): Promise<RoutineView> {
    const projects = await deps
      .conn()
      .query.selectFrom('dsRoutineProjects')
      .select('projectId')
      .where('routineId', '=', str(row.id))
      .execute();
    return {
      id: str(row.id),
      name: str(row.name),
      playbookSlug: row.playbookSlug ? str(row.playbookSlug) : null,
      template: str(row.template),
      cron: str(row.cron),
      enabled: bool(row.enabled),
      projectIds: projects.map((p) => str(p.projectId)),
      lastRunAt: row.lastRunAt
        ? new Date(str(row.lastRunAt)).toISOString()
        : null,
      lastResult: row.lastResult ? str(row.lastResult) : null,
    };
  }

  async function get(id: string): Promise<RoutineView> {
    const row = await deps
      .conn()
      .query.selectFrom('dsRoutines')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (!row) throw new RoutineError('NOT_FOUND', `Routine ${id} not found.`);
    return view(row);
  }

  async function list(): Promise<RoutineView[]> {
    const rows = await deps
      .conn()
      .query.selectFrom('dsRoutines')
      .selectAll()
      .orderBy('createdAt', 'asc')
      .execute();
    return Promise.all(rows.map(view));
  }

  const checked = (input: RoutineInput): void => {
    if (!isValidCron(input.cron))
      throw new RoutineError(
        'INVALID_CRON',
        'The schedule is five fields: minute, hour, day of the month, month, day of the week.',
      );
    if (input.projectIds.length === 0)
      throw new RoutineError(
        'NO_PROJECT',
        'A routine needs at least one project.',
      );
  };

  async function writeProjects(
    id: string,
    projectIds: readonly string[],
  ): Promise<void> {
    const conn = deps.conn();
    await conn.query
      .deleteFrom('dsRoutineProjects')
      .where('routineId', '=', id)
      .execute();
    for (const projectId of new Set(projectIds))
      await conn.query
        .insertInto('dsRoutineProjects')
        .values({ routineId: id, projectId })
        .execute();
  }

  /** Puts the routine's schedule in line with its row: on while enabled, off otherwise. */
  async function sync(id: string): Promise<void> {
    const executor = deps.executor();
    if (!executor) return;
    const routine = await deps
      .conn()
      .query.selectFrom('dsRoutines')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (!routine || !bool(routine.enabled)) {
      await executor.removeJob(jobName(id));
      return;
    }
    await executor.addJob({
      name: jobName(id),
      options: { cron: str(routine.cron), tz: ROUTINE_TZ },
      payload: { routineId: id },
      execute: async () => {
        await run(id);
      },
    });
  }

  async function create(
    userId: string,
    input: RoutineInput,
  ): Promise<RoutineView> {
    checked(input);
    const id = randomUUID();
    const at = now();
    await deps
      .conn()
      .query.insertInto('dsRoutines')
      .values({
        id,
        name: input.name,
        playbookSlug: input.playbookSlug ?? null,
        template: input.template,
        cron: input.cron,
        // Off until a person turns it on.
        enabled: false,
        createdById: userId,
        createdAt: at,
        updatedAt: at,
      })
      .execute();
    await writeProjects(id, input.projectIds);
    return get(id);
  }

  async function createFromTemplate(
    userId: string,
    key: string,
    projectIds: readonly string[],
  ): Promise<RoutineView> {
    const template = ROUTINE_TEMPLATES.find((t) => t.key === key);
    if (!template)
      throw new RoutineError('UNKNOWN_TEMPLATE', `No template ${key}.`);
    return create(userId, {
      name: template.name,
      playbookSlug: template.playbookSlug,
      template: template.template,
      cron: template.cron,
      projectIds,
    });
  }

  async function update(id: string, input: RoutineInput): Promise<RoutineView> {
    await get(id);
    checked(input);
    await deps
      .conn()
      .query.updateTable('dsRoutines')
      .set({
        name: input.name,
        playbookSlug: input.playbookSlug ?? null,
        template: input.template,
        cron: input.cron,
        updatedAt: now(),
      })
      .where('id', '=', id)
      .execute();
    await writeProjects(id, input.projectIds);
    await sync(id);
    return get(id);
  }

  async function setEnabled(
    id: string,
    enabled: boolean,
  ): Promise<RoutineView> {
    await get(id);
    await deps
      .conn()
      .query.updateTable('dsRoutines')
      .set({ enabled, updatedAt: now() })
      .where('id', '=', id)
      .execute();
    await sync(id);
    return get(id);
  }

  async function remove(id: string): Promise<void> {
    await get(id);
    await deps.executor()?.removeJob(jobName(id));
    await deps
      .conn()
      .query.deleteFrom('dsRoutineProjects')
      .where('routineId', '=', id)
      .execute();
    await deps
      .conn()
      .query.deleteFrom('dsRoutines')
      .where('id', '=', id)
      .execute();
  }

  /** Opens one issue in each project that has room; says why the others were left alone. */
  async function run(id: string): Promise<RoutineRunReport> {
    const conn = deps.conn();
    const routine = await get(id);
    const owner = await conn.query
      .selectFrom('dsRoutines')
      .select('createdById')
      .where('id', '=', id)
      .executeTakeFirstOrThrow();
    const viewer = await deps.viewerOf(str(owner.createdById));
    const report: {
      -readonly [K in keyof RoutineRunReport]: RoutineRunReport[K];
    } = {
      created: [],
      skipped: [],
    };
    for (const projectId of routine.projectIds) {
      try {
        const marker = routineMarker(id);
        const open = await conn.query
          .selectFrom('pmIssues')
          .select('id')
          .where('projectId', '=', projectId)
          .where('description', 'like', `%${marker}%`)
          .where('statusKey', 'not in', NOT_ACTIVE)
          .executeTakeFirst();
        const active = await conn.query
          .selectFrom('pmIssues')
          .select('id')
          .where('projectId', '=', projectId)
          .where('statusKey', 'in', ['in_progress', 'in_review'])
          .execute();
        const settings = await conn.query
          .selectFrom('dsAutopilotSettings')
          .select('maxActiveIssues')
          .where('projectId', '=', projectId)
          .executeTakeFirst();
        const decision = decideRoutineRun({
          openFromRoutine: Boolean(open),
          activeIssues: active.length,
          maxActiveIssues:
            settings?.maxActiveIssues == null
              ? null
              : Number(settings.maxActiveIssues),
          budgetBlocked: Boolean(
            await deps
              .budgets()
              .blocking(conn, { agentId: PROJECT_MANAGER_ID, projectId }),
          ),
        });
        if (!decision.run) {
          report.skipped.push({ projectId, reason: decision.reason });
          continue;
        }
        if (!viewer) {
          report.skipped.push({
            projectId,
            reason: 'failed',
            detail: 'The routine’s owner has no access any more.',
          });
          continue;
        }
        const description = [
          routine.playbookSlug ? `!${routine.playbookSlug}` : null,
          routine.template,
          marker,
        ]
          .filter(Boolean)
          .join('\n\n');
        const issue = await deps.projects().issues.create(viewer, {
          title: `${routine.name} (${now().toISOString().slice(0, 10)})`,
          description,
          projectId,
          statusKey: 'in_progress',
          executor: { type: AGENT_KIND, id: PROJECT_MANAGER_ID },
        });
        report.created.push({ projectId, issueId: issue.id });
      } catch (error) {
        report.skipped.push({
          projectId,
          reason: 'failed',
          detail: error instanceof Error ? error.message : String(error),
        });
      }
    }
    await conn.query
      .updateTable('dsRoutines')
      .set({
        lastRunAt: now(),
        lastResult: `${report.created.length} opened, ${report.skipped.length} left alone${
          report.skipped.length > 0
            ? ` (${report.skipped.map((s) => `${s.projectId}: ${s.reason}`).join('; ')})`
            : ''
        }`,
        updatedAt: now(),
      })
      .where('id', '=', id)
      .execute();
    return report;
  }

  /** At start-up: every enabled routine gets its schedule. */
  async function syncAll(): Promise<void> {
    for (const routine of await list()) await sync(routine.id);
  }

  return {
    list,
    get,
    create,
    createFromTemplate,
    update,
    setEnabled,
    remove,
    run,
    sync,
    syncAll,
  };
}

export type RoutinesService = ReturnType<typeof createRoutinesService>;
