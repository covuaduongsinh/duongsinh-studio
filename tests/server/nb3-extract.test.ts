// @vitest-environment node
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  link,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, expect, it } from 'vitest';
import * as tar from 'tar';
import { extractArchive } from '../../server/releases/extract.js';

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'nb3-extract-'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function archive(): Promise<Readable> {
  const source = join(root, 'src');
  await mkdir(join(source, 'dist', 'server'), { recursive: true });
  await writeFile(join(source, 'dist', 'server', 'standalone.js'), 'ok');
  await writeFile(join(source, 'config.example.yml'), 'example');
  await writeFile(join(source, 'Dockerfile'), 'FROM x');
  await symlink('/etc/passwd', join(source, 'dist', 'evil-link'));
  // pnpm's layout: a package file hard-linked to another one inside dist.
  await link(
    join(source, 'dist', 'server', 'standalone.js'),
    join(source, 'dist', 'server', 'linked.js'),
  );
  return tar.c({ gzip: true, cwd: source }, [
    'dist',
    'config.example.yml',
    'Dockerfile',
  ]);
}

it('extracts dist only, with its hard links but no symbolic links, config or Dockerfile', async () => {
  const target = join(root, 'out');
  await extractArchive(await archive(), target);
  expect(
    await readFile(join(target, 'dist', 'server', 'standalone.js'), 'utf8'),
  ).toBe('ok');
  expect(
    await readFile(join(target, 'dist', 'server', 'linked.js'), 'utf8'),
  ).toBe('ok');
  expect(await readdir(target)).toEqual(['dist']);
  await expect(stat(join(target, 'dist', 'evil-link'))).rejects.toThrow();
});

it('never writes outside the directory for a hostile path', async () => {
  const hostile = join(root, 'hostile');
  await mkdir(hostile, { recursive: true });
  await writeFile(join(hostile, 'x'), 'bad');
  const stream = tar.c(
    { gzip: true, cwd: hostile, prefix: 'dist/../../escape' },
    ['x'],
  );
  const target = join(root, 'out2');
  await extractArchive(stream, target).catch(() => undefined);
  await expect(stat(join(root, 'escape'))).rejects.toThrow();
  await expect(stat(join(target, '..', 'escape'))).rejects.toThrow();
});

it('refuses a hard link that points outside dist', async () => {
  const hostile = join(root, 'hostile2');
  await mkdir(join(hostile, 'dist'), { recursive: true });
  await writeFile(join(hostile, 'secret'), 'secret');
  await link(join(hostile, 'secret'), join(hostile, 'dist', 'stolen'));
  const target = join(root, 'out3');
  await extractArchive(
    tar.c({ gzip: true, cwd: hostile }, ['secret', 'dist']),
    target,
  );
  // `dist/stolen` is the second name of `secret`: the archive stores it as a link to `secret`, outside dist/.
  await expect(stat(join(target, 'dist', 'stolen'))).rejects.toThrow();
  await expect(stat(join(target, 'secret'))).rejects.toThrow();
});
