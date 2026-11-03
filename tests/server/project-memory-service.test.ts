// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  GitHubError,
  type GitHubClient,
  type GitHubContentEntry,
} from '../../server/git/github.js';
import type { GitRepositoryView } from '../../server/git/service.js';
import {
  MEMORY_LIMIT,
  isMemoryPath,
  parseMemory,
} from '../../server/memory/parse.js';
import {
  MEMORY_CHECK_MS,
  MemoryError,
  createMemoryService,
} from '../../server/memory/service.js';
import { createMemorySection } from '../../server/providers/memory.js';

const memoryText = (name: string, type: string, modified: string, body = 'Nội dung.') =>
  `---\nname: ${name}\ndescription: Mô tả ${name}\ntype: ${type}\nmodified: ${modified}\n---\n\n${body}\n`;

const repository: GitRepositoryView = {
  id: 'repo-1',
  connectionId: 'conn-1',
  provider: 'github',
  repo: 'acme/sandbox',
  cloneUrl: 'https://github.test/acme/sandbox.git',
  webUrl: 'https://github.test/acme/sandbox',
  defaultBranch: 'main',
  branchPrefix: 'agent/',
  checksSource: 'host',
  requiredChecks: [],
  pollSeconds: 60,
  polledAt: null,
  pollError: null,
  projects: [{ projectId: 'project-1', isPrimary: true }],
};

/** GitHub as one branch head and its memory files; counts what is asked. */
function fakeClient(state: {
  head: string;
  files: Record<string, { text: string; sha: string }>;
  fail?: GitHubError;
  calls: string[];
}): GitHubClient {
  const refuse = async (): Promise<never> => {
    throw new Error('not used');
  };
  return {
    viewer: refuse,
    repository: refuse,
    pulls: refuse,
    pull: refuse,
    openPullsFrom: refuse,
    createPull: refuse,
    checks: refuse,
    merge: refuse,
    comment: refuse,
    tags: refuse,
    compare: refuse,
    commitDate: refuse,
    runArtifacts: refuse,
    async branchHead(_repo, branch) {
      state.calls.push(`head ${branch}`);
      if (state.fail) throw state.fail;
      return state.head;
    },
    async directory(_repo, path, ref) {
      state.calls.push(`dir ${path}@${ref}`);
      return Object.entries(state.files).map(
        ([name, file]): GitHubContentEntry => ({
          name,
          path: `${path}/${name}`,
          type: 'file',
          sha: file.sha,
          size: Buffer.byteLength(file.text),
        }),
      );
    },
    async file(_repo, path, ref) {
      state.calls.push(`file ${path}@${ref}`);
      const name = path.split('/').pop() ?? '';
      const file = state.files[name];
      if (!file) throw new GitHubError(404, 'Not Found');
      return { path, sha: file.sha, size: Buffer.byteLength(file.text), text: file.text };
    },
  };
}

describe('memory files', () => {
  it('reads the front matter NocoBase’s own memories use', () => {
    const parsed = parseMemory(
      memoryText('Giữ nút mẫu cạnh nhãn', 'feedback', '2026-10-29', 'Thân bài.\n\n**Vì sao:** vì.'),
      'fallback',
    );
    expect(parsed).toMatchObject({
      name: 'Giữ nút mẫu cạnh nhãn',
      description: 'Mô tả Giữ nút mẫu cạnh nhãn',
      type: 'feedback',
      modified: '2026-10-29',
      problems: [],
    });
    expect(parsed.body).toBe('Thân bài.\n\n**Vì sao:** vì.');
  });

  it('names what is wrong instead of dropping the file', () => {
    expect(parseMemory('Chỉ có thân bài.', 'slug')).toMatchObject({
      name: 'slug',
      type: null,
      problems: ['noFrontMatter'],
    });
    expect(parseMemory('---\r\nname: "X"\r\ntype: other\r\n---\r\nBody', 'slug')).toMatchObject({
      name: 'X',
      type: null,
      problems: ['unknownType'],
      body: 'Body',
    });
  });

  it('accepts only files directly inside the memory directory', () => {
    expect(isMemoryPath('.nb-studio/memory/a-b_c.md')).toBe(true);
    expect(isMemoryPath('.nb-studio/memory/../secrets.md')).toBe(false);
    expect(isMemoryPath('.nb-studio/memory/sub/a.md')).toBe(false);
    expect(isMemoryPath('.nb-studio/memory/a.txt')).toBe(false);
    expect(isMemoryPath('README.md')).toBe(false);
  });
});

