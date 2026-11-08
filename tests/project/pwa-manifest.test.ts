import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '../..');
const read = (file: string) => readFileSync(path.join(root, file));

interface Icon {
  src: string;
  sizes: string;
  type: string;
  purpose?: string;
}
const manifest = JSON.parse(read('public/manifest.webmanifest').toString()) as {
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

// Web push on a phone needs the app installed to the home screen (M0.2). The manifest uses URLs relative to itself so the
// same file works under any base path (`/main`), which a root-absolute `start_url` would not.
describe('installable web app', () => {
  it('is a standalone, navy app that keeps to its own base path', () => {
    expect(manifest).toMatchObject({
      name: 'Dương Sinh Studio',
      display: 'standalone',
      start_url: './',
      scope: './',
      theme_color: '#2B3990',
    });
    expect(manifest.short_name.length).toBeLessThanOrEqual(12);
  });

  it('ships real icons of the sizes it declares, 192, 512 and maskable', () => {
    for (const icon of manifest.icons) {
      expect(icon.src.startsWith('/')).toBe(false);
      expect(pngSize(`public/${icon.src}`)).toBe(icon.sizes);
    }
    expect(manifest.icons.map((icon) => icon.sizes)).toEqual(
      expect.arrayContaining(['192x192', '512x512']),
    );
    expect(manifest.icons.some((icon) => icon.purpose === 'maskable')).toBe(
      true,
    );
  });

  it('is linked from the page together with the Apple touch icon', () => {
    const html = read('index.html').toString();
    expect(html).toContain(
      '<link rel="manifest" href="/manifest.webmanifest" />',
    );
    expect(html).toContain('rel="apple-touch-icon"');
    expect(pngSize('public/assets/apple-touch-icon.png')).toBe('180x180');
  });
});
