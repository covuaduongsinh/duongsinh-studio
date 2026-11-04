import type { Application } from '@nocobase/app-server/application';
import { i18nToken } from '@nocobase/app-server/i18n';
import {
  agentsToken,
  commandRef,
  type ClaimContext,
  type SubjectAssembly,
  type SubjectBinding,
  type SubjectDir,
  type SubjectFacts,
  type Tx as AgentsTx,
} from '@nocobase/app-plugin-agents/server/tokens';
import type { Run } from '@nocobase/app-plugin-agents/shared/runs';
import {
  projectsAccessToken,
  projectsToken,
  type CommentWriter,
  type IssueContext,
  type Projects,
  type ProjectsTx,
  type Viewer,
} from '@nocobase/app-plugin-projects/server/tokens';
import { APP_NS } from '@nocobase/i18n';
import type { DatabaseConnection } from '@nocobase/db';
import { ServiceProvider } from '@nocobase/service-provider';
import {
  AGENT_KIND,
  ISSUE_SUBJECT,
  PROJECT_MANAGER_ID,
  ISSUE_BRANCH_PREFIX,
  RUN_FINISHED_MESSAGE,
  appText,
} from '../agents/ids.js';

/** Translates a key of the application's namespace, with `{{name}}` parameters. */
export type Translate = (
  key: string,
  params: Readonly<Record<string, string>>,
) => string;

/** The comments of an issue the brief carries are capped so one long thread cannot crowd out the task. */
const COMMENT_CHARS = 4_000;
const SUMMARY_CHARS = 20_000;
/** `issueQueries.summaries` takes at most this many references at a time. */
const SUMMARY_BATCH = 100;

