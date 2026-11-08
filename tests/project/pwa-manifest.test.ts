import { readFileSync } from 'node:fs';
import path from 'node:path';
import { serveSpaAsset } from '@nocobase/app-server/spa';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '../..');
const read = (file: string) => readFileSync(path.join(root, file));

/**
 * The manifest lives under `/assets/`: the application server serves real files only there (anything else with a file
 * extension falls through to `index.html`, which is what a root-level manifest got on production on 08/11/2026). Its URLs
 * are relative to itself, so `../` is the application's base path (`/main`) and the icons sit beside it. `/assets` is cached
 * as immutable, so a change to the manifest ships under a new name (`manifest-v2.json`) and a new link in `index.html`.
 */
const MANIFEST = 'public/assets/manifest-v1.json';

interface Icon {
  src: string;
  sizes: string;
  type: string;
  purpose?: string;
}
const manifest = JSON.parse(read(MANIFEST).toString()) as {
  name: string;
  short_name: string;
  start_url: string;
  scope: string;
  display: string;
  theme_color: string;
  icons: Icon[];
};

/** Width and height of a PNG, from its IHDR chunk. */
const pngSize = (file: string) => {
  const data = read(file);
  expect(data.subarray(1, 4).toString()).toBe('PNG');
  return `${data.readUInt32BE(16)}x${data.readUInt32BE(20)}`;
};

describe('installable web app', () => {
  it('is a standalone, navy app that keeps to its own base path', () => {
    expect(manifest).toMatchObject({
      name: 'Dương Sinh Studio',
      display: 'standalone',
      start_url: '../',
      scope: '../',
      theme_color: '#2B3990',
    });
    expect(manifest.short_name.length).toBeLessThanOrEqual(12);
  });

  it('ships real icons of the sizes it declares, 192, 512 and maskable', () => {
    for (const icon of manifest.icons) {
      expect(icon.src.startsWith('/')).toBe(false);
      expect(pngSize(`public/assets/${icon.src}`)).toBe(icon.sizes);
    }
    expect(manifest.icons.map((icon) => icon.sizes)).toEqual(
      expect.arrayContaining(['192x192', '512x512']),
    );
    expect(manifest.icons.some((icon) => icon.purpose === 'maskable')).toBe(
      true,
    );
  });

  it('is linked from the page, from a path the server serves, with the Apple touch icon', () => {
    const html = read('index.html').toString();
    expect(html).toContain(
      '<link rel="manifest" href="/assets/manifest-v1.json" />',
    );
    expect(html).toContain('rel="apple-touch-icon"');
    expect(pngSize('public/assets/apple-touch-icon.png')).toBe('180x180');
  });

  it('is served by the application server itself, as JSON, under the base path', async () => {
    const options = { rootDir: path.join(root, 'public'), basePath: '/main' };
    const served = await serveSpaAsset(
      new Request('http://localhost/main/assets/manifest-v1.json'),
      options,
    );
    expect(served.status).toBe(200);
    expect(served.headers.get('content-type')).toContain('application/json');
    expect(await served.json()).toMatchObject({ name: 'Dương Sinh Studio' });
    // The icon it names is served beside it, as an image and not as the page.
    const icon = await serveSpaAsset(
      new Request('http://localhost/main/assets/pwa-192.png'),
      options,
    );
    expect(icon.status).toBe(200);
    expect(icon.headers.get('content-type')).toBe('image/png');
    // What the first version of this fix put at the root is NOT served: the server has no static file there.
    const root404 = await serveSpaAsset(
      new Request('http://localhost/main/manifest.webmanifest'),
      options,
    );
    expect(root404.status).toBe(404);
  });
});
