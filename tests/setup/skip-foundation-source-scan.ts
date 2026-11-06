import { registerHooks } from 'node:module';

/**
 * Foundation 0.1.0-beta.13+ scans on every start that finds no snapshot for the running kernel, and every test here
 * starts on a fresh database. In a source checkout that scan parses this application's whole TypeScript source
 * synchronously (about 45 s against about 5 s for the rest of a start), which times tests and hooks out. No Foundation
 * option turns it off, and no test here asserts module associations, so tests alone read an empty result. Deployments
 * read the prebuilt `foundation-modules.json` instead and never run this path. See docs/chenh-lech-upstream.md.
 */
const TARGET =
  '/@nocobase/app-plugin-foundation/dist/server/module-source-cache.js';

const EMPTY_CACHE = `export class ModuleSourceCache {
  read() { return Promise.resolve({ routes: [], complete: false }); }
}
`;

registerHooks({
  load(url, context, nextLoad) {
    if (url.endsWith(TARGET))
      return { format: 'module', source: EMPTY_CACHE, shortCircuit: true };
    return nextLoad(url, context);
  },
});
