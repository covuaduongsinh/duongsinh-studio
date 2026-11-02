#!/usr/bin/env node
/**
 * Imports a folder of Markdown into one knowledge space of Dương Sinh Studio, through the HTTP API, idempotently: each
 * sub-folder becomes a knowledge folder of the same name, each `.md` file an article whose slug comes from its file
 * name. Run it again after the files change: an unchanged article is left alone, a changed one gets a new version, a
 * new file a new article. Nothing is archived or deleted.
 *
 *   node scripts/kb-import.mjs <dir> [--scope system|project] [--owner <projectId>] [--dry-run]
 *
 * Where and as whom (never printed): `DS_STUDIO_URL` (default `http://127.0.0.1:13100/main`) and either
 * `DS_STUDIO_COOKIE_FILE` (a Netscape cookie jar of a signed-in session, as `curl -c` writes it) or `DS_STUDIO_API_KEY`.
 * Check what you import first: the knowledge is read by every person and agent the space lets read.
 */
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** As `KNOWLEDGE_SLUG_PATTERN` of the knowledge plugin: lower-case letters, digits and hyphens, at most 64. */
export function slugOf(fileName) {
  const slug = basename(fileName, extname(fileName))
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/đ/gu, 'd')
    .replace(/Đ/gu, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 64)
    .replace(/-+$/u, '');
  return slug || 'tai-lieu';
}

/** The first `# ` heading of the Markdown, else the file name without its extension. */
export function titleOf(fileName, content) {
  const heading = /^#\s+(.+?)\s*#*\s*$/mu.exec(content);
  return (heading?.[1] ?? basename(fileName, extname(fileName))).slice(0, 200);
}

/** The Markdown files and sub-folders of `dir`, depth first, sorted by name; hidden entries are skipped. */
export async function collect(dir, folder = []) {
  const entries = (await readdir(dir, { withFileTypes: true }))
    .filter((entry) => !entry.name.startsWith('.'))
    .sort((a, b) => a.name.localeCompare(b.name));
  const items = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      items.push({ kind: 'folder', folder, title: entry.name });
      items.push(...(await collect(path, [...folder, entry.name])));
    } else if (entry.isFile() && extname(entry.name).toLowerCase() === '.md') {
      const content = await readFile(path, 'utf8');
      items.push({
        kind: 'article',
        folder,
        slug: slugOf(entry.name),
        title: titleOf(entry.name, content),
        content,
      });
    }
  }
  return items;
}

/**
 * What to do so the space holds `items`, given its live documents (`docs`: id, parentId, kind, slug, title): folders
 * are matched by title under their parent, articles by slug anywhere in the space. `contentOf(id)` reads an article's
 * current content and version. Answers the steps in order; `folderId` is resolved while the steps run.
 */
export async function plan(items, docs, contentOf) {
  const steps = [];
  const known = new Map(
    docs
      .filter((doc) => doc.kind === 'folder')
      .map((doc) => [`${doc.parentId ?? ''}/${doc.title}`, doc.id]),
  );
  const pathKey = (folder) => folder.join('/');
  const folderIds = new Map([['', null]]);
  for (const item of items) {
    const parentKey = pathKey(item.folder);
    if (item.kind === 'folder') {
      // Undefined while the parent is itself still to be created: then nothing under it exists yet.
      const parentId = folderIds.get(parentKey);
      const ownKey = pathKey([...item.folder, item.title]);
      const existing =
        parentId === undefined
          ? undefined
          : known.get(`${parentId ?? ''}/${item.title}`);
      if (existing) {
        folderIds.set(ownKey, existing);
        steps.push({
          action: 'keep-folder',
          title: item.title,
          id: existing,
          ownKey,
        });
      } else {
        folderIds.set(ownKey, undefined);
        steps.push({
          action: 'create-folder',
          title: item.title,
          parentKey,
          ownKey,
        });
      }
      continue;
    }
    const existing = docs.find(
      (doc) => doc.kind === 'article' && doc.slug === item.slug,
    );
    if (!existing) {
      steps.push({
        action: 'create',
        slug: item.slug,
        title: item.title,
        content: item.content,
        parentKey,
      });
      continue;
    }
    const current = await contentOf(existing.id);
    if (current.content === item.content && current.title === item.title) {
      steps.push({ action: 'keep', slug: item.slug, id: existing.id });
    } else {
      steps.push({
        action: 'update',
        slug: item.slug,
        id: existing.id,
        title: item.title,
        content: item.content,
        expectedVersion: current.version,
      });
    }
  }
  return steps;
}

