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
  PROJECT_SCOPE,
  ISSUE_BRANCH_PREFIX,
  RUN_FINISHED_MESSAGE,
  appText,
} from '../agents/ids.js';
import { num, str } from '../git/rows.js';
import { maskSecrets } from '../security/secret-patterns.js';
import { parsePlaybookInvocations } from '../playbooks/parser.js';
import {
  findPlaybookDefinition,
  applyPlaybookToIssue,
} from '../playbooks/service.js';

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
    maskSecrets(issue.description.trim()) || '(none)',
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
        maskSecrets(clip(comment.content, COMMENT_CHARS)),
        '',
      );
  }
  return lines.join('\n');
}

/** What `agents.runs.recentSummaries` answers of an earlier run. */
interface RecentRunSummary {
  readonly status: string;
  readonly finishedAt: string | null;
  readonly summary: string | null;
}

export const AUTOPILOT_ON_RULE =
  'Autopilot is on for this project: when the work is ready for acceptance, move it to in_review with the delivery report and leave needsYou empty, so Studio merges it. Write needsYou only for a decision a person really has to make.';

/** Whether autopilot would merge this project's work now. Read in the claim's transaction. */
async function autopilotOn(
  conn: DatabaseConnection,
  projectId: string,
): Promise<boolean> {
  const settings = await conn.query
    .selectFrom('dsAutopilotSettings')
    .select(['enabled', 'pausedReason'])
    .where('projectId', '=', projectId)
    .executeTakeFirst();
  return Boolean(settings?.enabled) && !settings?.pausedReason;
}

/**
 * Said only to a read-only turn. It also keeps a later turn that changes code out of that turn's tool session: a
 * resumed session keeps the system prompt it started with, the runner's "this step only reads" workspace notes
 * included, and the agents plugin resumes only a session whose brief has the same system layer (its fingerprint).
 * Without this line both turns had the same one, and the changing turn refused to write (DS-60, 2026-11-10).
 */
export const READ_ONLY_TURN_RULE =
  'This turn is read-only: change no tracked file, commit nothing and push nothing. A later turn that changes code starts its own session.';

/** A turn that may read but not change anything: a review or an investigation. */
function isReadOnlyTurn(claim: ClaimContext): boolean {
  return claim.inputs.some((input) => {
    if (
      typeof input.text === 'string' &&
      /mode:\s*read-only/i.test(input.text)
    ) {
      return true;
    }
    const payload = input.payload as Record<string, unknown> | null | undefined;
    return Boolean(
      payload && (payload.mode === 'read-only' || payload.readOnly === true),
    );
  });
}

/** What the project manager's earlier turns on this issue ended with, for picking up work that stood still. */
function handOverNotes(summaries: readonly RecentRunSummary[]): string {
  const lines = summaries
    .filter((run) => run.summary)
    .map(
      (run) =>
        `- ${run.finishedAt ?? ''} (${run.status}): ${run.summary ?? ''}`,
    );
  return lines.length > 0
    ? ['## Các lượt trước của bạn trên issue này', '', ...lines].join('\n')
    : '';
}

