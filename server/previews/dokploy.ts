/**
 * The only module that talks to Dokploy. The API key Studio holds reaches the whole Dokploy account (production included,
 * docs/trien-khai-vps.md), so this client is narrowed by construction: it creates composes only in the configured
 * project's environment and only under the names in `PREVIEW_COMPOSE_NAMES`, and every call on an existing compose is
 * refused unless its id is one Studio recorded (`allowedIds`) AND Dokploy itself answers, before the call, that the compose
 * has one of those names in that environment. Nothing here reaches domains, servers, users, settings or other projects.
 */

/** The composes Studio may create and drive, one per environment it runs (S5.6). */
export const PREVIEW_COMPOSE_NAMES = [
  'nocobase-preview',
  'nocobase-staging',
] as const;
export type PreviewComposeName = (typeof PREVIEW_COMPOSE_NAMES)[number];

const TIMEOUT_MS = 20_000;

export class DokployError extends Error {
  override name = 'DokployError';
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** A call the allowlist refuses: never sent to Dokploy. */
export class DokployRefused extends Error {
  override name = 'DokployRefused';
}

export interface DokployConfig {
  /** `https://dokploy.example.com` (no `/api`). */
  readonly url: string;
  readonly apiKey: string;
  /** The Dokploy project Studio's own compose lives in. */
  readonly projectId: string;
  /** Its environment's name (`production` in Dokploy's terms: where Studio itself runs). */
  readonly environmentName?: string;
}

export interface DokployCompose {
  readonly composeId: string;
  readonly name: string;
  readonly appName: string;
  readonly environmentId: string;
  readonly status: string;
}

export interface DokployClient {
  /** The environment composes are created in (resolved once from the project). */
  environmentId(): Promise<string>;
  create(name: PreviewComposeName): Promise<DokployCompose>;
  get(composeId: string): Promise<DokployCompose>;
  update(
    composeId: string,
    input: { readonly composeFile: string; readonly env: string },
  ): Promise<void>;
  deploy(composeId: string, title: string): Promise<void>;
  stop(composeId: string): Promise<void>;
  start(composeId: string): Promise<void>;
  /** Removes the compose with its volumes. */
  remove(composeId: string): Promise<void>;
}

type Json = Record<string, unknown>;
const record = (value: unknown): Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Json)
    : {};
const text = (value: unknown): string =>
  typeof value === 'string' ? value : '';

const isAllowedName = (name: string): name is PreviewComposeName =>
  (PREVIEW_COMPOSE_NAMES as readonly string[]).includes(name);

export function createDokployClient(
  config: DokployConfig,
  allowedIds: () => Promise<ReadonlySet<string>>,
): DokployClient {
  const base = `${config.url.replace(/\/+$/u, '')}/api`;
  let environment: string | null = null;

  async function call(
    method: 'GET' | 'POST',
    path: string,
    body?: Json,
  ): Promise<unknown> {
    let response: Response;
    try {
      response = await globalThis.fetch(`${base}/${path}`, {
        method,
        headers: {
          'x-api-key': config.apiKey,
          accept: 'application/json',
          ...(body ? { 'content-type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      throw new DokployError(
        0,
        `Dokploy could not be reached: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    const raw = await response.text();
    let answer: unknown;
    try {
      answer = raw ? JSON.parse(raw) : null;
    } catch {
      answer = raw;
    }
    if (!response.ok)
      throw new DokployError(
        response.status,
        `Dokploy answered ${response.status} to ${path}: ${text(record(answer).message) || 'no message'}`,
      );
    return answer;
  }

  const composeOf = (value: unknown): DokployCompose => {
    const compose = record(value);
    return {
      composeId: text(compose.composeId),
      name: text(compose.name),
      appName: text(compose.appName),
      environmentId: text(compose.environmentId),
      status: text(compose.composeStatus),
    };
  };

  async function environmentId(): Promise<string> {
    if (environment) return environment;
    const project = record(
      await call(
        'GET',
        `project.one?projectId=${encodeURIComponent(config.projectId)}`,
      ),
    );
    const wanted = config.environmentName ?? 'production';
    const found = (
      Array.isArray(project.environments) ? project.environments : []
    )
      .map(record)
      .find((item) => text(item.name) === wanted);
    if (!found || !text(found.environmentId))
      throw new DokployRefused(
        `The Dokploy project has no environment ${wanted}.`,
      );
    environment = text(found.environmentId);
    return environment;
  }

  /** The compose, after checking it is one Studio recorded and Dokploy says it is ours: else the call is refused. */
  async function guarded(composeId: string): Promise<DokployCompose> {
    if (!composeId || !(await allowedIds()).has(composeId))
      throw new DokployRefused(
        `Compose ${composeId || '(none)'} is not one Studio created for previews.`,
      );
    const compose = composeOf(
      await call(
        'GET',
        `compose.one?composeId=${encodeURIComponent(composeId)}`,
      ),
    );
    if (
      compose.composeId !== composeId ||
      !isAllowedName(compose.name) ||
      compose.environmentId !== (await environmentId())
    )
      throw new DokployRefused(
        `Compose ${composeId} is not a preview compose of Studio's project.`,
      );
    return compose;
  }

  return {
    environmentId,
    async create(name) {
      if (!isAllowedName(name))
        throw new DokployRefused(
          `Studio does not create a compose named ${String(name)}.`,
        );
      const created = composeOf(
        await call('POST', 'compose.create', {
          name,
          environmentId: await environmentId(),
          composeType: 'docker-compose',
          sourceType: 'raw',
          composeFile: 'services: {}\n',
          description:
            'Created by Dương Sinh Studio for NocoBase 2 previews; Studio replaces and removes it.',
        }),
      );
      if (!created.composeId)
        throw new DokployError(500, 'Dokploy created no compose id.');
      return created;
    },
    get: guarded,
    async update(composeId, input) {
      await guarded(composeId);
      await call('POST', 'compose.update', {
        composeId,
        composeFile: input.composeFile,
        env: input.env,
        sourceType: 'raw',
        composeType: 'docker-compose',
      });
    },
    async deploy(composeId, title) {
      await guarded(composeId);
      await call('POST', 'compose.deploy', {
        composeId,
        title,
        description: title,
      });
    },
    async stop(composeId) {
      await guarded(composeId);
      await call('POST', 'compose.stop', { composeId });
    },
    async start(composeId) {
      await guarded(composeId);
      await call('POST', 'compose.start', { composeId });
    },
    async remove(composeId) {
      await guarded(composeId);
      await call('POST', 'compose.delete', { composeId, deleteVolumes: true });
    },
  };
}
