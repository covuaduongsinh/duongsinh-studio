import { createRequire } from 'node:module';

import { describe, expect, it } from 'vitest';

import clientEnUS from '../../client/locales/en-US.ts';
import clientOverrides from '../../client/locales/overrides/vi-VN.ts';
import clientViVN from '../../client/locales/vi-VN.ts';
import clientZhCN from '../../client/locales/zh-CN.ts';
import serverEnUS from '../../server/locales/en-US.ts';
import serverOverrides from '../../server/locales/overrides/vi-VN.ts';
import serverViVN from '../../server/locales/vi-VN.ts';
import serverZhCN from '../../server/locales/zh-CN.ts';

type Resource = Readonly<Record<string, unknown>>;

/** Every leaf of a locale as its dot path, the application's overrides block left out. */
function keys(resource: Resource, prefix = ''): string[] {
  return Object.entries(resource).flatMap(([key, value]) => {
    if (!prefix && key === 'overrides') return [];
    const path = prefix ? `${prefix}.${key}` : key;
    return value && typeof value === 'object'
      ? keys(value as Resource, path)
      : [path];
  });
}

function difference(from: Resource, to: Resource): string[] {
  const present = new Set(keys(to));
  return keys(from).filter((key) => !present.has(key));
}

/** The leaves of an override the plugin's own locale no longer has: an upgrade renamed or dropped them. */
function stale(override: Resource, original: Resource, prefix = ''): string[] {
  return Object.entries(override).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    const base = original[key];
    if (base === undefined) return [path];
    return value && typeof value === 'object'
      ? stale(value as Resource, base as Resource, path)
      : [];
  });
}

const require = createRequire(import.meta.url);

async function pluginLocale(
  pkg: string,
  side: 'client' | 'server',
): Promise<Resource> {
  const entry = require
    .resolve(`${pkg}/package.json`)
    .replace(/package\.json$/u, `dist/${side}/locales/vi-VN.js`);
  const loaded = (await import(entry)) as { default: Resource };
  return loaded.default;
}

describe('locale parity', () => {
  it('keeps every client language on the same keys', () => {
    expect(difference(clientEnUS, clientViVN)).toEqual([]);
    expect(difference(clientViVN, clientEnUS)).toEqual([]);
    expect(difference(clientEnUS, clientZhCN)).toEqual([]);
  });

  it('keeps every server language on the same keys', () => {
    expect(difference(serverEnUS, serverViVN)).toEqual([]);
    expect(difference(serverViVN, serverEnUS)).toEqual([]);
    expect(difference(serverEnUS, serverZhCN)).toEqual([]);
  });

  it('rewords the plugins to the glossary (docs/thuat-ngu.md)', () => {
    expect(clientViVN.overrides).toBe(clientOverrides);
    expect(serverViVN.overrides).toBe(serverOverrides);
    const projects = clientOverrides['@nocobase/app-plugin-projects'] as {
      readonly status: Readonly<Record<string, string>>;
    };
    expect(projects.status).toMatchObject({
      backlog: 'Chờ làm',
      in_progress: 'Đang làm',
      in_review: 'Chờ nghiệm thu',
      done: 'Xong',
    });
    expect(JSON.stringify(clientOverrides)).not.toMatch(
      /Vấn đề|Tác nhân|đại lý|Người thi hành án/u,
    );
  });

  it('rewords only keys the plugins still have', async () => {
    const sides = [
      ['client', clientOverrides],
      ['server', serverOverrides],
    ] as const;
    for (const [side, overrides] of sides) {
      for (const [pkg, override] of Object.entries(overrides)) {
        const original = await pluginLocale(pkg, side);
        expect(stale(override as Resource, original), `${side} ${pkg}`).toEqual(
          [],
        );
      }
    }
  });
});
