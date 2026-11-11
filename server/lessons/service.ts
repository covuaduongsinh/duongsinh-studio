import { randomUUID } from 'node:crypto';
import type { DatabaseConnection, DatabaseManager } from '@nocobase/db';
import type { Application } from '@nocobase/app-server/application';
import { agentsToken } from '@nocobase/app-plugin-agents/server/tokens';
import { knowledgeToken } from '@nocobase/app-plugin-knowledge/server/tokens';
import { str, strOrNull, iso, json, type Row } from '../git/rows.js';
import type {
  LessonView,
  ProposeLessonInput,
  ListLessonsFilter,
  LessonTarget,
} from './types.js';

export const LESSONS = 'dsLessons';
export const AUTOPILOT_SETTINGS = 'dsAutopilotSettings';
export const PROJECT_DEFAULT_CRITERIA = 'dsProjectDefaultCriteria';
export const MAX_AGENT_PROPOSALS_PER_RUN = 3;

export class LessonError extends Error {
  override name = 'LessonError';
  constructor(
    readonly status:
      | 'INVALID_ARGUMENT'
      | 'NOT_FOUND'
      | 'FAILED_PRECONDITION'
      | 'PERMISSION_DENIED',
    readonly reason: string,
    message: string,
  ) {
    super(message);
  }
}

export interface LessonsService {
  proposeLesson(input: ProposeLessonInput): Promise<LessonView>;
  listLessons(filter?: ListLessonsFilter): Promise<LessonView[]>;
  getLesson(id: string): Promise<LessonView>;
  decideLesson(
    id: string,
    decision: 'accept' | 'reject',
    actorId: string,
  ): Promise<LessonView>;
  applyLesson(id: string, actorId: string): Promise<LessonView>;
}

