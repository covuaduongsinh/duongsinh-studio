import { readFile } from 'node:fs/promises';
import path from 'node:path';

/** The template a new NocoBase project starts from: the one this application was generated from, at the same version. */
export interface AppTemplate {
  readonly packageName: string;
  readonly version: string;
}

/**
 * Read from the application's own `package.json` (`nocobase.templatePackage` and `nocobase.defaultTemplateVersion`),
 * two levels above this module both in the source tree (`server/setups/`) and in a build (`dist/server/setups/`), so
 * the template follows the installed release rather than a constant that drifts. Null when either value is missing:
 * the caller refuses instead of falling back to `latest`.
 */
export async function appTemplate(
  file: string = path.resolve(import.meta.dirname, '../..', 'package.json'),
): Promise<AppTemplate | null> {
  let manifest: unknown;
  try {
    manifest = JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return null;
  }
  const nocobase =
    manifest && typeof manifest === 'object' && 'nocobase' in manifest
      ? (manifest as { nocobase?: unknown }).nocobase
      : undefined;
  if (!nocobase || typeof nocobase !== 'object') return null;
  const { templatePackage, defaultTemplateVersion } = nocobase as Record<
    string,
    unknown
  >;
  if (
    typeof templatePackage !== 'string' ||
    !templatePackage ||
    typeof defaultTemplateVersion !== 'string' ||
    !defaultTemplateVersion
  )
    return null;
  return { packageName: templatePackage, version: defaultTemplateVersion };
}
