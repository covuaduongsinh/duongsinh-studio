import type { Agents } from '@nocobase/app-plugin-agents/server/tokens';
import type { DatabaseConnection } from '@nocobase/db';
import { GitHubError, type GitHubClient } from '../git/github.js';
import type { GitService } from '../git/service.js';
import type { LessonsService } from '../lessons/service.js';
import { BUILTIN_SKILLS } from '../agents/builtin-skills.js';
import { GLOBAL_SKILL_TARGET } from '@nocobase/app-plugin-agents/shared/skills';
import { str } from '../git/rows.js';
import { listPlaybookDefinitions } from '../playbooks/service.js';
import {
  HARNESS_DIR,
  addIndexRow,
  buildHarnessFiles,
  driftOf,
  lessonHash,
  scanHarnessFiles,
  unknownLessons,
  type HarnessFile,
  type HarnessInput,
} from './build.js';

export class HarnessExportError extends Error {
  constructor(
    readonly reason:
      'NO_REPOSITORY' | 'SECRETS_FOUND' | 'NOTHING_TO_EXPORT' | 'HOST_REFUSED',
    message: string,
    readonly metadata: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export interface HarnessStatus {
  readonly repository: string | null;
  readonly branch: string | null;
  /** Files Studio would write now. */
  readonly files: number;
  readonly missing: string[];
  readonly edited: string[];
  readonly outdated: boolean;
  /**
   * The built-in project skills (`ds-*`) the project has not been given: they are attached only to projects created after
   * they were published, so an older project may export a set without them (plan S, S5).
   */
  readonly missingBuiltinSkills: string[];
  /** Green when nothing is missing, edited or out of date. */
  readonly state: 'noRepository' | 'notExported' | 'inSync' | 'drifted';
}

export function createHarnessExportService(deps: {
  readonly conn: () => DatabaseConnection;
  readonly git: () => GitService;
  readonly agents: () => Agents;
  readonly lessons?: () => Pick<LessonsService, 'proposeLesson'>;
}) {
  /** What Studio keeps for the project: its attached skills, accepted lessons, playbooks and default criteria. */
  async function collect(projectId: string): Promise<HarnessInput> {
    const conn = deps.conn();
    const project = await conn.query
      .selectFrom('pmProjects')
      .select('name')
      .where('id', '=', projectId)
      .executeTakeFirst();
    const skillService = deps.agents().skills;
    const attached = await skillService.attached({
      scope: 'project',
      scopeId: projectId,
    });
    const skills: { slug: string; name: string; content: string }[] = [];
    // The project's own skills first, then the ones every run gets (`ds-comment-style`); a slug is written once, the
    // project's copy winning.
    for (const id of [
      ...attached,
      ...(await skillService.attached(GLOBAL_SKILL_TARGET)),
    ]) {
      const skill = await skillService.get(id);
      if (skills.some((known) => known.slug === skill.slug)) continue;
      skills.push({
        slug: skill.slug,
        name: skill.name,
        content: skill.content,
      });
    }
    const lessons = await conn.query
      .selectFrom('dsLessons')
      .selectAll()
      .where((eb) =>
        eb.or([eb('projectId', '=', projectId), eb('projectId', 'is', null)]),
      )
      .where('status', 'in', ['accepted', 'applied'])
      .orderBy('createdAt', 'asc')
      .execute();
    const criteria = await conn.query
      .selectFrom('dsProjectDefaultCriteria')
      .selectAll()
      .where('projectId', '=', projectId)
      .orderBy('position', 'asc')
      .execute();
    return {
      projectName: project ? str(project.name) : projectId,
      skills,
      lessons: lessons.map((row) => ({
        rule: str(row.rule),
        mistake: str(row.mistake),
        tag: str(row.tag),
      })),
      playbooks: listPlaybookDefinitions().map((p) => ({
        slug: p.slug,
        name: p.name,
        description: p.description,
        instructions: p.instructions,
      })),
      criteria: criteria.map((row) => ({
        text: str(row.text),
        checkKind: str(row.checkKind),
        checkValue: row.checkValue ? str(row.checkValue) : null,
      })),
    };
  }

  /** The built-in project skills that exist in the library but are not attached to this project. */
  async function missingBuiltinSkills(projectId: string): Promise<string[]> {
    const skillService = deps.agents().skills;
    const attached = new Set(
      await skillService.attached({ scope: 'project', scopeId: projectId }),
    );
    const library = new Map(
      (await skillService.list()).map((skill) => [skill.slug, skill.id]),
    );
    return BUILTIN_SKILLS.filter((builtin) => builtin.reach === 'project')
      .filter((builtin) => {
        const id = library.get(builtin.slug);
        return id === undefined || !attached.has(id);
      })
      .map((builtin) => builtin.slug);
  }

  async function target(projectId: string): Promise<{
    client: GitHubClient;
    fullName: string;
    branch: string;
  } | null> {
    const repository = await deps.git().primaryRepository(projectId);
    if (!repository) return null;
    return {
      client: await deps.git().clientForRepository(repository.id),
      fullName: repository.repo,
      branch: repository.defaultBranch,
    };
  }

  async function readRepository(
    client: GitHubClient,
    fullName: string,
    branch: string,
    paths: readonly string[],
  ): Promise<Map<string, { text: string; sha: string }>> {
    const found = new Map<string, { text: string; sha: string }>();
    for (const path of paths)
      try {
        const file = await client.file(fullName, path, branch);
        found.set(path, { text: file.text, sha: file.sha });
      } catch (error) {
        if (!(error instanceof GitHubError && error.status === 404))
          throw error;
      }
    return found;
  }

  /** How the repository's copy compares with what Studio would write now. */
  async function status(projectId: string): Promise<HarnessStatus> {
    const files = buildHarnessFiles(await collect(projectId));
    const missingSkills = await missingBuiltinSkills(projectId);
    const where = await target(projectId);
    if (!where)
      return {
        repository: null,
        branch: null,
        files: files.length,
        missing: [],
        edited: [],
        outdated: false,
        missingBuiltinSkills: missingSkills,
        state: 'noRepository',
      };
    const present = await readRepository(
      where.client,
      where.fullName,
      where.branch,
      files.map((f) => f.path),
    );
    const manifestPresent = present.has(`${HARNESS_DIR}/manifest.json`);
    const drift = driftOf(
      files,
      new Map([...present].map(([path, file]) => [path, file.text])),
    );
    const clean =
      drift.missing.length === 0 &&
      drift.edited.length === 0 &&
      !drift.outdated;
    return {
      repository: where.fullName,
      branch: where.branch,
      files: files.length,
      ...drift,
      missingBuiltinSkills: missingSkills,
      state: !manifestPresent ? 'notExported' : clean ? 'inSync' : 'drifted',
    };
  }

  /**
   * Opens a pull request that writes the files. Secrets are looked for first: when any text matches, nothing is sent and the
   * count and file names are said, never the text.
   */
  async function exportToRepository(
    projectId: string,
  ): Promise<{ number: number; url: string; files: number }> {
    const files: HarnessFile[] = buildHarnessFiles(await collect(projectId));
    const scan = scanHarnessFiles(files);
    if (scan.count > 0)
      throw new HarnessExportError(
        'SECRETS_FOUND',
        `${scan.count} text(s) look like secrets in ${scan.paths.join(', ')}; no pull request was opened.`,
        { count: scan.count, paths: scan.paths },
      );
    const where = await target(projectId);
    if (!where)
      throw new HarnessExportError(
        'NO_REPOSITORY',
        'The project has no repository: link one first.',
      );
    const { client, fullName, branch: base } = where;
    const present = await readRepository(client, fullName, base, [
      ...files.map((f) => f.path),
      'AGENTS.md',
    ]);
    const changed = files.filter(
      (f) => present.get(f.path)?.text !== f.content,
    );
    const agentsMd = present.get('AGENTS.md');
    const indexed = agentsMd ? addIndexRow(agentsMd.text) : null;
    if (changed.length === 0 && !indexed)
      throw new HarnessExportError(
        'NOTHING_TO_EXPORT',
        'The repository already has what Studio would write.',
      );
    const stamp = new Date().toISOString().slice(0, 10);
    const branch = `ds-harness/${stamp}-${Date.now().toString(36)}`;
    try {
      await client.createBranch(
        fullName,
        branch,
        await client.branchHead(fullName, base),
      );
      for (const file of changed)
        await client.putFile(fullName, {
          path: file.path,
          content: file.content,
          message: `chore(harness): write ${file.path}`,
          branch,
          ...(present.get(file.path)?.sha
            ? { sha: present.get(file.path)!.sha }
            : {}),
        });
      if (indexed && agentsMd)
        await client.putFile(fullName, {
          path: 'AGENTS.md',
          content: indexed,
          message: 'chore(harness): index the harness rules',
          branch,
          sha: agentsMd.sha,
        });
      const pull = await client.createPull(fullName, {
        title: 'chore(harness): write the rules Studio keeps for this project',
        head: branch,
        base,
        body: `Dương Sinh Studio writes ${changed.length} file(s) under \`${HARNESS_DIR}/\` and \`.agents/rules/ds-harness.md\`${indexed ? ', and adds one row to the Index of `AGENTS.md`' : ''}. Skills, lessons, playbooks and default criteria come from the project; review them like code. Nothing is written to \`.agents/skills/\`.`,
        draft: false,
      });
      return { number: pull.number, url: pull.url, files: changed.length };
    } catch (error) {
      if (error instanceof GitHubError)
        throw new HarnessExportError('HOST_REFUSED', error.message, {
          status: error.status,
        });
      throw error;
    }
  }

  /**
   * The other half of the export (plan S, S5): the lessons an agent added to `.nb-studio/harness/lessons.md` in a pull
   * request that was merged. Each lesson Studio does not know (by the hash of its rule) becomes a lesson proposed by an
   * agent and waits for a person; nothing is applied by itself. Returns how many were proposed.
   */
  async function importMergedLessons(input: {
    readonly issueId: string;
    readonly pullRequestId: string;
    readonly number: number;
    readonly baseBranch: string;
  }): Promise<number> {
    if (!deps.lessons) return 0;
    const conn = deps.conn();
    const issue = await conn.query
      .selectFrom('pmIssues')
      .select('projectId')
      .where('id', '=', input.issueId)
      .executeTakeFirst();
    if (!issue?.projectId) return 0;
    const projectId = str(issue.projectId);
    const files = await deps.git().pullFiles(input.pullRequestId);
    const lessonsPath = `${HARNESS_DIR}/lessons.md`;
    if (!files.includes(lessonsPath)) return 0;
    const where = await target(projectId);
    if (!where) return 0;
    let text: string;
    try {
      text = (
        await where.client.file(where.fullName, lessonsPath, input.baseBranch)
      ).text;
    } catch (error) {
      if (error instanceof GitHubError && error.status === 404) return 0;
      throw error;
    }
    const known = new Set(
      (
        await conn.query
          .selectFrom('dsLessons')
          .select('rule')
          .where((eb) =>
            eb.or([
              eb('projectId', '=', projectId),
              eb('projectId', 'is', null),
            ]),
          )
          .execute()
      ).map((row) => lessonHash(str(row.rule))),
    );
    // Ten at most from one pull request: a person reads each before it counts.
    const fresh = unknownLessons(text, known).slice(0, 10);
    for (const lesson of fresh)
      await deps.lessons().proposeLesson({
        projectId,
        issueId: input.issueId,
        mistake: lesson.mistake || `Thêm trong pull request #${input.number}.`,
        rule: lesson.rule,
        tag: lesson.tag,
        target: 'knowledge',
        proposedByType: 'agent',
        proposedById: null,
      });
    return fresh.length;
  }

  return { collect, status, exportToRepository, importMergedLessons };
}

export type HarnessExportService = ReturnType<
  typeof createHarnessExportService
>;