function assemblyOf(
  issue: IssueContext,
  claim: ClaimContext,
  extras: {
    readonly autopilotOn: boolean;
    readonly handOver: string;
    readonly criteria: readonly {
      readonly id: string;
      readonly text: string;
      readonly checkKind: string;
      readonly checkValue: string | null;
    }[];
    readonly latestVerificationSummary?: string | null;
    readonly playbookRules?: readonly string[];
  },
): SubjectAssembly {
  const coordinating = claim.agent.id === PROJECT_MANAGER_ID;
  const comment = commandRef(claim.cli, 'issue comment add');
  const readOnly = isReadOnlyTurn(claim);
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
        ...(extras.playbookRules ?? []),
        ...(coordinating && extras.autopilotOn ? [AUTOPILOT_ON_RULE] : []),
        ...(readOnly ? [READ_ONLY_TURN_RULE] : []),
        ...(readOnly && extras.criteria.length > 0
          ? [
              `Checklist tiêu chí nghiệm thu bắt buộc đánh giá khi review: ${extras.criteria
                .map(
                  (c, i) =>
                    `${i + 1}. [id: ${c.id}] [${c.checkKind}] ${c.text}${c.checkValue ? ` (${c.checkValue})` : ''}`,
                )
                .join('; ')}`,
              'Nộp phiếu review: ds-studio review submit <PR_ID> --verdict <approve|changes> --head <sha> --must-fix <N> --should-fix <M> --summary "<tóm tắt>". Chấm từng tiêu chí vào criteriaChecks. Tuyệt đối không nộp verdict = approve nếu có bất kỳ tiêu chí nào chưa đạt (passed = false).',
            ]
          : []),
        ...(readOnly && extras.latestVerificationSummary
          ? [extras.latestVerificationSummary]
          : []),
        ...(coordinating && extras.criteria.length === 0
          ? [
              'Việc chưa có tiêu chí nghiệm thu: đề xuất bằng ds-studio criteria propose trước khi giao code',
            ]
          : extras.criteria.length > 0 && !readOnly
            ? [
                `Tiêu chí nghiệm thu công việc: ${extras.criteria
                  .map(
                    (c, i) =>
                      `${i + 1}. [${c.checkKind}] ${c.text}${c.checkValue ? ` (${c.checkValue})` : ''}`,
                  )
                  .join('; ')}`,
              ]
            : []),
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
      ...(extras.handOver ? { fresh: extras.handOver } : {}),
    },
    data: {
      issueId: issue.id,
      identifier: issue.identifier,
      status: issue.status.key,
      allowedTransitions: [...issue.allowedTransitions],
    },
    dirs: coordinating ? [] : dirsOf(issue),
    // The project's skills and variables reach both the coordinator and whoever it hands work to.
    scopes: issue.project
      ? [{ scope: PROJECT_SCOPE, scopeId: issue.project.id }]
      : [],
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
  readonly recentSummaries: (
    conn: DatabaseConnection,
    key: {
      readonly agentId: string;
      readonly subjectKind: string;
      readonly subjectId: string;
    },
    exceptRunId: string,
  ) => Promise<readonly RecentRunSummary[]>;
}): SubjectBinding {
  const { projects } = deps;
  return {
    kind: ISSUE_SUBJECT,
    // A review stays independent of the work it reviews; everything else keeps the ordinary reuse.
    sessionPolicy: (claim) => (isReadOnlyTurn(claim) ? 'fresh' : 'reuse'),
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
        const coordinating = claim.agent.id === PROJECT_MANAGER_ID;
        const readOnly = isReadOnlyTurn(claim);

        const fullText = [
          issue.description,
          ...issue.comments.map((c) => c.content),
        ].join('\n');
        const invocations = parsePlaybookInvocations(fullText);
        const playbookRules: string[] = [];
        for (const inv of invocations) {
          const pb = findPlaybookDefinition(inv.slug);
          if (pb) {
            await applyPlaybookToIssue(conn, {
              issueId: claim.run.subject.id,
              slug: inv.slug,
              params: inv.params,
            });
            playbookRules.push(
              `Playbook đang áp dụng [!${pb.slug} - ${pb.name}]: ${pb.description}\nHướng dẫn quy trình:\n${pb.instructions}`,
            );
          } else {
            playbookRules.push(
              `Cảnh báo: Playbook "!${inv.slug}" không tồn tại. Danh sách playbook khả dụng: !nang-template, !tao-app-nocobase, !nhap-lark, !deploy-dokploy.`,
            );
          }
        }

        const criteriaRows = await conn.query
          .selectFrom('dsIssueCriteria')
          .select(['id', 'text', 'checkKind', 'checkValue'])
          .where('issueId', '=', claim.run.subject.id)
          .orderBy('position', 'asc')
          .execute();
        const criteria = criteriaRows.map((r) => ({
          id: str(r.id),
          text: str(r.text),
          checkKind: str(r.checkKind),
          checkValue: r.checkValue != null ? str(r.checkValue) : null,
        }));
        let latestVerificationSummary: string | null = null;
        if (readOnly) {
          const verifRow = await conn.query
            .selectFrom('dsVerifications')
            .selectAll()
            .where('issueId', '=', claim.run.subject.id)
            .orderBy('createdAt', 'desc')
            .executeTakeFirst();
          if (verifRow) {
            const verifId = str(verifRow.id);
            const items = await conn.query
              .selectFrom('dsVerificationItems')
              .selectAll()
              .where('verificationId', '=', verifId)
              .execute();
            const passedCount = items.filter(
              (it) => it.result === 'pass',
            ).length;
            latestVerificationSummary = `Kết quả kiểm chứng mới nhất (lượt ${num(verifRow.attempt)}): ${str(verifRow.result)} (head: ${str(verifRow.headSha).slice(0, 7)}, đạt ${passedCount}/${items.length} tiêu chí)`;
          }
        }
        return assemblyOf(issue, claim, {
          criteria,
          latestVerificationSummary,
          playbookRules,
          autopilotOn:
            coordinating && issue.project
              ? await autopilotOn(conn, issue.project.id)
              : false,
          handOver: coordinating
            ? handOverNotes(
                await deps.recentSummaries(
                  conn,
                  {
                    agentId: claim.agent.id,
                    subjectKind: ISSUE_SUBJECT,
                    subjectId: claim.run.subject.id,
                  },
                  claim.run.id,
                ),
              )
            : '',
        });
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
    // A run no runner picks up within a day fails as `queuedExpired` and reaches the failed-run card and the Inbox.
    queuedExpiryMs: QUEUED_EXPIRY_MS,
    // A done or cancelled issue's working directory is no longer needed: runners tidy it up (M1.1).
    workspaces: { settled: settledIssues },
    reports: {
      // Outside any transaction (the usage reports read on their own connection), so the viewer's permissions may be read.
      describe: async (_conn, userId, ids) => {
        const facts = new Map<string, SubjectFacts>();
        const viewer = ids.length > 0 ? await deps.viewerOf(userId) : null;
        if (!viewer) return facts;
        for (let at = 0; at < ids.length; at += SUMMARY_BATCH)
          for (const issue of (
            await projects.reports.describe(
              viewer,
              ids.slice(at, at + SUMMARY_BATCH),
            )
          ).values())
            if (issue.visible)
              facts.set(issue.id, {
                label: `${issue.identifier} ${issue.title}`,
                visible: true,
                group: issue.project,
              });
        return facts;
      },
    },
  };
}

