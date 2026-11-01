import type { Application } from '@nocobase/app-server/application';
import { jobExecutorServiceToken } from '@nocobase/app-server/jobs';
import {
  createSecretsTableStore,
  secretsServiceToken,
} from '@nocobase/app-server/secrets';
import {
  agentsToken,
  type RepoAccessProvider,
} from '@nocobase/app-plugin-agents/server/tokens';
import {
  projectsStatusEventsToken,
  projectsToken,
  type Projects,
} from '@nocobase/app-plugin-projects/server/tokens';
import {
  BLOCKED_STATUS,
  DONE_STATUS,
  IN_PROGRESS_STATUS,
  IN_REVIEW_STATUS,
} from '@nocobase/app-plugin-projects/shared/statuses';
import { userManagementServiceToken } from '@nocobase/app-plugin-users/server/tokens';
import { databaseManagerToken, type DatabaseConnection } from '@nocobase/db';
import type { ScheduleExecutor } from '@nocobase/jobs';
import {
  ServiceProvider,
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';
import { ISSUE_SUBJECT } from '../agents/ids.js';
import {
  CONNECTIONS,
  PR_MERGED_EVENT,
  REPOSITORIES,
  TOKEN_SECRET_PURPOSE,
  createGitService,
  type GitService,
} from '../git/service.js';

export const gitServiceToken: ServiceToken<GitService> =
  createServiceToken<GitService>('app/git');

/** How often the poll looks for repositories due; each repository keeps its own `pollSeconds`. */
const POLL_EVERY_MS = 30_000;
/** The username GitHub takes with a token over HTTPS. */
const GITHUB_USERNAME = 'x-access-token';

/**
 * The repositories of the issue's project that `run` checks out, with their connections' tokens. A token connection's
 * token is a fine-grained PAT: it cannot be cut per run or revoked when the run ends, so the credential is the
 * connection's own, limited to the repositories that token reaches (`docs/chenh-lech-upstream.md`, section 11).
 */
export function createRepoAccess(deps: {
  readonly git: () => GitService;
  readonly projects: () => Projects;
  readonly connection: () => DatabaseConnection;
  readonly person: (
    conn: DatabaseConnection,
    userId: string,
  ) => Promise<{ name: string; email: string } | null>;
}): RepoAccessProvider {
  const projectOf = async (
    conn: DatabaseConnection,
    subject: { readonly kind: string; readonly id: string },
  ): Promise<string | null> => {
    if (subject.kind !== ISSUE_SUBJECT) return null;
    return (
      (await deps.projects().issueContext.contextFor(conn, subject.id))?.project
        ?.id ?? null
    );
  };
  const expiresAt = () =>
    new Date(Date.now() + deps.git().credentialTtlMs).toISOString();

  return {
    key: 'duongsinh-studio/github-token',
    async forRun(conn, context) {
      const { run, agent } = context.claim;
      const projectId = await projectOf(conn, run.subject);
      if (!projectId) return null;
      const found = await deps.git().credentialsFor(
        conn,
        projectId,
        context.repos.map((repo) => repo.url),
      );
      if (found.length === 0) return null;
      const author = await deps.person(conn, run.requestedByUserId);
      return {
        ...(author ? { author } : {}),
        trailers: [
          `Co-Authored-By: ${agent.name} <agent-${agent.id}@agents.duongsinh-studio.invalid>`,
        ],
        ...(context.onDemand
          ? { onDemand: found.map((repo) => repo.url) }
          : {
              credentials: found.map((repo) => ({
                url: repo.url,
                username: GITHUB_USERNAME,
                password: repo.token,
                expiresAt: expiresAt(),
              })),
            }),
        ...(context.tools
          ? {
              tools: [
                {
                  bin: 'gh',
                  url: found[0].url,
                  env: { GH_TOKEN: { credential: 'password' } },
                },
              ],
            }
          : {}),
      };
    },
    async issue(request) {
      const conn = deps.connection();
      const projectId = await projectOf(conn, request.run.subject);
      if (!projectId) return null;
      const [found] = await deps
        .git()
        .credentialsFor(conn, projectId, [request.url]);
      return found
        ? {
            username: GITHUB_USERNAME,
            password: found.token,
            expiresAt: expiresAt(),
          }
        : null;
    },
  };
}

/**
 * Git hosting (S3 part 1): the git service, the sealed tokens' store, the `ds.pr.merged` status event, the run
 * credentials (`repoAccess`) and the poll that reads pull requests from GitHub.
 */
export default class GitProvider extends ServiceProvider<Application> {
  readonly name = 'app/git';
  private releases: (() => void)[] = [];
  private executor?: ScheduleExecutor;

  override register(): void {
    const { container } = this.app;
    container.singleton(gitServiceToken, () =>
      createGitService({
        database: container.resolve(databaseManagerToken),
        secrets: () => container.resolve(secretsServiceToken),
        projects: () =>
          container.has(projectsToken)
            ? container.resolve(projectsToken)
            : null,
      }),
    );
    if (container.has(secretsServiceToken))
      container.resolve(secretsServiceToken).registerStore(
        createSecretsTableStore({
          name: 'duongsinh-studio/git-connections',
          table: CONNECTIONS,
          columns: [
            {
              column: 'tokenSealed',
              purpose: TOKEN_SECRET_PURPOSE,
              aad: (row) => [String(row.id)],
            },
          ],
          connection: () =>
            container.resolve(databaseManagerToken).connection(),
        }),
      );
  }

  override async boot(): Promise<void> {
    const { container } = this.app;
    if (container.has(projectsStatusEventsToken))
      this.releases.push(
        container.resolve(projectsStatusEventsToken).add({
          key: PR_MERGED_EVENT,
          from: [IN_PROGRESS_STATUS, IN_REVIEW_STATUS, BLOCKED_STATUS],
          to: DONE_STATUS,
        }),
      );
    if (container.has(agentsToken) && container.has(projectsToken))
      this.releases.push(
        container.resolve(agentsToken).repoAccess.register(
          createRepoAccess({
            git: () => container.resolve(gitServiceToken),
            projects: () => container.resolve(projectsToken),
            connection: () =>
              container.resolve(databaseManagerToken).connection(),
            person: async (conn, userId) => {
              try {
                const user = await container
                  .resolve(userManagementServiceToken)
                  .withConnection(conn)
                  .get(userId);
                return user.email
                  ? { name: user.name, email: user.email }
                  : null;
              } catch {
                return null;
              }
            },
          }),
        ),
      );
  }

  override async start(): Promise<void> {
    // Command hosts (`pnpm nocobase …`) boot providers too; only the serving process polls.
    if (this.app.consoleLogStream === 'stderr') return;
    const { container } = this.app;
    const database = container.resolve(databaseManagerToken);
    this.executor = container
      .resolve(jobExecutorServiceToken)
      .getScheduleExecutor('duongsinh-studio');
    await this.executor.addJob({
      name: 'git-poll',
      options: { every: POLL_EVERY_MS },
      payload: {},
      execute: async () => {
        // An application started without this application's migrations has no git tables (see project-manager.ts).
        if (!(await database.collections().getPhysical(REPOSITORIES))) return;
        await container.resolve(gitServiceToken).syncDue();
      },
    });
    await this.executor.setup();
  }

  override async shutdown(): Promise<void> {
    await this.executor?.shutdown();
    this.executor = undefined;
    for (const release of this.releases.splice(0)) release();
  }
}
