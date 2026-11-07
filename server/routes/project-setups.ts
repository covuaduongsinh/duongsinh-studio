import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization';
import {
  agentsToken,
  runIdentityOf,
} from '@nocobase/app-plugin-agents/server/tokens';
import {
  projectsAccessToken,
  projectsToken,
  type Viewer,
} from '@nocobase/app-plugin-projects/server/tokens';
import type { Application } from '@nocobase/app-server/application';
import { i18nToken } from '@nocobase/app-server/i18n';
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
import { databaseManagerToken } from '@nocobase/db';
import { APP_NS } from '@nocobase/i18n';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { z } from 'zod';
import {
  AGENT_KIND,
  ISSUE_SUBJECT,
  PROJECT_MANAGER_ID,
} from '../agents/ids.js';
import { gitServiceToken } from '../providers/git.js';
import {
  projectDefaultSkills,
  setProjectDefaultSkills,
} from '../providers/project-defaults.js';
import { str, strOrNull, type Row } from '../git/rows.js';
import { GitError, type GitRepositoryView } from '../git/service.js';

type Env = AuthEnv & AuthorizationEnv;
type Ctx = Context<Env>;

const DOMAIN = 'studio';
const SETUPS = 'dsProjectSetups';
const PERSON: Record<string, string[]>[] = [
  { cookieAuth: [] },
  { apiKeyAuth: [] },
];

const error = (
  status: 'PERMISSION_DENIED' | 'NOT_FOUND' | 'INVALID_ARGUMENT',
  reason: string,
  message: string,
): ApiError => new ApiError({ status, reason, domain: DOMAIN, message });

const Init = z.discriminatedUnion('method', [
  z.strictObject({ method: z.literal('empty') }),
  z.strictObject({ method: z.literal('prompt'), prompt: z.string().min(1) }),
  z.strictObject({
    method: z.literal('nocobase'),
    template: z.literal('default').optional(),
  }),
]);

const SetupBody = z.strictObject({
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  workflowId: z.string().nullable().optional(),
  codeLocation: z.enum(['newRepo', 'existingRepo', 'none']),
  newRepo: z
    .strictObject({
      connectionId: z.string(),
      owner: z.string().optional(),
      name: z.string(),
      private: z.boolean(),
      init: Init,
    })
    .optional(),
  existingRepo: z
    .strictObject({
      connectionId: z.string().nullable().optional(),
      repoId: z.string().nullable().optional(),
      fullName: z.string().nullable().optional(),
      cloneUrl: z.string(),
      defaultBranch: z.string(),
      init: Init.optional(),
    })
    .optional(),
  label: z.string().nullable().optional(),
  deploy: z.unknown().optional(),
  ci: z.unknown().optional(),
});

const ProjectInit = z
  .object({
    projectId: z.string(),
    method: z.enum(['template', 'prompt']),
    state: z.enum(['pending', 'running', 'failed', 'done']),
    repo: z
      .object({
        fullName: z.string(),
        url: z.string(),
        defaultBranch: z.string(),
      })
      .nullable(),
    firstCommit: z.boolean(),
    appTemplate: z.literal('default').nullable(),
    agentId: z.string().nullable(),
    waitingForRunner: z.boolean(),
    issueId: z.string().nullable(),
    runSucceeded: z.boolean(),
    pushed: z.boolean(),
    error: z.string().nullable(),
    completedAt: z.string().nullable(),
  })
  .meta({ ref: 'StudioProjectInit' });

const SetupAnswer = z.object({
  projectId: z.string(),
  resourceId: z.string().nullable(),
  repo: z.object({ fullName: z.string(), url: z.string() }).nullable(),
  initIssueId: z.string().nullable(),
  initIssueIdentifier: z.string().nullable(),
  init: ProjectInit.nullable(),
  apps: z.array(
    z.object({
      appId: z.string(),
      role: z.enum(['staging', 'production']).nullable(),
      previewEnvironmentId: z.string().nullable(),
      name: z.string(),
      environmentId: z.string(),
    }),
  ),
  deployError: z.string().nullable(),
});

const SkillIds = z.object({ skillIds: z.array(z.string()) });