describe('memory service', () => {
  it('reads the default branch, newest first, and keeps it for a minute', async () => {
    const state = {
      head: 'a'.repeat(40),
      files: {
        'old.md': { text: memoryText('Cũ', 'project', '2026-10-01'), sha: 'blob-old' },
        'new.md': { text: memoryText('Mới', 'feedback', '2026-11-01'), sha: 'blob-new' },
      },
      calls: [] as string[],
    };
    let clock = 1_000_000;
    const service = createMemoryService({ client: async () => fakeClient(state), now: () => clock });

    const first = await service.readRepository(repository);
    expect(first).toMatchObject({
      ref: `main@${'a'.repeat(7)}`,
      total: 2,
      unavailable: null,
      webUrl: 'https://github.test/acme/sandbox/tree/main/.nb-studio/memory',
    });
    expect(first.memories.map((item) => item.name)).toEqual(['Mới', 'Cũ']);
    const asked = state.calls.length;

    // Within the minute GitHub is not asked again.
    clock += MEMORY_CHECK_MS - 1;
    await service.readRepository(repository);
    expect(state.calls.length).toBe(asked);

    // A new head re-lists the directory and fetches only the changed blob.
    clock += 2;
    state.head = 'b'.repeat(40);
    state.files['new.md'] = { text: memoryText('Mới hơn', 'feedback', '2026-11-02'), sha: 'blob-new-2' };
    state.calls.length = 0;
    const second = await service.readRepository(repository);
    expect(second.memories[0].name).toBe('Mới hơn');
    expect(state.calls.filter((call) => call.startsWith('file'))).toEqual([
      `file .nb-studio/memory/new.md@${'b'.repeat(40)}`,
    ]);

    // The same head again only checks the head.
    clock += MEMORY_CHECK_MS;
    state.calls.length = 0;
    await service.readRepository(repository);
    expect(state.calls).toEqual(['head main']);
  });

  it('answers an empty memory when the directory does not exist, and says why when GitHub refuses', async () => {
    const state = { head: 'c'.repeat(40), files: {}, calls: [] as string[] };
    const service = createMemoryService({ client: async () => fakeClient(state) });
    expect(await service.readRepository(repository)).toMatchObject({ total: 0, memories: [], unavailable: null });

    const refused = { ...state, fail: new GitHubError(403, 'Forbidden') };
    const other = createMemoryService({ client: async () => fakeClient(refused) });
    expect(await other.readRepository(repository)).toMatchObject({
      commitSha: null,
      memories: [],
      unavailable: 'unreachable',
    });
    const away = createMemoryService({
      client: async () => fakeClient({ ...state, fail: new GitHubError(0, 'offline') }),
    });
    expect((await away.readRepository(repository)).unavailable).toBe('hostUnavailable');
  });

  it('marks oversize memories and stops at the limit', async () => {
    const files: Record<string, { text: string; sha: string }> = {
      'big.md': { text: memoryText('Lớn', 'reference', '2026-11-01', 'x'.repeat(5000)), sha: 'blob-big' },
    };
    for (let index = 0; index < MEMORY_LIMIT + 3; index++)
      files[`m${String(index).padStart(3, '0')}.md`] = {
        text: memoryText(`M${index}`, 'project', '2026-01-01'),
        sha: `blob-${index}`,
      };
    const service = createMemoryService({
      client: async () => fakeClient({ head: 'd'.repeat(40), files, calls: [] }),
    });
    const read = await service.readRepository(repository);
    expect(read.total).toBe(MEMORY_LIMIT + 4);
    expect(read.memories).toHaveLength(MEMORY_LIMIT);
    expect(read.memories.find((item) => item.slug === 'big')).toMatchObject({ oversize: true });
  });

  it('reads one memory, and refuses paths outside the memory directory', async () => {
    const state = {
      head: 'e'.repeat(40),
      files: { 'one.md': { text: memoryText('Một', 'feedback', '2026-11-01', 'Toàn văn.'), sha: 'blob-one' } },
      calls: [] as string[],
    };
    const service = createMemoryService({ client: async () => fakeClient(state) });
    expect(await service.readFile(repository, '.nb-studio/memory/one.md')).toMatchObject({
      name: 'Một',
      body: 'Toàn văn.',
      ref: `main@${'e'.repeat(7)}`,
    });
    await expect(service.readFile(repository, '.nb-studio/memory/../../config.yml')).rejects.toBeInstanceOf(
      MemoryError,
    );
    await expect(service.readFile(repository, '.nb-studio/memory/missing.md')).rejects.toMatchObject({
      reason: 'MEMORY_NOT_FOUND',
    });
  });
});

describe('memory brief section', () => {
  it('lists the issue project’s memories for issue runs only', async () => {
    const state = {
      head: 'f'.repeat(40),
      files: { 'one.md': { text: memoryText('Một', 'feedback', '2026-11-01'), sha: 'blob-one' } },
      calls: [] as string[],
    };
    const memory = createMemoryService({ client: async () => fakeClient(state) });
    const section = createMemorySection({
      memory: () => memory,
      git: () => ({ listRepositories: async () => [repository] }) as unknown as ReturnType<
        Parameters<typeof createMemorySection>[0]['git']
      >,
      projects: () =>
        ({
          issueContext: { contextFor: async () => ({ project: { id: 'project-1' } }) },
        }) as unknown as ReturnType<Parameters<typeof createMemorySection>[0]['projects']>,
      connection: () => ({}) as ReturnType<Parameters<typeof createMemorySection>[0]['connection']>,
    });
    type PrepareRun = Parameters<NonNullable<typeof section.prepare>>[0];
    type SectionArgs = Parameters<typeof section.section>;
    const issueRun = { subject: { kind: 'issue', id: 'issue-1' } } as unknown as PrepareRun;
    const prepared = await section.prepare?.(issueRun);
    const text = await section.section(
      {} as SectionArgs[0],
      { cli: 'ds-studio' } as unknown as SectionArgs[1],
      {} as SectionArgs[2],
      prepared,
    );
    expect(text).toContain('## Ghi nhớ của dự án');
    expect(text).toContain('- [feedback] **Một** — Mô tả Một (`.nb-studio/memory/one.md`)');
    expect(text).toContain('`ds-studio memory read` `project-1 <repoId> --path <path>`');

    const otherRun = { subject: { kind: 'conversation', id: 'c-1' } } as unknown as PrepareRun;
    expect(await section.prepare?.(otherRun)).toBeNull();
    expect(
      await section.section({} as SectionArgs[0], { cli: 'ds-studio' } as unknown as SectionArgs[1], {} as SectionArgs[2], null),
    ).toBeNull();
  });
});
