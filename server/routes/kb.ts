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
import { databaseManagerToken } from '@nocobase/db';
import { randomUUID } from 'node:crypto';
import {
  DomainError,
  type Viewer,
} from '@nocobase/app-plugin-projects/server/tokens';
import { ISSUE_SUBJECT } from '../agents/ids.js';
import { str, strOrNull, type Row } from '../git/rows.js';
import {
  knowledgeToken,
  type KnowledgeReader,
} from '@nocobase/app-plugin-knowledge/server/tokens';
import type { SpaceRef } from '@nocobase/app-plugin-knowledge/shared/knowledge';
import {
  projectsAccessToken,
  projectsToken,
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
  listResponse,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import {
  AGENT_ACTOR,
  PROJECT_SCOPE,
  SYSTEM_SCOPE,
  SYSTEM_SPACE,
  normalSpace,
} from '../knowledge/access.js';

type Env = AuthEnv & AuthorizationEnv;

const DOMAIN = 'studio';
const PERSON: Record<string, string[]>[] = [
  { cookieAuth: [] },
  { apiKeyAuth: [] },
];
const PERSON_OR_RUN: Record<string, string[]>[] = [...PERSON, { runToken: [] }];
const READ_ACTION = 'kb.knowledge/read';
const SEARCH_LIMIT_MAX = 50;

/** The knowledge plugin's own person-only search and read stay in the API; on the command line these replace them. */
export const REPLACED_PLUGIN_COMMANDS: readonly string[] = [
  'knowledgeSearchDocs',
  'knowledgeGetDoc',
];

const SpaceQuery = z.object({
  scope: z.enum([SYSTEM_SCOPE, PROJECT_SCOPE]).optional().meta({
    description:
      '`system` (the shared space) or `project`; every readable space when left out.',
  }),
  owner: z
    .string()
    .max(64)
    .optional()
    .meta({ description: 'The project id, with `--scope project`.' }),
});
const SearchQuery = SpaceQuery.extend({
  q: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .meta({ description: 'What to look for.' }),
  limit: z.coerce.number().int().min(1).max(SEARCH_LIMIT_MAX).optional(),
});
const DocParams = z.object({
  doc: z.string().min(1).max(200).meta({
    description:
      'A document id, or its slug in `--scope`/`--owner` (the system space by default).',
  }),
});

const loose = z.looseObject({});
const SearchHitSchema = z
  .looseObject({
    docId: z.string(),
    title: z.string(),
    slug: z.string(),
    version: z.number(),
    scope: z.string(),
    scopeId: z.string(),
    lines: z.tuple([z.number(), z.number()]),
    excerpt: z.string(),
  })
  .meta({ ref: 'StudioKnowledgeSearchHit' });
const DocSchema = z
  .looseObject({
    id: z.string(),
    title: z.string(),
    slug: z.string(),
    version: z.number(),
    content: z.string(),
  })
  .meta({ ref: 'StudioKnowledgeDoc' });
const SummarySchema = z
  .looseObject({
    space: loose,
    documents: z.number().int(),
    archivedDocuments: z.number().int(),
  })
  .meta({ ref: 'StudioKnowledgeSpaceSummary' });

const invalid = (message: string) =>
  new ApiError({
    status: 'INVALID_ARGUMENT',
    reason: 'INVALID_SCOPE',
    domain: DOMAIN,
    message,
  });

const OFFERS = 'dsKbOffers';
const OFFERS_PER_RUN = 3;
const DOC_LIST_LIMIT = 200;
const SYSTEM_SPACE_NAME = 'system';
const PROPOSE_ACTION = 'kb.knowledge/propose';
const DocItem = z
  .object({
    id: z.string(),
    slug: z.string(),
    title: z.string(),
    kind: z.enum(['folder', 'article', 'file']),
    filename: z.string().optional(),
    space: z.string(),
    version: z.number().int(),
    summary: z.string(),
    parentId: z.string().nullable().optional(),
    children: z.number().int().optional(),
    url: z.string(),
  })
  .meta({ ref: 'StudioKbListItem' });

const OfferStatus = z.enum(['pending', 'saving', 'saved', 'declined']);
const OfferSchema = z.object({
  id: z.string(),
  issueId: z.string(),
  attachmentId: z.string(),
  reason: z.string(),
  status: OfferStatus,
  targetScope: z.enum(['project', 'system']).nullable(),
  targetScopeId: z.string().nullable(),
  decidedById: z.string().nullable(),
  docId: z.string().nullable(),
});
const OfferParams = z.object({ offerId: z.string().min(1) });

const offerDenied = () =>
  new ApiError({
    status: 'PERMISSION_DENIED',
    reason: 'OFFER_DECISION_DENIED',
    domain: DOMAIN,
    message: 'Only who sent the file or who owns the issue decides.',
  });
const offerDecided = (status: string) =>
  new ApiError({
    status: 'FAILED_PRECONDITION',
    reason: 'OFFER_ALREADY_DECIDED',
    domain: DOMAIN,
    message: `This offer is ${status} already.`,
  });

/** The space a `--scope`/`--owner` pair names, or undefined when neither is given. */
function spaceOf(query: {
  scope?: string;
  owner?: string;
}): SpaceRef | undefined {
  if (!query.scope) {
    if (query.owner) throw invalid('Give `scope` with `owner`.');
    return undefined;
  }
  const space = normalSpace({ scope: query.scope, scopeId: query.owner ?? '' });
  if (!space)
    throw invalid(
      `There is no ${query.scope} space ${query.owner ?? ''}.`.trim(),
    );
  return space;
}

/** A space with what it inherits, nearest first. */
const chainOf = (space: SpaceRef): SpaceRef[] =>
  space.scope === PROJECT_SCOPE ? [space, SYSTEM_SPACE] : [space];

/**
 * Knowledge for people and runs (`/api/kb`, the Studio demo's contract), and the authorized directory the knowledge
 * page lists (`/api/knowledgeDirectory`). A run reads as its agent acting for the person it works as: the lower of the
 * two (`server/knowledge/access.ts`). Every answer is the knowledge plugin's, which checks each document's access.
 */
export const kbRoutes: AppApiRouteContribution<Application> = defineApiRoutes(
  (app) => {
    const { container } = app;
    const auth = container.resolve(authenticationToken);
    const authz = container.resolve(authorizationToken);
    const knowledge = () => container.resolve(knowledgeToken);

    const readerOf = async (
      context: Context<Env>,
    ): Promise<KnowledgeReader> => {
      const session = context.get('auth');
      if (!session)
        throw new ApiError({
          status: 'UNAUTHENTICATED',
          reason: 'UNAUTHENTICATED',
          domain: 'authentication',
          message: 'Sign in first.',
        });
      const run = runIdentityOf(session);
      if (run?.run && run.agent)
        return {
          userId: run.userId,
          actor: { kind: AGENT_ACTOR, id: run.agent.id, runId: run.run.run.id },
        };
      // The knowledge plugin refuses scoped API keys and service-account keys; so do its replacements.
      if (await auth.isScopedSession(session, context.req.raw))
        throw new ApiError({
          status: 'PERMISSION_DENIED',
          reason: 'SCOPED_KEY_FORBIDDEN',
          domain: 'authentication',
          message:
            'This endpoint does not accept scoped API keys or service-account keys.',
        });
      return { userId: session.user.id };
    };

    /** The system space and the space of every project the person sees. */
    const directorySpaces = async (
      context: Context<Env>,
    ): Promise<SpaceRef[]> => {
      const session = context.get('auth');
      if (!session) return [SYSTEM_SPACE];
      const identity = context.get('authz').identity;
      const viewer = {
        userId: session.user.id,
        actor: { type: 'user' as const, id: session.user.id },
        permissions: await container
          .resolve(projectsAccessToken)
          .permissionsOf(identity),
      };
      const projects = await container
        .resolve(projectsToken)
        .projects.list(viewer);
      return [
        SYSTEM_SPACE,
        ...projects.map((project) => ({
          scope: PROJECT_SCOPE,
          scopeId: project.id,
        })),
      ];
    };

    const conn = () => container.resolve(databaseManagerToken).connection();

    /** A person acting for themselves: offers are decided by people, never by a run or a scoped key. */
    const peopleViewer = async (context: Context<Env>): Promise<Viewer> => {
      const session = context.get('auth');
      if (!session)
        throw new ApiError({
          status: 'UNAUTHENTICATED',
          reason: 'UNAUTHENTICATED',
          domain: 'authentication',
          message: 'Sign in first.',
        });
      if (runIdentityOf(session)?.run)
        throw new ApiError({
          status: 'PERMISSION_DENIED',
          reason: 'RUN_NOT_ALLOWED',
          domain: DOMAIN,
          message: 'People decide this, not agent runs.',
        });
      if (await auth.isScopedSession(session, context.req.raw))
        throw new ApiError({
          status: 'PERMISSION_DENIED',
          reason: 'SCOPED_KEY_FORBIDDEN',
          domain: 'authentication',
          message: 'This endpoint does not accept scoped API keys.',
        });
      return {
        userId: session.user.id,
        actor: { type: 'user', id: session.user.id },
        permissions: await container
          .resolve(projectsAccessToken)
          .permissionsOf(context.get('authz').identity),
      };
    };

    const kb = new Hono<Env>();
    for (const path of ['/', '/*'])
      kb.use(path, auth.required({ scopedKeys: true }), authz.middleware());

    kb.get(
      '/search',
      describeRoute({
        tags: ['Studio'],
        summary: 'Search the knowledge',
        description:
          'Ranked sections of the documents the caller may read: every readable space, or one space with what it inherits. Cite the title, id and lines of what you use.',
        operationId: 'studioSearchKnowledge',
        security: PERSON_OR_RUN,
        ...cliRoute({
          command: 'kb search',
          columns: ['title', 'docId', 'lines', 'excerpt'],
          examples: [
            'kb search --q "quy trình merge"',
            'kb search --q "Elo" --scope project --owner <projectId> --limit 5',
          ],
          action: READ_ACTION,
        }),
        responses: {
          '200': listResponse(SearchHitSchema),
          ...apiErrorResponses,
        },
      }),
      apiValidator('query', SearchQuery),
      async (context) => {
        const query = context.req.valid('query');
        const reader = await readerOf(context);
        const space = spaceOf(query);
        const options = { limit: query.limit ?? 10 };
        const hits = space
          ? await knowledge().docs.searchMany(
              reader,
              chainOf(space),
              query.q,
              options,
            )
          : await knowledge().docs.searchAll(reader, query.q, options);
        return context.json({ data: hits, meta: { count: hits.length } });
      },
    );

    kb.get(
      '/docs/:doc',
      describeRoute({
        tags: ['Studio'],
        summary: 'Read a knowledge document',
        description:
          'The current version of a document the caller may read, by id or by slug.',
        operationId: 'studioReadKnowledge',
        security: PERSON_OR_RUN,
        ...cliRoute({
          command: 'kb read',
          args: ['doc'],
          examples: ['kb read <docId>'],
          action: READ_ACTION,
        }),
        responses: {
          '200': dataResponse(DocSchema),
          ...apiErrorResponses,
          '404': apiErrorResponse(404),
        },
      }),
      apiValidator('param', DocParams),
      apiValidator('query', SpaceQuery),
      async (context) => {
        const { doc } = context.req.valid('param');
        const reader = await readerOf(context);
        const space = spaceOf(context.req.valid('query'));
        if (space)
          return context.json({
            data: await knowledge().docs.resolve(reader, space, doc),
          });
        // An id reaches a document of any space the caller reads; a slug alone is looked up in the system space.
        try {
          return context.json({
            data: await knowledge().docs.get(reader, doc),
          });
        } catch (error) {
          if ((error as { code?: unknown }).code !== 'DOC_NOT_FOUND')
            throw error;
          return context.json({
            data: await knowledge().docs.resolve(reader, SYSTEM_SPACE, doc),
          });
        }
      },
    );

    kb.get(
      '/docs',
      describeRoute({
        tags: ['Studio'],
        summary: 'List knowledge documents',
        description:
          'The documents the caller reads in the spaces read (with the system’s), each with the page that shows it. `q` keeps those matching the words, best first; `parent` one document’s children. A bounded list, not paged.',
        operationId: 'studioListKnowledge',
        security: PERSON_OR_RUN,
        ...cliRoute({ command: 'kb list', action: READ_ACTION }),
        responses: {
          '200': dataResponse(z.array(DocItem)),
          ...apiErrorResponses,
        },
      }),
      apiValidator(
        'query',
        z.object({
          q: z.string().min(1).optional(),
          parent: z.string().min(1).optional(),
          projectId: z.string().min(1).optional(),
        }),
      ),
      async (context) => {
        const { q, parent, projectId } = context.req.valid('query');
        const reader = await readerOf(context);
        const spaces = projectId
          ? chainOf({ scope: PROJECT_SCOPE, scopeId: projectId })
          : await directorySpaces(context);
        const listed: z.infer<typeof DocItem>[] = [];
        for (const space of spaces) {
          const tree = await knowledge().docs.tree(reader, space);
          const name =
            space.scope === PROJECT_SCOPE ? space.scopeId : SYSTEM_SPACE_NAME;
          for (const doc of tree.spaces.flatMap((item) => item.docs))
            if (!parent || doc.parentId === parent)
              listed.push({
                id: doc.id,
                slug: doc.slug,
                title: doc.title,
                kind: doc.kind,
                ...(doc.file ? { filename: doc.file.filename } : {}),
                space: name,
                version: doc.version,
                summary: doc.summary,
                parentId: doc.parentId,
                children: doc.childCount,
                url: `/knowledge/docs/${doc.id}`,
              });
        }
        const words = q
          ?.toLocaleLowerCase()
          .split(/\s+/u)
          .filter((word) => word.length > 0);
        const matched = words
          ? listed
              .map((doc) => {
                const text =
                  `${doc.title} ${doc.summary} ${doc.slug}`.toLocaleLowerCase();
                return {
                  doc,
                  score: words.filter((word) => text.includes(word)).length,
                };
              })
              .filter(({ score }) => score > 0)
              .sort((a, b) => b.score - a.score)
              .map(({ doc }) => doc)
          : listed;
        const data = matched.slice(0, DOC_LIST_LIMIT);
        return context.json({ data, meta: { total: data.length } });
      },
    );

    kb.get(
      '/docs/:doc/file',
      describeRoute({
        tags: ['Studio'],
        summary: 'Download a knowledge file',
        description:
          'A file’s original bytes by slug or id, as an attachment; `kb read` gives its extracted text.',
        operationId: 'studioDownloadKnowledge',
        security: PERSON_OR_RUN,
        ...cliRoute({ command: 'kb download', action: READ_ACTION }),
        responses: {
          '200': { description: 'The file’s bytes.' },
          ...apiErrorResponses,
          '404': apiErrorResponse(404),
        },
      }),
      apiValidator('param', DocParams),
      apiValidator(
        'query',
        z.object({ version: z.coerce.number().int().positive().optional() }),
      ),
      async (context) => {
        const { doc } = context.req.valid('param');
        const { version } = context.req.valid('query');
        const content = await knowledge().files.content(
          await readerOf(context),
          doc,
          version === undefined ? {} : { version },
        );
        return new Response(content.body, {
          headers: {
            'content-type': content.file.mimeType,
            'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(content.file.filename)}`,
          },
        });
      },
    );

    /** What the projects plugin hides from someone answers as not found, rather than as a failure. */
    const seenByPerson = async <T>(read: () => Promise<T>): Promise<T> => {
      try {
        return await read();
      } catch (failure) {
        if (failure instanceof DomainError)
          throw new ApiError({
            status: 'NOT_FOUND',
            reason: 'OFFER_NOT_FOUND',
            domain: DOMAIN,
            message: 'No such issue or file.',
          });
        throw failure;
      }
    };

    /** The people who decide about an offer: who sent the file, or who owns the issue now. */
    const offerRights = async (context: Context<Env>, offer: Row) => {
      const viewer = await peopleViewer(context);
      const issue = await seenByPerson(() =>
        container
          .resolve(projectsToken)
          .issueQueries.visible(viewer, str(offer.issueId)),
      );
      const attachment = await seenByPerson(() =>
        container
          .resolve(projectsToken)
          .attachments.get(viewer, str(offer.attachmentId)),
      );
      return {
        viewer,
        issue,
        attachment,
        canDecide:
          issue.ownerUserId === viewer.userId ||
          (attachment.uploader.type === 'user' &&
            attachment.uploader.id === viewer.userId),
      };
    };

    const offerOf = (row: Row) => ({
      id: str(row.id),
      issueId: str(row.issueId),
      attachmentId: str(row.attachmentId),
      reason: str(row.reason),
      status: OfferStatus.parse(str(row.status)),
      targetScope: strOrNull(row.targetScope) as 'project' | 'system' | null,
      targetScopeId: strOrNull(row.targetScopeId),
      decidedById: strOrNull(row.decidedById),
      docId: strOrNull(row.docId),
    });

    const offerRow = async (id: string): Promise<Row> => {
      const row: Row | undefined = await conn()
        .query.selectFrom(OFFERS)
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();
      if (!row)
        throw new ApiError({
          status: 'NOT_FOUND',
          reason: 'OFFER_NOT_FOUND',
          domain: DOMAIN,
          message: 'No such offer.',
        });
      return row;
    };

    kb.post(
      '/offers',
      describeRoute({
        tags: ['Studio'],
        summary: 'Suggest keeping a file as knowledge',
        description:
          'Only a task run can suggest an original file uploaded by a person on that task. At most three new suggestions per run; repeated requests return the existing suggestion. This never pauses work or sends notifications. Continue working without waiting for a reply.',
        operationId: 'studioOfferKnowledge',
        security: [{ runToken: [] }],
        ...cliRoute({ command: 'kb offer', action: PROPOSE_ACTION }),
        responses: {
          '201': dataResponse(OfferSchema),
          ...apiErrorResponses,
          '404': apiErrorResponse(404),
        },
      }),
      apiValidator(
        'json',
        z.object({
          attachmentId: z.string().min(1),
          reason: z.string().trim().min(1).max(2_000),
        }),
      ),
      async (context) => {
        const session = context.get('auth');
        const run = session ? runIdentityOf(session) : null;
        if (!run?.run || run.run.run.subjectKind !== ISSUE_SUBJECT)
          throw new ApiError({
            status: 'PERMISSION_DENIED',
            reason: 'RUN_REQUIRED',
            domain: DOMAIN,
            message: 'Only an agent’s run on an issue suggests a file.',
          });
        if (
          !(await container.resolve(agentsToken).gate.allowed(run)).has(
            PROPOSE_ACTION,
          )
        )
          throw new ApiError({
            status: 'PERMISSION_DENIED',
            reason: 'ACTION_NOT_ALLOWED',
            domain: DOMAIN,
            message: `This agent lacks ${PROPOSE_ACTION}.`,
          });
        const issueId = run.run.run.subjectId;
        const runId = run.run.run.id;
        const { attachmentId, reason } = context.req.valid('json');
        const attachment: Row | undefined = await conn()
          .query.selectFrom('pmAttachments')
          .select(['issueId', 'uploaderType'])
          .where('id', '=', attachmentId)
          .executeTakeFirst();
        if (
          !attachment ||
          str(attachment.issueId) !== issueId ||
          str(attachment.uploaderType) !== 'user'
        )
          throw new ApiError({
            status: 'NOT_FOUND',
            reason: 'ATTACHMENT_NOT_FOUND',
            domain: DOMAIN,
            message: 'No file a person sent on this issue has that id.',
          });
        const existing: Row | undefined = await conn()
          .query.selectFrom(OFFERS)
          .selectAll()
          .where('issueId', '=', issueId)
          .where('attachmentId', '=', attachmentId)
          .executeTakeFirst();
        if (existing) return context.json({ data: offerOf(existing) }, 201);
        const fromRun = await conn()
          .query.selectFrom(OFFERS)
          .select(['id'])
          .where('runId', '=', runId)
          .execute();
        if (fromRun.length >= OFFERS_PER_RUN)
          throw new ApiError({
            status: 'FAILED_PRECONDITION',
            reason: 'OFFER_LIMIT_REACHED',
            domain: DOMAIN,
            message: `A run suggests at most ${OFFERS_PER_RUN} files.`,
          });
        const id = randomUUID();
        await conn()
          .query.insertInto(OFFERS)
          .values({
            id,
            issueId,
            attachmentId,
            runId,
            reason,
            status: 'pending',
            createdAt: new Date(),
          })
          .execute();
        return context.json({ data: offerOf(await offerRow(id)) }, 201);
      },
    );

    kb.get(
      '/offers',
      describeRoute({
        tags: ['Studio'],
        summary: 'What agents suggest keeping from an issue',
        description:
          'One batch for issue and comment attachments, with current uploader/owner decision rights. Removed files are excluded.',
        operationId: 'studioListKnowledgeOffers',
        security: PERSON,
        ...cliRoute(false),
        responses: {
          '200': dataResponse(
            z.array(OfferSchema.extend({ canDecide: z.boolean() })),
          ),
          ...apiErrorResponses,
          '404': apiErrorResponse(404),
        },
      }),
      apiValidator('query', z.object({ issueId: z.string().min(1) })),
      async (context) => {
        const { issueId } = context.req.valid('query');
        const viewer = await peopleViewer(context);
        const issue = await seenByPerson(() =>
          container
            .resolve(projectsToken)
            .issueQueries.visible(viewer, issueId),
        );
        const rows: Row[] = await conn()
          .query.selectFrom(OFFERS)
          .selectAll()
          .where('issueId', '=', issue.id)
          .orderBy('createdAt')
          .execute();
        const live: Row[] = rows.length
          ? await conn()
              .query.selectFrom('pmAttachments')
              .select(['id', 'uploaderType', 'uploaderId'])
              .where(
                'id',
                'in',
                rows.map((row) => str(row.attachmentId)),
              )
              .execute()
          : [];
        const files = new Map(live.map((row) => [str(row.id), row]));
        return context.json({
          data: rows.flatMap((row) => {
            const file = files.get(str(row.attachmentId));
            if (!file) return [];
            return [
              {
                ...offerOf(row),
                canDecide:
                  issue.ownerUserId === viewer.userId ||
                  (str(file.uploaderType) === 'user' &&
                    str(file.uploaderId) === viewer.userId),
              },
            ];
          }),
        });
      },
    );

    kb.post(
      '/offers/:offerId/accept',
      describeRoute({
        tags: ['Studio'],
        summary: 'Keep the suggested file as knowledge',
        description:
          'Only the human uploader or current task owner can decide. Saving checks the confirming person’s edit access and uses that person as author. A saving result must not be automatically retried; reconcile uncertain uploads manually.',
        operationId: 'studioAcceptKnowledgeOffer',
        security: PERSON,
        ...cliRoute(false),
        responses: {
          '200': dataResponse(OfferSchema),
          ...apiErrorResponses,
          '404': apiErrorResponse(404),
        },
      }),
      apiValidator('param', OfferParams),
      apiValidator(
        'json',
        z.object({ scope: z.enum(['project', 'system']).optional() }),
      ),
      async (context) => {
        const row = await offerRow(context.req.valid('param').offerId);
        const { viewer, issue, attachment, canDecide } = await offerRights(
          context,
          row,
        );
        if (!canDecide) throw offerDenied();
        if (str(row.status) !== 'pending') throw offerDecided(str(row.status));
        const scope =
          context.req.valid('json').scope ??
          (issue.projectId ? 'project' : 'system');
        if (scope === 'project' && !issue.projectId)
          throw new ApiError({
            status: 'INVALID_ARGUMENT',
            reason: 'ISSUE_HAS_NO_PROJECT',
            domain: DOMAIN,
            message: 'This issue has no project to keep the file in.',
          });
        const scopeId = scope === 'project' ? (issue.projectId ?? '') : '';
        const reader = { userId: viewer.userId };
        // Claimed first: saving a file twice is worse than an offer left `saving` to reconcile by hand.
        const claimed = await conn()
          .query.updateTable(OFFERS)
          .set({
            status: 'saving',
            targetScope: scope,
            targetScopeId: scopeId,
            decidedById: viewer.userId,
            decidedAt: new Date(),
          })
          .where('id', '=', str(row.id))
          .where('status', '=', 'pending')
          .execute();
        if ((claimed.updatedCount ?? 1) === 0) throw offerDecided('saving');
        const content = await container
          .resolve(projectsToken)
          .attachments.content(viewer, attachment.id);
        const bytes = await new Response(content.body).blob();
        const doc = await knowledge().files.upload(
          reader,
          { scope, scopeId },
          new File([bytes], attachment.filename, {
            type: attachment.mimeType,
          }),
        );
        await conn()
          .query.updateTable(OFFERS)
          .set({ status: 'saved', docId: doc.id })
          .where('id', '=', str(row.id))
          .execute();
        return context.json({ data: offerOf(await offerRow(str(row.id))) });
      },
    );

    kb.post(
      '/offers/:offerId/reject',
      describeRoute({
        tags: ['Studio'],
        summary: 'Decline the suggested file',
        description:
          'Only the human uploader or current task owner can decide.',
        operationId: 'studioRejectKnowledgeOffer',
        security: PERSON,
        ...cliRoute(false),
        responses: {
          '200': dataResponse(OfferSchema),
          ...apiErrorResponses,
          '404': apiErrorResponse(404),
        },
      }),
      apiValidator('param', OfferParams),
      async (context) => {
        const row = await offerRow(context.req.valid('param').offerId);
        const { viewer, canDecide } = await offerRights(context, row);
        if (!canDecide) throw offerDenied();
        if (str(row.status) !== 'pending') throw offerDecided(str(row.status));
        await conn()
          .query.updateTable(OFFERS)
          .set({
            status: 'declined',
            decidedById: viewer.userId,
            decidedAt: new Date(),
          })
          .where('id', '=', str(row.id))
          .execute();
        return context.json({ data: offerOf(await offerRow(str(row.id))) });
      },
    );

    kb.get(
      '/tree',
      describeRoute({
        tags: ['Studio'],
        summary: 'Get the knowledge documents as a tree',
        description:
          'The folders and documents of one space (the system space by default) and of what it inherits.',
        operationId: 'studioKnowledgeTree',
        security: PERSON_OR_RUN,
        ...cliRoute({ command: 'kb tree', action: READ_ACTION }),
        responses: { '200': dataResponse(loose), ...apiErrorResponses },
      }),
      apiValidator('query', SpaceQuery),
      async (context) => {
        const reader = await readerOf(context);
        const space = spaceOf(context.req.valid('query')) ?? SYSTEM_SPACE;
        return context.json({
          data: await knowledge().docs.tree(reader, space),
        });
      },
    );

    const directory = new Hono<Env>();
    for (const path of ['/', '/*'])
      directory.use(path, auth.required(), authz.middleware());

    directory.get(
      '/',
      describeRoute({
        tags: ['Studio'],
        summary: 'List authorized knowledge spaces and document counts',
        operationId: 'studioKnowledgeDirectory',
        security: PERSON,
        ...cliRoute({ hidden: true }),
        responses: { '200': listResponse(SummarySchema), ...apiErrorResponses },
      }),
      async (context) => {
        const reader = await readerOf(context);
        const data = await knowledge().docs.summaries(
          reader,
          await directorySpaces(context),
        );
        return context.json({ data, meta: { count: data.length } });
      },
    );

    directory.get(
      '/search',
      describeRoute({
        tags: ['Studio'],
        summary: 'Search all authorized knowledge spaces',
        operationId: 'studioKnowledgeDirectorySearch',
        security: PERSON,
        ...cliRoute({ hidden: true }),
        responses: {
          '200': listResponse(SearchHitSchema),
          ...apiErrorResponses,
        },
      }),
      apiValidator('query', z.object({ q: z.string().trim().min(1).max(500) })),
      async (context) => {
        const { q } = context.req.valid('query');
        const reader = await readerOf(context);
        const data = await knowledge().docs.searchMany(
          reader,
          await directorySpaces(context),
          q,
          { limit: 30 },
        );
        return context.json({ data, meta: { count: data.length } });
      },
    );

    const root = new Hono();
    root.route('/kb', kb);
    root.route('/knowledgeDirectory', directory);
    return root;
  },
);
