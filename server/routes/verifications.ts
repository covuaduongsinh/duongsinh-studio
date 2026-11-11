import { randomUUID } from 'node:crypto';
import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization';
import { runIdentityOf } from '@nocobase/app-plugin-agents/server/tokens';
import {
  projectsAccessToken,
  projectsToken,
  type Viewer,
} from '@nocobase/app-plugin-projects/server/tokens';
import type { Application } from '@nocobase/app-server/application';
import {
  ApiError,
  apiErrorResponse,
  apiErrorResponses,
  apiValidator,
  cliRoute,
  dataResponse,
  defineApiRoutes,
  describeRoute,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { databaseManagerToken } from '@nocobase/db';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { z } from 'zod';
import { str, num } from '../git/rows.js';
import { VERIFICATIONS_SUBMIT_ACTION } from '../agents/actions.js';
import { outboundToken } from '../providers/outbound.js';
import { BLOCKED_STATUS } from '@nocobase/app-plugin-projects/shared/statuses';

type Env = AuthEnv & AuthorizationEnv;
type Ctx = Context<Env>;

const PERSON_OR_RUN: Record<string, string[]>[] = [
  { cookieAuth: [] },
  { apiKeyAuth: [] },
  { runToken: [] },
];

export const VerificationItemResultEnum = z.enum(['pass', 'fail', 'pending']);
export const VerificationResultEnum = z.enum(['passed', 'failed']);

interface IssueView {
  readonly id: string;
  readonly identifier: string;
  readonly title: string;
  readonly ownerUserId?: string | null;
  readonly projectId?: string | null;
  readonly executor?: { readonly type: string; readonly id: string } | null;
}

interface VerificationItemView {
  readonly id: string;
  readonly verificationId: string;
  readonly criterionId: string;
  readonly result: string;
  readonly exitCode: number | null;
  readonly output: string | null;
  readonly durationMs: number | null;
  readonly createdAt?: string;
}

export const VerificationItemInputSchema = z.object({
  criterionId: z.string().trim().min(1),
  result: VerificationItemResultEnum.optional(),
  exitCode: z.number().int().nullable().optional(),
  output: z.string().nullable().optional(),
  durationMs: z.number().int().nullable().optional(),
});

export const VerificationSubmitInputSchema = z.object({
  issueId: z.string().trim().min(1),
  headSha: z.string().trim().min(1),
  items: z.array(VerificationItemInputSchema),
});

export const VerificationItemOutputSchema = z.object({
  id: z.string(),
  verificationId: z.string(),
  criterionId: z.string(),
  result: VerificationItemResultEnum,
  exitCode: z.number().nullable(),
  output: z.string().nullable(),
  durationMs: z.number().nullable(),
  createdAt: z.string().optional(),
});

export const VerificationOutputSchema = z.object({
  id: z.string(),
  issueId: z.string(),
  runId: z.string().nullable(),
  agentId: z.string().nullable(),
  headSha: z.string(),
  attempt: z.number(),
  result: VerificationResultEnum,
  createdAt: z.string(),
  items: z.array(VerificationItemOutputSchema).optional(),
});

export const VerificationSettingsSchema = z.object({
  maxConsecutiveFailures: z.number().int().min(1).max(10),
});

const IssueParam = z.object({ issueId: z.string() });

const notFound = (what: string): ApiError =>
  new ApiError({
    status: 'NOT_FOUND',
    code: 'NOT_FOUND',
    message: `${what} not found.`,
  });

const denied = (message: string): ApiError =>
  new ApiError({
    status: 'FORBIDDEN',
    code: 'PERMISSION_DENIED',
    message,
  });

export const SETTINGS_ROW_ID = 'default';
export const DEFAULT_MAX_FAILURES = 2;

export const verificationRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const auth = app.container.resolve(authenticationToken);
    const authz = app.container.resolve(authorizationToken);
    const projects = () => app.container.resolve(projectsToken);
    const db = () => app.container.resolve(databaseManagerToken);
    const conn = () => db().connection();

    const viewerOf = async (context: Ctx): Promise<Viewer> => {
      const session = context.get('auth');
      if (!session) throw denied('Sign in first.');
      const identity = context.get('authz').identity;
      const scoped = identity.keyScope?.objects('pm.projects') ?? 'all';
      const run = runIdentityOf(session);
      const runId = run?.run ? str(run.run.id) : null;
      const userId = session.user?.id
        ? str(session.user.id)
        : (runId ?? 'anonymous');
      const actor: Viewer['actor'] = runId
        ? { type: 'agent', id: runId }
        : { type: 'user', id: userId };
      return {
        userId,
        actor,
        permissions: await app.container
          .resolve(projectsAccessToken)
          .permissionsOf(identity),
        ...(scoped === 'all' ? {} : { projectIds: scoped }),
      };
    };

    const routes = new Hono<Env>();
    const paths = [
      '/verifications',
      '/verifications/settings',
      '/verifications/recent',
      '/issues/:issueId/verifications',
    ];
    for (const path of paths) {
      routes.use(path, auth.required({ scopedKeys: true }), authz.middleware());
    }

    // 1. POST /api/verifications
    routes.post(
      '/verifications',
      describeRoute({
        description: 'Submits verification results for an issue.',
        security: PERSON_OR_RUN,
        ...cliRoute({
          command: 'verify submit',
        }),
        responses: {
          '200': dataResponse(
            z.object({
              verification: VerificationOutputSchema,
              items: z.array(VerificationItemOutputSchema),
            }),
          ),
          ...apiErrorResponses,
          403: apiErrorResponse(403),
          404: apiErrorResponse(404),
        },
      }),
      apiValidator('json', VerificationSubmitInputSchema),
      async (c) => {
        const input = c.req.valid('json');
        const viewer = await viewerOf(c);

        // Kiểm tra quyền
        const isRun = Boolean(runIdentityOf(c.get('auth'))?.run);
        if (isRun) {
          const scope = viewer.permissions.scopes['pm.issues/edit' as never] as
            string | undefined;
          const hasEdit = scope && scope !== 'none';
          const actions = (
            viewer.permissions as { actions?: readonly string[] }
          ).actions;
          const hasAction =
            Array.isArray(actions) &&
            actions.includes(VERIFICATIONS_SUBMIT_ACTION);
          if (!hasEdit && !hasAction) {
            throw denied(
              'Run does not have permission to submit verifications.',
            );
          }
        }

        let issue: IssueView;
        try {
          issue = await projects().issueQueries.visible(viewer, input.issueId);
        } catch {
          throw notFound('Issue');
        }

        const connection = conn();
        const now = new Date();

        // Đọc danh sách criteria của issue
        const criteriaRows = await connection.query
          .selectFrom('dsIssueCriteria')
          .selectAll()
          .where('issueId', '=', input.issueId)
          .orderBy('position', 'asc')
          .execute();

        // Đọc PR mở của issue (nếu có) để tính tiêu chí 'ci'
        const openPr = await connection.query
          .selectFrom('dsPullRequests')
          .selectAll()
          .where('issueId', '=', input.issueId)
          .where('state', '=', 'open')
          .executeTakeFirst();

        const inputItemsMap = new Map(
          input.items.map((it) => [it.criterionId, it]),
        );

        let allRequiredPass = true;
        const evaluatedItems: {
          id: string;
          criterionId: string;
          result: 'pass' | 'fail' | 'pending';
          exitCode: number | null;
          output: string | null;
          durationMs: number | null;
          createdAt: string;
        }[] = [];

        for (const crit of criteriaRows) {
          const critId = str(crit.id);
          const kind = str(crit.checkKind);
          const inputItem = inputItemsMap.get(critId);

          let itemResult: 'pass' | 'fail' | 'pending' = 'fail';
          let itemExitCode: number | null = null;
          let itemOutput: string | null = null;
          let itemDuration: number | null = null;

          if (kind === 'test' || kind === 'command') {
            if (inputItem) {
              if (inputItem.result) {
                itemResult = inputItem.result;
              } else if (inputItem.exitCode !== undefined) {
                itemResult = inputItem.exitCode === 0 ? 'pass' : 'fail';
              } else {
                itemResult = 'fail';
              }
              itemExitCode = inputItem.exitCode ?? null;
              itemOutput = inputItem.output
                ? inputItem.output.slice(-20000)
                : null;
              itemDuration = inputItem.durationMs ?? null;
            } else {
              itemResult = 'fail';
            }
          } else if (kind === 'ci') {
            // Studio tự xác định từ dsPullRequests
            if (openPr && str(openPr.headSha) === input.headSha) {
              const ciState = str(openPr.ciState);
              if (ciState === 'success') {
                itemResult = 'pass';
              } else if (ciState === 'pending') {
                itemResult = 'pending';
              } else {
                itemResult = 'fail';
              }
              itemOutput = `PR #${num(openPr.number)} CI state: ${ciState}`;
            } else {
              itemResult = 'fail';
              itemOutput = openPr
                ? `PR headSha mismatch: expected ${str(openPr.headSha)}, submitted ${input.headSha}`
                : 'No open PR found for issue';
            }
          } else if (kind === 'human') {
            itemResult = inputItem?.result ?? 'pending';
            itemOutput = inputItem?.output
              ? inputItem.output.slice(-20000)
              : null;
          }

          // Tiêu chí test, command, ci là bắt buộc
          if (kind !== 'human') {
            if (itemResult !== 'pass') {
              allRequiredPass = false;
            }
          }

          evaluatedItems.push({
            id: randomUUID(),
            criterionId: critId,
            result: itemResult,
            exitCode: itemExitCode,
            output: itemOutput,
            durationMs: itemDuration,
            createdAt: now.toISOString(),
          });
        }

        // Nếu issue không có criteria nào thì không coi là passed
        const overallResult: 'passed' | 'failed' =
          criteriaRows.length > 0 && allRequiredPass ? 'passed' : 'failed';

        // Tính attempt
        const previousVerifs = await connection.query
          .selectFrom('dsVerifications')
          .select(['attempt', 'result'])
          .where('issueId', '=', input.issueId)
          .orderBy('attempt', 'desc')
          .execute();

        const attempt =
          previousVerifs.length > 0 ? num(previousVerifs[0].attempt) + 1 : 1;

        const runInfo = runIdentityOf(c.get('auth'));
        const runId = runInfo?.run ? str(runInfo.run.id) : null;
        const agentId =
          (issue.executor?.type === 'agent' ? str(issue.executor.id) : null) ??
          null;

        const verificationId = randomUUID();

        await connection.query
          .insertInto('dsVerifications')
          .values({
            id: verificationId,
            issueId: input.issueId,
            runId: runId ? str(runId) : null,
            agentId: agentId ? str(agentId) : null,
            headSha: input.headSha,
            attempt,
            result: overallResult,
            createdAt: now,
          })
          .execute();

        for (const item of evaluatedItems) {
          await connection.query
            .insertInto('dsVerificationItems')
            .values({
              id: item.id,
              verificationId,
              criterionId: item.criterionId,
              result: item.result,
              exitCode: item.exitCode,
              output: item.output,
              durationMs: item.durationMs,
              createdAt: now,
            })
            .execute();
        }

        // Xử lý khi thất bại (N = 2)
        if (overallResult === 'failed') {
          // Đọc settings N
          const settingsRow = await connection.query
            .selectFrom('dsVerificationSettings')
            .select(['maxConsecutiveFailures'])
            .where('id', '=', SETTINGS_ROW_ID)
            .executeTakeFirst();

          const maxFailures = settingsRow
            ? num(settingsRow.maxConsecutiveFailures)
            : DEFAULT_MAX_FAILURES;

          // Đếm số lần failed liên tiếp bao gồm lần này
          let consecutiveFailures = 1;
          for (const prev of previousVerifs) {
            if (str(prev.result) === 'failed') {
              consecutiveFailures++;
            } else {
              break;
            }
          }

          if (consecutiveFailures >= maxFailures) {
            // Chuyển việc sang blocked và ghi needsYou
            const failedCriteriaNames = evaluatedItems
              .filter((it) => it.result !== 'pass')
              .map((it) => {
                const matched = criteriaRows.find(
                  (c) => str(c.id) === it.criterionId,
                );
                return matched ? str(matched.text) : it.criterionId;
              })
              .join(', ');

            const needsYouText = `Kiểm chứng thất bại ${consecutiveFailures} lần liên tiếp (${failedCriteriaNames}). Cần người quyết định.`;

            await connection.query
              .updateTable('pmIssues')
              .set({
                statusKey: BLOCKED_STATUS,
                needsYou: needsYouText,
                updatedAt: now,
              })
              .where('id', '=', input.issueId)
              .execute();

            // Ghi comment vào issue
            try {
              const commentId = randomUUID();
              await connection.query
                .insertInto('pmComments')
                .values({
                  id: commentId,
                  rootId: commentId,
                  issueId: input.issueId,
                  authorType: 'system',
                  authorId: null,
                  content: `⚠️ **Kiểm chứng thất bại ${consecutiveFailures} lần liên tiếp**\n\n- **Các tiêu chí chưa đạt**: ${failedCriteriaNames}\n- **Trạng thái**: Chuyển sang **Đang vướng (Blocked)**. Cần người kiểm tra và can thiệp.`,
                  createdAt: now,
                  updatedAt: now,
                })
                .execute();
            } catch {
              // Bỏ qua lỗi comment nếu có
            }

            // Gửi thông báo Hộp thư và qua outbound nếu có
            if (app.container.has(outboundToken)) {
              try {
                const outbound = app.container.resolve(outboundToken);
                const ownerId = issue.ownerUserId
                  ? str(issue.ownerUserId)
                  : null;
                if (ownerId) {
                  await outbound.deliver(ownerId, {
                    key: `verification-failed-${input.issueId}-${attempt}`,
                    kind: 'decision',
                    title: `Cần bạn: Kiểm chứng thất bại ${consecutiveFailures} lần liên tiếp`,
                    body: `Công việc "${str(issue.title)}" bị dừng do không đạt tiêu chí kiểm chứng: ${failedCriteriaNames}.`,
                    path: `/issues/${input.issueId}`,
                  });
                }
              } catch {
                // Ignore outbound error
              }
            }
          }
        }

        const verificationData = {
          id: verificationId,
          issueId: input.issueId,
          runId: runId ? str(runId) : null,
          agentId: agentId ? str(agentId) : null,
          headSha: input.headSha,
          attempt,
          result: overallResult,
          createdAt: now.toISOString(),
          items: evaluatedItems.map((it) => ({
            ...it,
            verificationId,
          })),
        };

        return c.json({
          data: {
            verification: verificationData,
            items: evaluatedItems.map((it) => ({
              ...it,
              verificationId,
            })),
          },
        });
      },
    );

    // 2. GET /api/issues/:issueId/verifications
    routes.get(
      '/issues/:issueId/verifications',
      describeRoute({
        description: 'Lists all verification runs for an issue.',
        security: PERSON_OR_RUN,
        ...cliRoute({
          command: 'verify list',
        }),
        responses: {
          '200': dataResponse(z.array(VerificationOutputSchema)),
          ...apiErrorResponses,
          403: apiErrorResponse(403),
          404: apiErrorResponse(404),
        },
      }),
      apiValidator('param', IssueParam),
      async (c) => {
        const { issueId } = c.req.valid('param');
        const viewer = await viewerOf(c);

        try {
          await projects().issueQueries.visible(viewer, issueId);
        } catch {
          throw notFound('Issue');
        }

        const connection = conn();
        const verifRows = await connection.query
          .selectFrom('dsVerifications')
          .selectAll()
          .where('issueId', '=', issueId)
          .orderBy('attempt', 'desc')
          .execute();

        const verifIds = verifRows.map((v) => str(v.id));
        const itemRows =
          verifIds.length > 0
            ? await connection.query
                .selectFrom('dsVerificationItems')
                .selectAll()
                .where('verificationId', 'in', verifIds)
                .execute()
            : [];

        const itemsByVerif = new Map<string, VerificationItemView[]>();
        for (const item of itemRows) {
          const vId = str(item.verificationId);
          if (!itemsByVerif.has(vId)) itemsByVerif.set(vId, []);
          itemsByVerif.get(vId)!.push({
            id: str(item.id),
            verificationId: vId,
            criterionId: str(item.criterionId),
            result: str(item.result),
            exitCode: item.exitCode != null ? num(item.exitCode) : null,
            output: item.output ? str(item.output) : null,
            durationMs: item.durationMs != null ? num(item.durationMs) : null,
            createdAt: item.createdAt
              ? new Date(item.createdAt as string | number | Date).toISOString()
              : undefined,
          });
        }

        const verifications = verifRows.map((v) => {
          const vId = str(v.id);
          return {
            id: vId,
            issueId: str(v.issueId),
            runId: v.runId ? str(v.runId) : null,
            agentId: v.agentId ? str(v.agentId) : null,
            headSha: str(v.headSha),
            attempt: num(v.attempt),
            result: str(v.result) as 'passed' | 'failed',
            createdAt: new Date(
              v.createdAt as string | number | Date,
            ).toISOString(),
            items: itemsByVerif.get(vId) ?? [],
          };
        });

        return c.json({ data: verifications });
      },
    );

    // 3. GET /api/verifications/settings
    routes.get(
      '/verifications/settings',
      describeRoute({
        description:
          'Gets verification settings (e.g. max consecutive failures).',
        security: PERSON_OR_RUN,
        responses: {
          '200': dataResponse(VerificationSettingsSchema),
          ...apiErrorResponses,
        },
      }),
      async (c) => {
        const connection = conn();
        const row = await connection.query
          .selectFrom('dsVerificationSettings')
          .select(['maxConsecutiveFailures'])
          .where('id', '=', SETTINGS_ROW_ID)
          .executeTakeFirst();

        return c.json({
          data: {
            maxConsecutiveFailures: row
              ? num(row.maxConsecutiveFailures)
              : DEFAULT_MAX_FAILURES,
          },
        });
      },
    );

    // 4. PUT /api/verifications/settings
    routes.put(
      '/verifications/settings',
      describeRoute({
        description: 'Updates verification settings.',
        security: PERSON_OR_RUN,
        responses: {
          '200': dataResponse(VerificationSettingsSchema),
          ...apiErrorResponses,
          403: apiErrorResponse(403),
        },
      }),
      apiValidator('json', VerificationSettingsSchema),
      async (c) => {
        const snapshot = await c.get('authz').snapshot();
        if (!snapshot.unrestricted) {
          throw denied('Only administrators may change verification settings.');
        }

        const input = c.req.valid('json');
        const connection = conn();
        const now = new Date();

        const existing = await connection.query
          .selectFrom('dsVerificationSettings')
          .select('id')
          .where('id', '=', SETTINGS_ROW_ID)
          .executeTakeFirst();

        if (existing) {
          await connection.query
            .updateTable('dsVerificationSettings')
            .set({
              maxConsecutiveFailures: input.maxConsecutiveFailures,
              updatedAt: now,
            })
            .where('id', '=', SETTINGS_ROW_ID)
            .execute();
        } else {
          await connection.query
            .insertInto('dsVerificationSettings')
            .values({
              id: SETTINGS_ROW_ID,
              maxConsecutiveFailures: input.maxConsecutiveFailures,
              updatedAt: now,
            })
            .execute();
        }

        return c.json({ data: input });
      },
    );

    // 5. GET /api/verifications/recent
    routes.get(
      '/verifications/recent',
      describeRoute({
        description: 'Lists recent verifications across the studio.',
        security: PERSON_OR_RUN,
        responses: {
          '200': dataResponse(z.array(VerificationOutputSchema)),
          ...apiErrorResponses,
        },
      }),
      async (c) => {
        const connection = conn();
        const rows = await connection.query
          .selectFrom('dsVerifications')
          .selectAll()
          .orderBy('createdAt', 'desc')
          .limit(20)
          .execute();

        const verifications = rows.map((v) => ({
          id: str(v.id),
          issueId: str(v.issueId),
          runId: v.runId ? str(v.runId) : null,
          agentId: v.agentId ? str(v.agentId) : null,
          headSha: str(v.headSha),
          attempt: num(v.attempt),
          result: str(v.result) as 'passed' | 'failed',
          createdAt: new Date(
            v.createdAt as string | number | Date,
          ).toISOString(),
        }));

        return c.json({ data: verifications });
      },
    );

    router.route('/', routes);
    return router;
  });
