/**
 * The interface smoke test a project can add to its CI (plan T, T5): build the application, start `dist` on the runner with
 * a temporary SQLite database and no data, open the pages the project lists at a phone and a desktop width, and fail on a
 * `pageerror`, a `console.error` or a blank page. Screenshots are uploaded as an artifact of the run.
 *
 * It runs on GitHub Actions, never on Studio's runner (2.5 GiB), uses no secret, and runs only for pull requests that touch
 * the interface, with a 15 minute limit. Studio reads it as an ordinary check run. One file, so the proposal is one pull
 * request opened with the requester's own token (the App may not write workflows).
 */
export const UI_SMOKE_WORKFLOW_PATH = '.github/workflows/ds-ui-smoke.yml';

/** The branch a proposal is opened from. */
export const UI_SMOKE_PROPOSAL_BRANCH = 'ci/ds-ui-smoke';

/** Where a project lists the pages to open (a JSON array of paths below the application's base path). */
export const UI_SMOKE_PAGES_PATH = '.nb-studio/ui-smoke-pages.json';

/** The checks, as the Node script the workflow writes and runs. */
export const UI_SMOKE_SCRIPT = `import { chromium } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';

const base = process.env.UI_SMOKE_BASE;
const pages = existsSync('${UI_SMOKE_PAGES_PATH}')
  ? JSON.parse(readFileSync('${UI_SMOKE_PAGES_PATH}', 'utf8'))
  : ['/'];
const sizes = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'desktop', width: 1280, height: 800 },
];
mkdirSync('ui-smoke', { recursive: true });
const browser = await chromium.launch();
const failures = [];
for (const size of sizes) {
  const context = await browser.newContext({
    viewport: { width: size.width, height: size.height },
  });
  for (const path of pages) {
    const page = await context.newPage();
    const problems = [];
    page.on('pageerror', (error) => problems.push('pageerror: ' + error.message));
    page.on('console', (message) => {
      // A request that answers 401 or 404 on a fresh, signed-out application is not an interface error.
      if (message.type() === 'error' && !message.text().startsWith('Failed to load resource'))
        problems.push('console.error: ' + message.text());
    });
    await page.goto(base + path, { waitUntil: 'networkidle', timeout: 60000 });
    if ((await page.innerText('body')).trim() === '') problems.push('blank page');
    const slug = path.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'home';
    await page.screenshot({ path: 'ui-smoke/' + size.name + '-' + slug + '.png', fullPage: true });
    for (const problem of problems) failures.push(size.name + ' ' + path + ': ' + problem);
    await page.close();
  }
  await context.close();
}
await browser.close();
if (failures.length > 0) {
  console.error(failures.join('\\n'));
  process.exit(1);
}
`;

/** The script, indented to sit inside the workflow's `run: |` block (YAML strips the indent, so the shell sees it flush). */
const INDENTED_SCRIPT = UI_SMOKE_SCRIPT.split('\n')
  .map((line) => (line === '' ? line : `          ${line}`))
  .join('\n');

export const UI_SMOKE_WORKFLOW = `name: ds-ui-smoke

on:
  pull_request:
    paths:
      - 'client/**'
      - 'server/**'
      - 'package.json'
      - 'pnpm-lock.yaml'
      - '${UI_SMOKE_PAGES_PATH}'

concurrency:
  group: ds-ui-smoke-\${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read

jobs:
  ui-smoke:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - name: Start the application with a temporary database
        run: |
          cd dist
          pnpm nocobase config init
          pnpm nocobase config check
          APP_SERVER_PORT=13000 node ./server/standalone.js > "$RUNNER_TEMP/app.log" 2>&1 &
          for i in $(seq 1 60); do
            curl -fsS http://127.0.0.1:13000/main/api/healthz >/dev/null 2>&1 && exit 0
            sleep 2
          done
          cat "$RUNNER_TEMP/app.log" >&2
          exit 1
      - run: npx playwright install --with-deps chromium
      - name: Open the pages at 390 and 1280 pixels
        env:
          UI_SMOKE_BASE: http://127.0.0.1:13000/main
        run: |
          cat > "$RUNNER_TEMP/ui-smoke.mjs" <<'SMOKE'
${INDENTED_SCRIPT}          SMOKE
          cp "$RUNNER_TEMP/ui-smoke.mjs" ./ui-smoke.mjs
          node ./ui-smoke.mjs
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: ui-smoke
          path: ui-smoke/
          retention-days: 7
`;
