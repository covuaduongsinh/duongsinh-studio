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
  scope: z
    .enum([SYSTEM_SCOPE, PROJECT_SCOPE])
    .optional()
    .meta({
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
  doc: z
    .string()
    .min(1)
    .max(200)
    .meta({
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