/** The repository's `owner/name`, from what was picked or from its clone address. */
function fullNameOf(repo: {
  readonly fullName?: string | null;
  readonly cloneUrl: string;
}): string {
  if (repo.fullName) return repo.fullName;
  const match = /[:/]([^/:]+\/[^/]+?)(?:\.git)?\/?$/u.exec(repo.cloneUrl);
  if (!match?.[1])
    throw error(
      'INVALID_ARGUMENT',
      'INVALID_CLONE_URL',
      'existingRepo.cloneUrl does not name a repository.',
    );
  return match[1];
}

/**
 * Setting a project up in one step (the demo's `projectSetups`) and the skills new projects start with
 * (`projectDefaultSkills`). Everything is checked before anything is made. Studio does not create repositories on
 * GitHub, which would ask the App for more permission, so `newRepo` is refused for now (`docs/chenh-lech-upstream.md`).
 */
export const projectSetupRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const routes = new Hono<Env>();
    const { container } = app;
    const auth = container.resolve(authenticationToken);
    const authz = container.resolve(authorizationToken);
    const projects = () => container.resolve(projectsToken);
    const agents = () => container.resolve(agentsToken);
    const git = () => container.resolve(gitServiceToken);
    const conn = () => container.resolve(databaseManagerToken).connection();

    const viewerOf = async (context: Ctx): Promise<Viewer> => {
      const session = context.get('auth');
      if (!session)
        throw error('PERMISSION_DENIED', 'ACCESS_DENIED', 'Sign in first.');
      if (runIdentityOf(session)?.run)
        throw error(
          'PERMISSION_DENIED',
          'RUN_NOT_ALLOWED',
          'This endpoint is for people, not agent runs.',
        );
      return {
        userId: session.user.id,
        actor: { type: 'user', id: session.user.id },
        permissions: await container
          .resolve(projectsAccessToken)
          .permissionsOf(context.get('authz').identity),
      };
    };

    const can = (context: Ctx, id: string, action: string) =>
      context.get('authz').can({ resource: { type: 'settings', id }, action });

    const translate = async () => {
      const i18n = container.resolve(i18nToken);
      const locale = i18n.getDefaultLocale();
      await i18n.ensureLocaleLoaded(locale);
      return i18n.getFixedT(APP_NS, locale);
    };

    /** A git failure as the answer it means, not a 500. */
    const guardedGit = async <T>(work: () => Promise<T>): Promise<T> => {
      try {
        return await work();
      } catch (failure) {
        if (failure instanceof GitError)
          throw new ApiError({
            status: failure.status,
            reason: failure.reason,
            domain: DOMAIN,
            message: failure.message,
          });
        throw failure;
      }
    };

    /** The initialization as it stands: read from its issue and that issue's runs, so reading changes nothing. */
    const initOf = async (projectId: string) => {
      const row: Row | undefined = await conn()
        .query.selectFrom(SETUPS)
        .selectAll()
        .where('projectId', '=', projectId)
        .executeTakeFirst();
      if (!row) return null;
      const issueId = strOrNull(row.issueId);
      const issue = issueId
        ? await conn()
            .query.selectFrom('pmIssues')
            .select(['statusKey', 'executorId', 'updatedAt'])
            .where('id', '=', issueId)
            .executeTakeFirst()
        : undefined;
      const runs = issueId
        ? await conn()
            .query.selectFrom('agRuns')
            .select(['status', 'failureReason', 'retryOfRunId', 'id'])
            .where('subjectKind', '=', ISSUE_SUBJECT)
            .where('subjectId', '=', issueId)
            .orderBy('createdAt')
            .execute()
        : [];
      const repository = await git().primaryRepository(projectId);
      const done = issue ? str(issue.statusKey) === 'done' : !issueId;
      const last = runs.at(-1);
      const failed = last && str(last.status) === 'failed';
      // Queued is not started yet: that is `waitingForRunner`, still pending.
      const started = runs.some((run: Row) => str(run.status) !== 'queued');
      return {
        projectId,
        method:
          str(row.method) === 'prompt'
            ? ('prompt' as const)
            : ('template' as const),
        state: done
          ? ('done' as const)
          : failed
            ? ('failed' as const)
            : started
              ? ('running' as const)
              : ('pending' as const),
        repo: repository
          ? {
              fullName: repository.repo,
              url: repository.webUrl,
              defaultBranch: repository.defaultBranch,
            }
          : null,
        firstCommit: str(row.method) !== 'empty',
        appTemplate: row.appTemplate ? ('default' as const) : null,
        agentId: issue ? strOrNull(issue.executorId) : null,
        waitingForRunner: runs.some((run: Row) => str(run.status) === 'queued'),
        issueId,
        runSucceeded: runs.some((run: Row) => str(run.status) === 'completed'),
        pushed: done && issueId !== null,
        error: failed ? strOrNull(last.failureReason) : null,
        completedAt:
          done && issue
            ? new Date(issue.updatedAt as string | Date).toISOString()
            : null,
      };
    };

    routes.use('/projectSetups', auth.required(), authz.middleware());
    routes.use('/projectSetups/*', auth.required(), authz.middleware());
    routes.use('/projectDefaultSkills', auth.required(), authz.middleware());

    routes.post(
      '/projectSetups',
      describeRoute({
        tags: ['Studio'],
        summary: 'Set a project up',
        operationId: 'projectSetupsCreate',
        description:
          'For whoever may create projects. Creates the project and links its repository (an existing one, or none), and the "Initialize project" issue when the directory is initialized. Everything is checked before anything is made; linking a repository asks for its own permission. If the project manager cannot start the initialization, creation succeeds with the issue blocked and `meta.message` says what to configure. Studio does not create repositories on the host: `newRepo` answers 400 `NEW_REPO_UNAVAILABLE`.',
        security: PERSON,
        ...cliRoute({ command: 'project setup create' }),
        responses: {
          201: dataResponse(SetupAnswer),
          ...apiErrorResponses,
        },
      }),
      apiValidator('json', SetupBody),
      async (context) => {
        const body = context.req.valid('json');
        const viewer = await viewerOf(context);
        if (body.codeLocation === 'newRepo')
          throw error(
            'INVALID_ARGUMENT',
            'NEW_REPO_UNAVAILABLE',
            'Studio does not create repositories yet: create it on GitHub, then use existingRepo.',
          );
        const existing = body.existingRepo;
        if (body.codeLocation === 'existingRepo') {
          if (!existing)
            throw error(
              'INVALID_ARGUMENT',
              'EXISTING_REPO_REQUIRED',
              'codeLocation existingRepo needs existingRepo.',
            );
          if (!existing.connectionId)
            throw error(
              'INVALID_ARGUMENT',
              'CONNECTION_REQUIRED',
              'existingRepo needs the connection that reaches it.',
            );
          if (!(await can(context, 'pm.members', 'define-roles')))
            throw error(
              'PERMISSION_DENIED',
              'ACCESS_DENIED',
              'An administrator links repositories.',
            );
        }
        const fullName =
          body.codeLocation === 'existingRepo' && existing
            ? fullNameOf(existing)
            : null;
        const init =
          body.codeLocation === 'existingRepo' ? existing?.init : undefined;

        // The repository first: it is what can still say no, and a link made for nothing harms no one.
        let repository: GitRepositoryView | null = null;
        if (fullName && existing?.connectionId) {
          const connectionId = existing.connectionId;
          repository = await guardedGit(async () => {
            const linked = (await git().listRepositories()).find(
              (item) =>
                item.connectionId === connectionId && item.repo === fullName,
            );
            return (
              linked ?? (await git().linkRepository({ connectionId, fullName }))
            );
          });
        }

        const project = await projects().projects.create(viewer, {
          name: body.name,
          ...(body.description !== undefined
            ? { description: body.description }
            : {}),
        });
        if (repository) {
          const { id } = repository;
          await guardedGit(() =>
            git().attachToProject(viewer, project.id, id, true),
          );
        }

        let initIssue: { id: string; identifier: string } | null = null;
        let message: string | null = null;
        const t = await translate();
        if (init && init.method !== 'empty') {
          const available = await agents().agents.findWorkable(
            conn(),
            PROJECT_MANAGER_ID,
          );
          const description =
            init.method === 'prompt'
              ? init.prompt
              : t('studioSetups.templateIssue', {
                  template: init.template ?? 'default',
                });
          if (!available) message = t('studioSetups.managerUnavailable');
          initIssue = await projects().issues.create(viewer, {
            title: t('studioSetups.issueTitle'),
            description,
            projectId: project.id,
            projectSetup: true,
            statusKey: 'in_progress',
            ...(available
              ? { executor: { type: AGENT_KIND, id: PROJECT_MANAGER_ID } }
              : {}),
          });
          if (!available && message) {
            await projects().issues.update(viewer, initIssue.id, {
              statusKey: 'blocked',
              needsYou: message,
              revision: (initIssue as { revision?: number }).revision ?? 1,
            });
          }
        }
        if (init && init.method !== 'empty')
          await conn()
            .query.insertInto(SETUPS)
            .values({
              projectId: project.id,
              method: init.method === 'prompt' ? 'prompt' : 'template',
              appTemplate:
                init.method === 'nocobase'
                  ? (init.template ?? 'default')
                  : null,
              issueId: initIssue?.id ?? null,
              createdById: viewer.userId,
              createdAt: new Date(),
            })
            .execute();

        const deployAsked = Boolean(body.deploy) || Boolean(body.ci);
        return context.json(
          {
            data: {
              projectId: project.id,
              resourceId: repository?.id ?? null,
              repo: repository
                ? { fullName: repository.repo, url: repository.webUrl }
                : null,
              initIssueId: initIssue?.id ?? null,
              initIssueIdentifier: initIssue?.identifier ?? null,
              init: await initOf(project.id),
              apps: [],
              deployError: deployAsked ? t('studioSetups.deployLater') : null,
            },
            ...(message ? { meta: { message } } : {}),
          },
          201,
        );
      },
    );

    routes.get(
      '/projectSetups/:projectId',
      describeRoute({
        tags: ['Studio'],
        summary: 'Read a project’s initialization',
        operationId: 'projectSetupsGet',
        description:
          'For whoever sees the project. `data` is null for a project without an initialization. Reading changes nothing.',
        security: PERSON,
        ...cliRoute({ command: 'project setup get' }),
        responses: {
          200: dataResponse(ProjectInit.nullable()),
          ...apiErrorResponses,
        },
      }),
      async (context) => {
        const viewer = await viewerOf(context);
        const projectId = context.req.param('projectId');
        const access = await projects().projects.accessTo(viewer, {
          projectId,
        });
        if (access?.visible !== true)
          throw error('NOT_FOUND', 'PROJECT_NOT_FOUND', 'No such project.');
        return context.json({ data: await initOf(projectId) });
      },
    );

    routes.get(
      '/projectDefaultSkills',
      describeRoute({
        tags: ['Studio'],
        summary: 'Read the skills new projects start with',
        operationId: 'projectDefaultSkillsGet',
        description:
          'Existing projects keep their own attachments. Requires `agents.agents` read or manage.',
        security: PERSON,
        ...cliRoute({ command: 'project default-skills get' }),
        responses: { 200: dataResponse(SkillIds), ...apiErrorResponses },
      }),
      async (context) => {
        if (
          !(await can(context, 'agents.agents', 'read')) &&
          !(await can(context, 'agents.agents', 'manage'))
        )
          throw error(
            'PERMISSION_DENIED',
            'ACCESS_DENIED',
            'agents.agents read is required.',
          );
        return context.json({
          data: { skillIds: await projectDefaultSkills(conn()) },
        });
      },
    );

    routes.put(
      '/projectDefaultSkills',
      describeRoute({
        tags: ['Studio'],
        summary: 'Set the skills new projects start with',
        operationId: 'projectDefaultSkillsSet',
        description:
          'Validates skill ids and replaces the defaults. An empty array clears them. Only projects created afterwards copy this list. Requires `agents.agents` manage.',
        security: PERSON,
        ...cliRoute({ command: 'project default-skills set' }),
        responses: { 200: dataResponse(SkillIds), ...apiErrorResponses },
      }),
      apiValidator('json', SkillIds),
      async (context) => {
        if (!(await can(context, 'agents.agents', 'manage')))
          throw error(
            'PERMISSION_DENIED',
            'ACCESS_DENIED',
            'agents.agents manage is required.',
          );
        const { skillIds } = context.req.valid('json');
        const unique = [...new Set(skillIds)];
        const valid = await agents().skills.validateIds(conn(), unique);
        await setProjectDefaultSkills(conn(), valid);
        return context.json({ data: { skillIds: valid } });
      },
    );

    router.route('/', routes);
    return router;
  });