function clip(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

/**
 * The comment a run leaves on its issue when it ends: a headline in the application's language (the fallback any
 * reader sees) and the `ds.run.finished` message the issue page words in the reader's own. Nothing for work withdrawn
 * before it started, such as queued work an issue leaving `in_progress` took back.
 */
export function runFinishedComment(
  run: Run,
  t: Translate,
): {
  readonly content: string;
  readonly message: {
    readonly type: string;
    readonly params: Readonly<Record<string, string>>;
  };
} | null {
  if (run.status === 'cancelled' && run.startedAt === null) return null;
  if (
    run.status !== 'completed' &&
    run.status !== 'failed' &&
    run.status !== 'cancelled'
  )
    return null;
  const reason = run.status === 'failed' ? (run.failureReason ?? '') : '';
  const headline = t(`studioAgents.runFinished.${run.status}`, {
    runId: run.id,
    reason,
  });
  const summary = run.summary?.trim();
  return {
    content: summary
      ? `${headline}\n\n${clip(summary, SUMMARY_CHARS)}`
      : headline,
    message: {
      type: RUN_FINISHED_MESSAGE,
      params: {
        runId: run.id,
        outcome: run.status,
        agentId: run.agentId,
        ...(reason ? { reason } : {}),
      },
    },
  };
}

/**
 * Writes `runFinishedComment` on the run's issue inside the transaction that ended the run, as the run's agent. The
 * comment wakes nobody (`trigger: false`). It is written in a savepoint: an issue that cannot take it (deleted since,
 * say) loses the comment, never the end of the run. The projects plugin's events are published once the run's
 * transaction commits.
 */
export async function postRunFinished(
  deps: {
    readonly comments: Pick<CommentWriter, 'post'>;
    readonly publish: (event: Parameters<ProjectsTx['emit']>[0]) => void;
    readonly exists: (
      conn: DatabaseConnection,
      issueId: string,
    ) => Promise<boolean>;
    readonly translate: () => Promise<Translate>;
  },
  tx: AgentsTx,
  run: Run,
): Promise<void> {
  if (run.subject.kind !== ISSUE_SUBJECT) return;
  const comment = runFinishedComment(run, await deps.translate());
  if (!comment || !(await deps.exists(tx.conn, run.subject.id))) return;
  try {
    await tx.conn.transaction((conn) =>
      deps.comments.post(
        { type: AGENT_KIND, id: run.agentId },
        run.subject.id,
        { content: comment.content },
        {
          outer: {
            conn,
            emit: (event) => conn.afterCommit(() => deps.publish(event)),
          },
          trigger: false,
          message: comment.message,
          origin: { runId: run.id },
        },
      ),
    );
  } catch (error) {
    console.error(
      `Dương Sinh Studio could not comment the end of run ${run.id} on issue ${run.subject.id}.`,
      error,
    );
  }
}

function repoName(url: string): string {
  const last = url.replace(/\/+$/, '').split(/[/:]/).pop() ?? '';
  const name = last.replace(/\.git$/, '').replace(/[^A-Za-z0-9._-]/g, '-');
  return name || 'repo';
}

/** The project's working directories as a run checks them out: each repository on the issue's branch. */
function dirsOf(issue: IssueContext): SubjectDir[] {
  const dirs: SubjectDir[] = [];
  const used = new Set<string>();
  for (const dir of issue.project?.repos ?? []) {
    const extra = {
      ...(dir.label ? { name: dir.label } : {}),
      ...(dir.initPrompt ? { initPrompt: dir.initPrompt } : {}),
    };
    if (dir.type === 'gitRepo' && dir.url) {
      const base = repoName(dir.url);
      let path = base;
      for (let n = 2; used.has(path); n += 1) path = `${base}-${n}`;
      used.add(path);
      dirs.push({
        kind: 'repo',
        url: dir.url,
        defaultBranch: dir.defaultRef ?? 'main',
        branch: `${ISSUE_BRANCH_PREFIX}${issue.identifier}`,
        path,
        ...extra,
      });
    } else if (dir.type === 'directory' && dir.runnerId && dir.path) {
      dirs.push({
        kind: 'directory',
        path: dir.path,
        runnerId: dir.runnerId,
        ...extra,
      });
    }
  }
  return dirs;
}

function contextOf(issue: IssueContext): string {
  const lines = [
    `# ${issue.identifier} ${issue.title}`,
    '',
    `- Status: ${issue.status.key}`,
    `- Moves you may make now: ${issue.allowedTransitions.join(', ') || 'none'}`,
    `- Priority: ${issue.priority}`,
    `- Owner: ${issue.owner.name}`,
    ...(issue.project ? [`- Project: ${issue.project.name}`] : []),
    ...(issue.labels.length ? [`- Labels: ${issue.labels.join(', ')}`] : []),
    ...(issue.dueDate ? [`- Due: ${issue.dueDate}`] : []),
    ...(issue.parent
      ? [`- Parent: ${issue.parent.identifier} ${issue.parent.title}`]
      : []),
    '',
    '## Description',
    '',
    issue.description.trim() || '(none)',
  ];
  if (issue.children.length > 0)
    lines.push(
      '',
      '## Sub-issues',
      '',
      ...issue.children.map(
        (child) => `- ${child.identifier} ${child.title} (${child.status})`,
      ),
    );
  if (issue.attachments.length > 0)
    lines.push(
      '',
      '## Files',
      '',
      ...issue.attachments.map((file) => `- ${file.filename} (${file.id})`),
    );
  if (issue.comments.length > 0) {
    lines.push('', '## Latest comments', '');
    for (const comment of issue.comments)
      lines.push(
        `### ${comment.author.name ?? comment.author.type} · ${comment.createdAt} · ${comment.id}${comment.parentId ? ` (reply to ${comment.parentId})` : ''}`,
        '',
        clip(comment.content, COMMENT_CHARS),
        '',
      );
  }
  return lines.join('\n');
}

function assemblyOf(issue: IssueContext, claim: ClaimContext): SubjectAssembly {
  const coordinating = claim.agent.id === PROJECT_MANAGER_ID;
  const comment = commandRef(claim.cli, 'issue comment add');
  const readOnly = claim.inputs.some((input) => {
    if (typeof input.text === 'string' && /mode:\s*read-only/i.test(input.text)) {
      return true;
    }
    const payload = input.payload as Record<string, unknown> | null | undefined;
    return Boolean(
      payload && (payload.mode === 'read-only' || payload.readOnly === true),
    );
  });
  return {
    subject: {
      key: issue.identifier,
      title: issue.title,
      url: issue.url,
      noun: 'issue',
    },
    guidance: {
      rules: [
        `Report on the issue with ${comment}: exactly one reply per step, in the thread that handed the step to you.`,
        coordinating
          ? `Hand steps to agents by mentioning them in a comment; move the issue only between in_progress, blocked and in_review (${commandRef(claim.cli, 'issue update')}).`
          : 'Never change the issue’s status or assign it; the project manager does.',
        'Write every comment and your final run summary in Vietnamese; keep commands, paths and identifiers as they are.',
      ],
      whenBlocked: `Say what is missing in one reply with ${comment} and end your turn.`,
    },
    task: coordinating
      ? `You coordinate ${issue.identifier}. Read what changed below, decide the next step and hand it over, or prepare the delivery when the work is ready for acceptance.`
      : `Do the step on ${issue.identifier} that the newest comment mentioning you hands over, then reply once in its thread.`,
    context: contextOf(issue),
    turn: {
      prompt: claim.inputs
        .map((input) => `- ${input.actor.name}: ${input.text}`)
        .join('\n'),
    },
    data: {
      issueId: issue.id,
      identifier: issue.identifier,
      status: issue.status.key,
      allowedTransitions: [...issue.allowedTransitions],
    },
    dirs: coordinating ? [] : dirsOf(issue),
    scopes: [],
    // The project manager checks nothing out, so it never waits for the issue's working directory.
    ...(coordinating ? { workspaceKey: `pm-${issue.identifier}` } : {}),
    ...(readOnly ? { readOnly: true } : {}),
  };
}

/** The `issue` subject: runs work on the projects plugin's issues. */
export function createIssueSubject(deps: {
  readonly projects: Projects;
  readonly viewerOf: (userId: string) => Promise<Viewer | null>;
  readonly translate: () => Promise<Translate>;
}): SubjectBinding {
  const { projects } = deps;
  return {
    kind: ISSUE_SUBJECT,
    title: appText('studioAgents.subjects.issue'),
    path: '/issues/{id}',
    triggers: {
      statusChange: appText('studioAgents.triggers.statusChange'),
      assigned: appText('studioAgents.triggers.assigned'),
      comment: appText('studioAgents.triggers.comment'),
      mention: appText('studioAgents.triggers.mention'),
      unblocked: appText('studioAgents.triggers.unblocked'),
    },
    responsibleUserId: async (conn, subjectId) =>
      (await projects.issueContext.contextFor(conn, subjectId))?.owner.id ??
      null,
    context: {
      assemble: async (conn, claim) => {
        const issue = await projects.issueContext.contextFor(
          conn,
          claim.run.subject.id,
          { kind: AGENT_KIND },
        );
        if (!issue)
          throw new Error(
            `Issue ${claim.run.subject.id} does not exist any more.`,
          );
        return assemblyOf(issue, claim);
      },
    },
    sink: {
      onRunFinished: (tx, run) =>
        postRunFinished(
          {
            comments: projects.comments,
            publish: (event) => projects.events.emit(event),
            exists: async (conn, issueId) =>
              (await projects.issueContext.describe(conn, issueId)) !==
              undefined,
            translate: deps.translate,
          },
          tx,
          run,
        ),
    },
    reports: {
      // Outside any transaction (the usage reports read on their own connection), so the viewer's permissions may be read.
      describe: async (_conn, userId, ids) => {
        const facts = new Map<string, SubjectFacts>();
        const viewer = ids.length > 0 ? await deps.viewerOf(userId) : null;
        if (!viewer) return facts;
        for (let at = 0; at < ids.length; at += SUMMARY_BATCH)
          for (const issue of await projects.issueQueries.summaries(
            viewer,
            ids.slice(at, at + SUMMARY_BATCH),
          ))
            facts.set(issue.id, {
              label: `${issue.identifier} ${issue.title}`,
              visible: true,
              group: null,
            });
        return facts;
      },
    },
  };
}

/** Registers the `issue` subject with the agents plugin. */
export default class IssueSubjectProvider extends ServiceProvider<Application> {
  readonly name = 'app/issue-subject';
  private release?: () => void;

  override async boot(): Promise<void> {
    const { container } = this.app;
    if (!container.has(agentsToken) || !container.has(projectsToken)) return;
    const translate = async (): Promise<Translate> => {
      const i18n = container.resolve(i18nToken);
      const locale = i18n.getDefaultLocale();
      await i18n.ensureLocaleLoaded(locale);
      const t = i18n.getFixedT(APP_NS, locale);
      return (key, params) => t(key, params);
    };
    this.release = container.resolve(agentsToken).subjects.register(
      createIssueSubject({
        projects: container.resolve(projectsToken),
        viewerOf: async (userId) => {
          const access = container.resolve(projectsAccessToken);
          if (!access.permissionsOfUser) return null;
          return {
            userId,
            actor: { type: 'user', id: userId },
            permissions: await access.permissionsOfUser(userId),
          };
        },
        translate,
      }),
    );
  }

  override async shutdown(): Promise<void> {
    this.release?.();
    this.release = undefined;
  }
}
