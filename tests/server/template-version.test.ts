import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { appTemplate } from '../../server/setups/template-version.js';

const dirs: string[] = [];

async function manifest(content: string): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'ds-template-'));
  dirs.push(dir);
  const file = path.join(dir, 'package.json');
  await writeFile(file, content);
  return file;
}

afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe('appTemplate', () => {
  it('reads the template this application was generated from, at its version', async () => {
    const { nocobase } = JSON.parse(
      await readFile(new URL('../../package.json', import.meta.url), 'utf8'),
    ) as {
      nocobase: { templatePackage: string; defaultTemplateVersion: string };
    };
    expect(await appTemplate()).toEqual({
      packageName: nocobase.templatePackage,
      version: nocobase.defaultTemplateVersion,
    });
  });

  it('names no template rather than guessing one', async () => {
    expect(
      await appTemplate(
        await manifest(
          JSON.stringify({
            nocobase: { templatePackage: '@nocobase/app-template-default' },
          }),
        ),
      ),
    ).toBeNull();
    expect(
      await appTemplate(
        await manifest(
          JSON.stringify({
            nocobase: {
              templatePackage: '',
              defaultTemplateVersion: '1.0.0',
            },
          }),
        ),
      ),
    ).toBeNull();
    expect(await appTemplate(await manifest('{}'))).toBeNull();
    expect(await appTemplate(await manifest('not json'))).toBeNull();
    expect(
      await appTemplate(path.join(tmpdir(), 'ds-missing', 'package.json')),
    ).toBeNull();
  });
});