/** How long a run on an issue may wait for a runner (M1.2): above autopilot's longest backoff (2 hours). */
export const QUEUED_EXPIRY_MS = 24 * 60 * 60 * 1000;

/** The statuses after which an issue's work is over (the keys of `@nocobase/app-plugin-projects`' fixed statuses). */
const SETTLED_STATUSES = ['done', 'cancelled'] as const;

/**
 * Of `ids`, the issues whose work is over. Runners remove the working directory they keep for such an issue
 * (`SubjectWorkspaces.settled`), whatever it still holds: a cancelled issue's branch that was never pushed is gone with it.
 * An id it does not know is left out, so its directory is kept.
 */
export async function settledIssues(
  conn: DatabaseConnection,
  ids: readonly string[],
): Promise<ReadonlySet<string>> {
  if (ids.length === 0) return new Set();
  const rows = await conn.query
    .selectFrom('pmIssues')
    .select('id')
    .where('id', 'in', [...ids])
    .where('statusKey', 'in', [...SETTLED_STATUSES])
    .execute();
  return new Set(rows.map((row) => String(row.id)));
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
        recentSummaries: (conn, key, exceptRunId) =>
          container
            .resolve(agentsToken)
            .runs.recentSummaries(conn, key, exceptRunId),
      }),
    );
  }

  override async shutdown(): Promise<void> {
    this.release?.();
    this.release = undefined;
  }
}
