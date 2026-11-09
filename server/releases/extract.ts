import { mkdir } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import * as tar from 'tar';

/**
 * Unpacks a release archive (`dist/…` and `config.example.yml`, gzip) into `directory`, keeping only `dist/`: the
 * configuration is the environment's, never the archive's. `tar` drops a leading `/` and refuses `..`, so no entry can
 * leave `directory`. Symbolic links are not extracted, since one could point outside it. A hard link is, when it points
 * at another file of `dist/`: pnpm hard-links the files of `dist/node_modules` to its store inside the build, and an
 * archive without them has no packages (the first NocoLMS container failed with ERR_MODULE_NOT_FOUND).
 */
/** A hard link whose target is a relative path under `dist/` that never steps out of it. */
function insideDist(entry: { linkpath?: string }): boolean {
  const target = entry.linkpath ?? '';
  return (
    target.startsWith('dist/') &&
    !target.split('/').includes('..') &&
    !target.includes('\\')
  );
}

export async function extractArchive(
  source: NodeJS.ReadableStream,
  directory: string,
): Promise<void> {
  await mkdir(directory, { recursive: true });
  await pipeline(
    source,
    tar.x({
      cwd: directory,
      preservePaths: false,
      filter: (path, entry) =>
        (path === 'dist' || path.startsWith('dist/')) &&
        !('type' in entry && entry.type === 'SymbolicLink') &&
        !('type' in entry && entry.type === 'Link' && !insideDist(entry)),
    }),
  );
}
