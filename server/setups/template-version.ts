import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface TemplateRelease {
  readonly package: string;
  readonly version: string;
}

/**
 * The template this Studio was itself generated from, read from the `nocobase` block of the application's package.json (in
 * `dist/` as well as in the source tree: the build copies it). New projects are pinned to this version; without a pin
 * `create-app` takes the newest template, which can be ahead of the NocoBase packages the agents' skills describe.
 * Throws when the block is missing, so a setup fails loudly instead of falling back to `latest`.
 */
export function readTemplateRelease(
  from: string = dirname(fileURLToPath(import.meta.url)),
): TemplateRelease {
  let dir = from;
  for (;;) {
    const file = join(dir, 'package.json');
    if (existsSync(file)) {
      const block = (
        JSON.parse(readFileSync(file, 'utf8')) as {
          nocobase?: {
            templatePackage?: unknown;
            defaultTemplateVersion?: unknown;
          };
        }
      ).nocobase;
      if (
        typeof block?.templatePackage === 'string' &&
        typeof block.defaultTemplateVersion === 'string'
      )
        return {
          package: block.templatePackage,
          version: block.defaultTemplateVersion,
        };
    }
    const parent = dirname(dir);
    if (parent === dir)
      throw new Error(
        'package.json has no nocobase.templatePackage and nocobase.defaultTemplateVersion.',
      );
    dir = parent;
  }
}