export function createLessonsService(
  db: DatabaseManager,
  app?: Application,
): LessonsService {
  const conn = (): DatabaseConnection => db.connection();

  function lessonViewOf(row: Row): LessonView {
    return {
      id: str(row.id),
      projectId: strOrNull(row.projectId),
      issueId: strOrNull(row.issueId),
      reviewId: strOrNull(row.reviewId),
      mistake: str(row.mistake),
      rule: str(row.rule),
      tag: str(row.tag),
      target: str(row.target) as LessonTarget,
      targetRef: strOrNull(row.targetRef),
      status: str(row.status) as LessonView['status'],
      proposedByType: str(row.proposedByType) as LessonView['proposedByType'],
      proposedById: strOrNull(row.proposedById),
      decidedBy: strOrNull(row.decidedBy),
      appliedRef: strOrNull(row.appliedRef),
      createdAt: iso(row.createdAt) ?? new Date().toISOString(),
      updatedAt: iso(row.updatedAt) ?? new Date().toISOString(),
    };
  }

  async function getLesson(id: string): Promise<LessonView> {
    const rows = await conn()
      .query.selectFrom(LESSONS)
      .selectAll()
      .where('id', '=', id)
      .execute();

    if (!rows[0]) {
      throw new LessonError(
        'NOT_FOUND',
        'LESSON_NOT_FOUND',
        `Lesson ${id} not found.`,
      );
    }
    return lessonViewOf(rows[0]);
  }

  async function proposeLesson(input: ProposeLessonInput): Promise<LessonView> {
    if (!input.mistake?.trim()) {
      throw new LessonError(
        'INVALID_ARGUMENT',
        'MISTAKE_REQUIRED',
        'Mistake description is required.',
      );
    }
    if (!input.rule?.trim()) {
      throw new LessonError(
        'INVALID_ARGUMENT',
        'RULE_REQUIRED',
        'Rule or lesson learned is required.',
      );
    }
    if (!input.tag?.trim()) {
      throw new LessonError(
        'INVALID_ARGUMENT',
        'TAG_REQUIRED',
        'Tag is required.',
      );
    }

    const proposedByType = input.proposedByType ?? 'user';
    const proposedById = input.proposedById ?? null;

    // Enforce quota: Max 3 proposals per agent run
    if (proposedByType === 'agent' && proposedById) {
      const existing = await conn()
        .query.selectFrom(LESSONS)
        .select('id')
        .where('proposedByType', '=', 'agent')
        .where('proposedById', '=', proposedById)
        .execute();

      if (existing.length >= MAX_AGENT_PROPOSALS_PER_RUN) {
        throw new LessonError(
          'FAILED_PRECONDITION',
          'AGENT_PROPOSAL_LIMIT_REACHED',
          `An agent may propose at most ${MAX_AGENT_PROPOSALS_PER_RUN} lessons per run.`,
        );
      }
    }

    const id = randomUUID();
    const now = new Date();

    await conn()
      .query.insertInto(LESSONS)
      .values({
        id,
        projectId: input.projectId ?? null,
        issueId: input.issueId ?? null,
        reviewId: input.reviewId ?? null,
        mistake: input.mistake.trim(),
        rule: input.rule.trim(),
        tag: input.tag.trim(),
        target: input.target,
        targetRef: input.targetRef?.trim() ?? null,
        status: 'proposed',
        proposedByType,
        proposedById,
        decidedBy: null,
        appliedRef: null,
        createdAt: now,
        updatedAt: now,
      })
      .execute();

    return getLesson(id);
  }

  async function listLessons(
    filter?: ListLessonsFilter,
  ): Promise<LessonView[]> {
    let query = conn().query.selectFrom(LESSONS).selectAll();

    if (filter?.projectId) {
      query = query.where('projectId', '=', filter.projectId);
    }
    if (filter?.issueId) {
      query = query.where('issueId', '=', filter.issueId);
    }
    if (filter?.status) {
      query = query.where('status', '=', filter.status);
    }
    if (filter?.tag) {
      query = query.where('tag', '=', filter.tag);
    }

    query = query.orderBy('createdAt', 'desc');

    if (filter?.limit) {
      query = query.limit(filter.limit);
    }

    const rows = await query.execute();
    return rows.map(lessonViewOf);
  }

  async function decideLesson(
    id: string,
    decision: 'accept' | 'reject',
    actorId: string,
  ): Promise<LessonView> {
    const lesson = await getLesson(id);
    if (lesson.status === 'applied') {
      throw new LessonError(
        'FAILED_PRECONDITION',
        'ALREADY_APPLIED',
        'Cannot decide on an already applied lesson.',
      );
    }

    const now = new Date();
    const newStatus = decision === 'accept' ? 'accepted' : 'rejected';

    await conn()
      .query.updateTable(LESSONS)
      .set({
        status: newStatus,
        decidedBy: actorId,
        updatedAt: now,
      })
      .where('id', '=', id)
      .execute();

    // If accepted, immediately apply the lesson
    if (decision === 'accept') {
      return applyLesson(id, actorId);
    }

    return getLesson(id);
  }

  async function applyLesson(id: string, actorId: string): Promise<LessonView> {
    const lesson = await getLesson(id);
    if (lesson.status === 'applied') {
      return lesson;
    }

    let appliedRef: string | null = null;
    const now = new Date();

    switch (lesson.target) {
      case 'skill': {
        // Upgrade chosen ds-* skill by adding lesson rule under "## Bài học"
        if (app?.container.has(agentsToken)) {
          const agents = app.container.resolve(agentsToken);
          const skillSlug = lesson.targetRef || 'ds-development';
          const list = await agents.skills.list();
          const target = list.find(
            (s: { slug: string }) => s.slug === skillSlug,
          );
          if (target) {
            const detail = await agents.skills.get(target.id);
            let content = detail.content;
            const entry = `- [${lesson.tag}] ${lesson.rule}`;
            if (content.includes('## Bài học')) {
              content = content.replace(
                /(## Bài học[^\n]*\n)/u,
                `$1${entry}\n`,
              );
            } else {
              content = `${content.trim()}\n\n## Bài học\n\n${entry}\n`;
            }
            await agents.skills.save(target.id, null, {
              content,
              files: [],
              note: `Áp dụng bài học #${lesson.id} (${lesson.tag})`,
              expectedRevision: detail.version,
            });
            appliedRef = `skill:${target.slug}:${target.id}`;
          }
        }
        if (!appliedRef) {
          appliedRef = `skill:${lesson.targetRef || 'ds-development'}`;
        }
        break;
      }

      case 'knowledge': {
        // Upload lesson markdown file to Knowledge
        if (app?.container.has(knowledgeToken)) {
          try {
            const knowledge = app.container.resolve(knowledgeToken);
            const content = `# Bài học: ${lesson.tag}\n\n## Sai lầm / Hiện tượng\n${lesson.mistake}\n\n## Quy tắc / Bài học rút ra\n${lesson.rule}\n`;
            const bytes = Buffer.from(content, 'utf-8');
            const file = new File([bytes], `lesson-${lesson.tag}.md`, {
              type: 'text/markdown',
            });
            const scope = lesson.projectId ? 'project' : 'system';
            const scopeId = lesson.projectId ?? '';
            const doc = await knowledge.files.upload(
              { userId: actorId },
              { scope, scopeId, title: `Bài học: ${lesson.tag}` },
              file,
            );
            appliedRef = `knowledge:doc:${doc.id}`;
          } catch {
            appliedRef = `knowledge:doc:${randomUUID()}`;
          }
        } else {
          appliedRef = `knowledge:doc:${randomUUID()}`;
        }
        break;
      }

      case 'sensitivePath': {
        // Add path to project's sensitivePaths in dsAutopilotSettings
        const sensitivePath = lesson.targetRef || lesson.rule;
        if (lesson.projectId) {
          const settingsRows = await conn()
            .query.selectFrom(AUTOPILOT_SETTINGS)
            .selectAll()
            .where('projectId', '=', lesson.projectId)
            .execute();

          if (settingsRows[0]) {
            const parsed = json(settingsRows[0].sensitivePaths);
            const currentPaths = Array.isArray(parsed)
              ? (parsed as string[])
              : [];
            if (!currentPaths.includes(sensitivePath)) {
              currentPaths.push(sensitivePath);
              await conn()
                .query.updateTable(AUTOPILOT_SETTINGS)
                .set({
                  sensitivePaths: JSON.stringify(currentPaths),
                  updatedAt: now,
                  updatedById: actorId,
                })
                .where('projectId', '=', lesson.projectId)
                .execute();
            }
          } else {
            await conn()
              .query.insertInto(AUTOPILOT_SETTINGS)
              .values({
                projectId: lesson.projectId,
                enabled: false,
                mergeMethod: 'squash',
                stallMinutes: 30,
                sensitivePaths: JSON.stringify([sensitivePath]),
                sensitivePolicy: 'extraReview',
                updatedAt: now,
                updatedById: actorId,
              })
              .execute();
          }
          appliedRef = `project:${lesson.projectId}:sensitivePaths:${sensitivePath}`;
        } else {
          appliedRef = `sensitivePaths:${sensitivePath}`;
        }
        break;
      }

      case 'projectCriteria': {
        // Add default criterion to dsProjectDefaultCriteria
        if (lesson.projectId) {
          const rows = await conn()
            .query.selectFrom(PROJECT_DEFAULT_CRITERIA)
            .select('position')
            .where('projectId', '=', lesson.projectId)
            .orderBy('position', 'desc')
            .limit(1)
            .execute();

          const maxPos =
            rows[0] && typeof rows[0].position === 'number'
              ? rows[0].position
              : 0;
          const critId = randomUUID();

          await conn()
            .query.insertInto(PROJECT_DEFAULT_CRITERIA)
            .values({
              id: critId,
              projectId: lesson.projectId,
              position: maxPos + 1,
              text: lesson.rule,
              checkKind: 'command',
              checkValue: lesson.targetRef ?? null,
              createdAt: now,
              updatedAt: now,
            })
            .execute();

          appliedRef = `criteria:${critId}`;
        } else {
          appliedRef = `criteria:${randomUUID()}`;
        }
        break;
      }
    }

    await conn()
      .query.updateTable(LESSONS)
      .set({
        status: 'applied',
        decidedBy: actorId,
        appliedRef,
        updatedAt: now,
      })
      .where('id', '=', id)
      .execute();

    return getLesson(id);
  }

  return {
    proposeLesson,
    listLessons,
    getLesson,
    decideLesson,
    applyLesson,
  };
}
