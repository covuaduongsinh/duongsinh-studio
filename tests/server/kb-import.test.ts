// @vitest-environment node
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error The import script is plain JavaScript run with node; its shapes are checked by these tests.
import { importDirectory, slugOf, titleOf } from '../../scripts/kb-import.mjs';

interface Doc {
  id: string;
  parentId: string | null;
  kind: 'folder' | 'article';
  slug: string;
  title: string;
  content: string;
  version: number;
}

/** The knowledge API as the import script calls it, over an in-memory space. */
function fakeSpace() {
  const docs: Doc[] = [];
  const calls: string[] = [];
  let next = 1;
  const call = async (
    method: string,
    path: string,
    body?: Record<string, unknown>,
  ) => {
    calls.push(`${method} ${path.split('?')[0]}`);
    if (method === 'GET' && path.startsWith('/knowledge/spaces'))
      return [
        {
          space: { scope: 'system', scopeId: '' },
          docs: docs.map(({ content: _content, ...doc }) => doc),
        },
      ];
    if (method === 'GET' && path.startsWith('/knowledge/docs/')) {
      const doc = docs.find(
        (item) =>
          item.id === decodeURIComponent(path.slice('/knowledge/docs/'.length)),
      );
      if (!doc) throw new Error('missing');
      return doc;
    }
    if (method === 'POST' && path === '/knowledge/docs') {
      const kind = body?.kind === 'folder' ? 'folder' : 'article';
      const doc: Doc = {
        id: `d${next++}`,
        parentId: (body?.parentId as string | null) ?? null,
        kind,
        slug: String(body?.slug ?? `folder-${next}`),
        title: String(body?.title),
        content: String(body?.content ?? ''),
        version: 1,
      };
      docs.push(doc);
      return doc;
    }
    if (method === 'PATCH') {
      const doc = docs.find((item) => item.id === path.split('/').pop());
      if (!doc || doc.version !== body?.expectedVersion)
        throw new Error('conflict');
      doc.content = String(body?.content);
      doc.title = String(body?.title);
      doc.version += 1;
      return doc;
    }
    throw new Error(`unexpected ${method} ${path}`);
  };
  return { docs, calls, call };
}

describe('kb-import', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'kb-import-'));
    await writeFile(
      join(dir, 'Kế hoạch phát triển.md'),
      '# Kế hoạch phát triển Studio\n\nS0 → S6.',
    );
    await mkdir(join(dir, 'Quy trình'));
    await writeFile(
      join(dir, 'Quy trình', 'merge.md'),
      'Chủ dự án merge sau khi CI xanh.',
    );
    await writeFile(join(dir, 'Quy trình', 'ghi-chu.txt'), 'not markdown');
    await writeFile(join(dir, '.hidden.md'), 'skipped');
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('names articles by their file and heading', () => {
    expect(slugOf('Kế hoạch phát triển.md')).toBe('ke-hoach-phat-trien');
    expect(slugOf('2026-11-01-nocobase-studio-dac-ta.md')).toBe(
      '2026-11-01-nocobase-studio-dac-ta',
    );
    expect(slugOf('Đường đi.md')).toBe('duong-di');
    expect(slugOf('x'.repeat(80) + '.md')).toHaveLength(64);
    expect(titleOf('a.md', 'intro\n# Tiêu đề\n')).toBe('Tiêu đề');
    expect(titleOf('quy-trinh.md', 'no heading')).toBe('quy-trinh');
  });

  it('plans without writing on a dry run, creates folders and articles once, and updates only what changed', async () => {
    const space = fakeSpace();
    const dry = await importDirectory({ dir, dryRun: true, call: space.call });
    expect(dry.map((step: { action: string }) => step.action)).toEqual([
      'create',
      'create-folder',
      'create',
    ]);
    expect(space.docs).toHaveLength(0);

    await importDirectory({ dir, call: space.call });
    expect(space.docs.map((doc) => [doc.kind, doc.title])).toEqual([
      ['article', 'Kế hoạch phát triển Studio'],
      ['folder', 'Quy trình'],
      ['article', 'merge'],
    ]);
    const folder = space.docs[1];
    expect(space.docs[2].parentId).toBe(folder.id);

    // Run again: nothing changes.
    const again = await importDirectory({ dir, call: space.call });
    expect(again.map((step: { action: string }) => step.action)).toEqual([
      'keep',
      'keep-folder',
      'keep',
    ]);
    expect(space.docs).toHaveLength(3);

    // A changed file becomes the article's next version.
    await writeFile(
      join(dir, 'Quy trình', 'merge.md'),
      'Chủ dự án merge sau khi CI xanh và review chéo đạt.',
    );
    const changed = await importDirectory({ dir, call: space.call });
    expect(changed.map((step: { action: string }) => step.action)).toEqual([
      'keep',
      'keep-folder',
      'update',
    ]);
    expect(space.docs[2]).toMatchObject({
      version: 2,
      content: expect.stringContaining('review chéo'),
    });
  });
});
