import {
  authenticationToken,
  isServiceAccount,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization';
import { runIdentityOf } from '@nocobase/app-plugin-agents/server/tokens';
import {
  DomainError,
  projectsAccessToken,
  projectsToken,
  type Projects,
  type Viewer,
} from '@nocobase/app-plugin-projects/server/tokens';
import type { Application } from '@nocobase/app-server/application';
import {
  ApiError,
  apiErrorResponses,
  apiValidator,
  cliRoute,
  dataResponse,
  defineApiRoutes,
  describeRoute,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { gitServiceToken } from '../providers/git.js';
import { GitError } from '../git/service.js';
import { GitHubError } from '../git/github.js';
import { isSensitive } from '../autopilot/evaluator.js';
import { DEFAULT_SENSITIVE_PATHS } from '../autopilot/evaluator.js';
import { createSummaryCache, summarizeChanges } from '../changes/summary.js';
import { str } from '../git/rows.js';
import { databaseManagerToken } from '@nocobase/db';

type Env = AuthEnv & AuthorizationEnv;
const DOMAIN = 'studio';
const PERSON_ONLY: Record<string, string[]>[] = [
  { cookieAuth: [] },
  { apiKeyAuth: [] },
];

const ChangeSummarySchema = z
  .object({
    pullRequestId: z.string(),
    number: z.number().int(),
    url: z.string(),
    headSha: z.string(),
    files: z.number().int(),
    additions: z.number().int(),
    deletions: z.number().int(),
    groups: z.array(
      z.object({
        directory: z.string(),
        files: z.number().int(),
        additions: z.number().int(),
        deletions: z.number().int(),
      }),
    ),
    sensitive: z.array(z.string()),
    verification: z
      .object({
        result: z.string(),
        headSha: z.string(),
        matchesHead: z.boolean(),
      })
      .nullable(),
  })
  .meta({ ref: 'StudioChangeSummary' });

const RequestChangesBody = z
  .object({ note: z.string().trim().min(1).max(4000) })
  .strict();

const CommentSchema = z
  .object({ commentId: z.string() })
  .meta({ ref: 'StudioRequestedChanges' });

const PullParams = z.object({ pullRequestId: z.string() });

/** What a pull request changes, and a person's request for changes that wakes its author (plan T, T7). */
export const changeSummaryRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const routes = new Hono<Env>();
    const { container } = app;
    const auth = container.resolve(authenticationToken);
    const authz = container.resolve(authorizationToken);
    const projects = (): Projects => container.resolve(projectsToken);

    const viewerOf = async (context: Context<Env>): Promise<Viewer> => {
      const session = context.get('auth');
      if (!session)
        throw new ApiError({
          status: 'UNAUTHENTICATED',
          reason: 'UNAUTHENTICATED',
          domain: DOMAIN,
          message: 'Sign in first.',
        });
      if (
        runIdentityOf(session)?.run ||
        isServiceAccount(session.user) ||
        (await auth.isScopedSession(session, context.req.raw))
      )
        throw new ApiError({
          status: 'PERMISSION_DENIED',
          reason: 'RUN_NOT_ALLOWED',
          domain: DOMAIN,
          message:
            'Branch protection is read by people, not by runs or scoped keys.',
        });
      return {
        userId: session.user.id,
        actor: { type: 'user', id: session.user.id },
        permissions: await container
          .resolve(projectsAccessToken)
          .permissionsOf(context.get('authz').identity),
      };
    };

    const cache = createSummaryCache<ReturnType<typeof summarizeChanges>>(50);
    const conn = () => container.resolve(databaseManagerToken).connection();

    /** The pull request, when the caller may see the issue it belongs to; one with no issue is not shown on any page. */
    const readable = async (context: Context<Env>, id: string) => {
      const viewer = await viewerOf(context);
      let pull;
      try {
        pull = await container.resolve(gitServiceToken).getPullRequest(id);
      } catch (error) {
        if (error instanceof GitError)
          throw new ApiError({
            status: error.status,
            reason: error.reason,
            domain: DOMAIN,
            message: error.message,
          });
        throw error;
      }
      const notFound = new ApiError({
        status: 'NOT_FOUND',
        reason: 'PULL_REQUEST_NOT_FOUND',
        domain: DOMAIN,
        message: `Pull request ${id} not found.`,
      });
      if (!pull.issueId) throw notFound;
      try {
        await projects().issueQueries.visible(viewer, pull.issueId);
      } catch (error) {
        if (error instanceof DomainError) throw notFound;
        throw error;
      }
      return { viewer, pull, issueId: pull.issueId };
    };

    routes.use(
      '/pullRequests/:pullRequestId/changeSummary',
      auth.required({ scopedKeys: true }),
      authz.middleware(),
    );
    routes.use(
      '/pullRequests/:pullRequestId/requestChanges',
      auth.required({ scopedKeys: true }),
      authz.middleware(),
    );

    routes.get(
      '/pullRequests/:pullRequestId/changeSummary',
      describeRoute({
        tags: ['Studio Git'],
        summary: 'Summarize what a pull request changes',
        description:
          'Files, lines added and removed, the changed directories, the files that match the project’s sensitive paths and the latest verification of this head. Read from GitHub once for each head.',
        security: PERSON_ONLY,
        ...cliRoute({ command: 'pr changes' }),
        responses: {
          '200': dataResponse(ChangeSummarySchema),
          ...apiErrorResponses,
        },
      }),
      apiValidator('param', PullParams),
      async (context) => {
        const { pullRequestId } = context.req.valid('param');
        const { pull, issueId } = await readable(context, pullRequestId);
        const git = container.resolve(gitServiceToken);
        const issue = await conn()
          .query.selectFrom('pmIssues')
          .select('projectId')
          .where('id', '=', issueId)
          .executeTakeFirst();
        let patterns: readonly string[] = DEFAULT_SENSITIVE_PATHS;
        if (issue?.projectId) {
          const settings = await conn()
            .query.selectFrom('dsAutopilotSettings')
            .select('sensitivePaths')
            .where('projectId', '=', str(issue.projectId))
            .executeTakeFirst();
          const raw: unknown = settings?.sensitivePaths;
          const parsed: unknown =
            typeof raw === 'string' ? JSON.parse(raw) : raw;
          if (Array.isArray(parsed) && parsed.length > 0)
            patterns = parsed.filter((p): p is string => typeof p === 'string');
        }
        let summary;
        try {
          summary = await cache.get(`${pull.id}:${pull.headSha}`, async () =>
            summarizeChanges(await git.pullFileDetails(pull.id), patterns),
          );
        } catch (error) {
          if (error instanceof GitHubError || error instanceof GitError)
            throw new ApiError({
              status: 'FAILED_PRECONDITION',
              reason: 'GIT_UNAVAILABLE',
              domain: DOMAIN,
              message: error.message,
            });
          throw error;
        }
        const verification = await conn()
          .query.selectFrom('dsVerifications')
          .select(['result', 'headSha'])
          .where('issueId', '=', issueId)
          .orderBy('createdAt', 'desc')
          .executeTakeFirst();
        return context.json({
          data: {
            pullRequestId: pull.id,
            number: pull.number,
            url: pull.url,
            headSha: pull.headSha,
            ...summary,
            // The cache holds the numbers of one head; the sensitive list follows the patterns read now.
            sensitive: summary.sensitive.filter((file) =>
              isSensitive(file, patterns),
            ),
            verification: verification
              ? {
                  result: str(verification.result),
                  headSha: str(verification.headSha),
                  matchesHead: str(verification.headSha) === pull.headSha,
                }
              : null,
          },
        });
      },
    );

    routes.post(
      '/pullRequests/:pullRequestId/requestChanges',
      describeRoute({
        tags: ['Studio Git'],
        summary: 'Ask the author of a pull request for changes',
        description:
          'Posts the note as a comment on the issue, as the caller, who needs the right to comment. A person’s comment wakes the agent that holds the issue.',
        security: PERSON_ONLY,
        ...cliRoute({ command: 'pr request-changes' }),
        responses: { '201': dataResponse(CommentSchema), ...apiErrorResponses },
      }),
      apiValidator('param', PullParams),
      apiValidator('json', RequestChangesBody),
      async (context) => {
        const { pullRequestId } = context.req.valid('param');
        const { note } = context.req.valid('json');
        const { viewer, pull, issueId } = await readable(
          context,
          pullRequestId,
        );
        let created;
        try {
          created = await projects().comments.create(viewer, issueId, {
            content: `Xin sửa pull request #${pull.number} (commit ${pull.headSha.slice(0, 7)}):\n\n${note}`,
          });
        } catch (error) {
          if (error instanceof DomainError)
            throw new ApiError({
              status: 'PERMISSION_DENIED',
              reason: 'ACCESS_DENIED',
              domain: DOMAIN,
              message: error.message,
            });
          throw error;
        }
        return context.json({ data: { commentId: created.comment.id } }, 201);
      },
    );

    router.route('/', routes);
    return router;
  });
