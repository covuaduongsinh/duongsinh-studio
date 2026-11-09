import { mkdir } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import * as tar from 'tar';

/**
 * Unpacks a release archive (`dist/…` and `config.example.yml`, gzip) into `directory`, keeping only `dist/`: the
 * configuration is the environment's, never the archive's. `tar` drops a leading `/` and refuses `..`, so no entry can
 * leave `directory`; links are not extracted either, since a link could point outside it.
 */
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
        !(
          'type' in entry &&
          (entry.type === 'SymbolicLink' || entry.type === 'Link')
        ),
    }),
  );
}
