#!/usr/bin/env node
// Dev-only: which of the demo's Studio routes (appendix A, section "Studio") this application's API document lacks.
//
//   node scripts/compare-studio-api.mjs [--swagger <url or file>] [--appendix <file>] [--json]
//
// The key for a URL comes from DS_STUDIO_API_KEY and goes in a header only. Routes under a group listed in
// DEFERRED are reported apart, so a deliberate gap never reads as forgotten.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const arg = (name, fallback) => {
  const at = process.argv.indexOf(`--${name}`);
  return at >= 0 ? process.argv[at + 1] : fallback;
};

// Resolved from this script, so it works from any working directory and on any machine with the repository.
const APPENDIX = fileURLToPath(
  new URL(
    '../docs/plans/archive/2026-11-01-nocobase-studio-phu-luc-api-cli.md',
    import.meta.url,
  ),
);
const DEFAULT_SWAGGER = 'http://127.0.0.1:13100/main/api/swagger';

/** Deliberately not built yet, with where the decision is written. Empty: every gap is work still to do. */
const DEFERRED = new Map();

const normalize = (path) =>
  path
    .replace(/^\/api(?=\/)/, '')
    .replace(/\{[^}]+\}/g, '{}')
    .replace(/\/:[^/]+/g, '/{}');

export function demoRoutes(source) {
  const markdown = source.replace(/\r\n/g, '\n');
  const start = markdown.indexOf('\n## Studio\n');
  if (start < 0) throw new Error('The appendix has no "## Studio" section.');
  const end = markdown.indexOf('\n## ', start + 1);
  const routes = [];
  for (const line of markdown.slice(start, end).split('\n')) {
    const match = line.match(/^- (GET|POST|PUT|PATCH|DELETE) (\/\S+)/);
    if (match) routes.push(`${match[1]} ${normalize(match[2])}`);
  }
  return routes;
}

export function ownRoutes(document) {
  const routes = new Set();
  for (const [path, operations] of Object.entries(document.paths ?? {}))
    for (const method of Object.keys(operations))
      if (['get', 'post', 'put', 'patch', 'delete'].includes(method))
        routes.add(`${method.toUpperCase()} ${normalize(path)}`);
  return routes;
}

async function loadSwagger(source) {
  if (!/^https?:/.test(source)) return JSON.parse(readFileSync(source, 'utf8'));
  const key = process.env.DS_STUDIO_API_KEY;
  const response = await fetch(source, {
    headers: key ? { 'x-api-key': key, authorization: `Bearer ${key}` } : {},
  });
  if (!response.ok)
    throw new Error(
      `${source} answered ${response.status}; is DS_STUDIO_API_KEY set?`,
    );
  return response.json();
}

const groupOf = (route) => route.split(' ')[1].split('/')[1];

const demo = demoRoutes(readFileSync(arg('appendix', APPENDIX), 'utf8'));
const own = ownRoutes(await loadSwagger(arg('swagger', DEFAULT_SWAGGER)));
const missing = demo.filter((route) => !own.has(route));
const deferred = missing.filter((route) => DEFERRED.has(groupOf(route)));
const open = missing.filter((route) => !DEFERRED.has(groupOf(route)));

if (process.argv.includes('--json')) {
  console.log(
    JSON.stringify(
      {
        demo: demo.length,
        present: demo.length - missing.length,
        open,
        deferred,
      },
      null,
      2,
    ),
  );
} else {
  console.log(
    `Demo Studio routes: ${demo.length}; present: ${demo.length - missing.length}; missing: ${missing.length}`,
  );
  const groups = new Map();
  for (const route of open)
    groups.set(groupOf(route), [...(groups.get(groupOf(route)) ?? []), route]);
  for (const [group, routes] of [...groups].sort())
    console.log(
      `\n${group} (${routes.length})\n${routes.map((route) => `  ${route}`).join('\n')}`,
    );
  if (deferred.length) console.log(`\nDeferred on purpose: ${deferred.length}`);
}