function cookieHeader(text) {
  return text
    .split('\n')
    .map((line) => line.replace(/^#HttpOnly_/u, ''))
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => line.split('\t'))
    .filter((parts) => parts.length >= 7)
    .map((parts) => `${parts[5]}=${parts[6]}`)
    .join('; ');
}

/** A client of the Studio API with the caller's credentials; errors never carry them. */
export async function clientFromEnv(env = process.env) {
  const base = `${(env.DS_STUDIO_URL ?? 'http://127.0.0.1:13100/main').replace(/\/+$/u, '')}/api`;
  const origin = new URL(base).origin;
  const headers = { origin };
  if (env.DS_STUDIO_COOKIE_FILE)
    headers.cookie = cookieHeader(
      await readFile(env.DS_STUDIO_COOKIE_FILE, 'utf8'),
    );
  else if (env.DS_STUDIO_API_KEY) headers['x-api-key'] = env.DS_STUDIO_API_KEY;
  else throw new Error('Set DS_STUDIO_COOKIE_FILE or DS_STUDIO_API_KEY.');
  return async (method, path, body) => {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: {
        ...headers,
        ...(body === undefined
          ? {}
          : {
              'content-type': 'application/json',
              'Idempotency-Key': `${Date.now()}.${randomUUID()}`,
            }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const answer = await response.json().catch(() => null);
    if (!response.ok)
      throw new Error(
        `${method} ${path} answered ${response.status}: ${answer?.error?.message ?? answer?.message ?? 'no message'}`,
      );
    return answer?.data;
  };
}

export async function importDirectory({
  dir,
  scope = 'system',
  owner = '',
  dryRun = false,
  call,
}) {
  const space = new URLSearchParams({ scope, scopeId: owner }).toString();
  // The space and what it inherits, each with its documents (`GET /api/knowledge/spaces`).
  const spaces = await call('GET', `/knowledge/spaces?${space}`);
  const own = spaces.find(
    (entry) => entry.space.scope === scope && entry.space.scopeId === owner,
  );
  const docs = own?.docs ?? [];
  const items = await collect(dir);
  const steps = await plan(items, docs, async (id) => {
    const doc = await call('GET', `/knowledge/docs/${encodeURIComponent(id)}`);
    return { content: doc.content, title: doc.title, version: doc.version };
  });
  if (dryRun) return steps;
  const folderIds = new Map([['', null]]);
  for (const step of steps) {
    if (step.action === 'keep-folder') folderIds.set(step.ownKey, step.id);
    if (step.action === 'create-folder') {
      const created = await call('POST', '/knowledge/docs', {
        scope,
        scopeId: owner,
        kind: 'folder',
        parentId: folderIds.get(step.parentKey) ?? null,
        title: step.title,
      });
      folderIds.set(step.ownKey, created.id);
      step.id = created.id;
    } else if (step.action === 'create') {
      const created = await call('POST', '/knowledge/docs', {
        scope,
        scopeId: owner,
        parentId: folderIds.get(step.parentKey) ?? null,
        title: step.title,
        slug: step.slug,
        content: step.content,
      });
      step.id = created.id;
    } else if (step.action === 'update') {
      await call('PATCH', `/knowledge/docs/${encodeURIComponent(step.id)}`, {
        expectedVersion: step.expectedVersion,
        title: step.title,
        content: step.content,
        note: 'kb-import',
      });
    }
  }
  return steps;
}

function parseArgs(argv) {
  const options = { scope: 'system', owner: '', dryRun: false };
  const rest = [];
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--scope') options.scope = argv[(index += 1)];
    else if (value === '--owner') options.owner = argv[(index += 1)];
    else if (value === '--dry-run') options.dryRun = true;
    else rest.push(value);
  }
  if (rest.length !== 1)
    throw new Error(
      'Usage: node scripts/kb-import.mjs <dir> [--scope system|project] [--owner <projectId>] [--dry-run]',
    );
  return { ...options, dir: resolve(rest[0]) };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const steps = await importDirectory({
    ...options,
    call: await clientFromEnv(),
  });
  for (const step of steps)
    console.log(
      `${step.action}\t${step.slug ?? step.title}${step.id ? `\t${step.id}` : ''}`,
    );
  const count = (action) =>
    steps.filter((step) => step.action === action).length;
  console.log(
    `${options.dryRun ? 'Would create' : 'Created'} ${count('create')} articles and ${count('create-folder')} folders, ${options.dryRun ? 'would update' : 'updated'} ${count('update')}, left ${count('keep')} unchanged.`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
