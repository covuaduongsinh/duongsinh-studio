/**
 * The interface smoke test a project can add to its CI (plan T, T5): build the application, start `dist` on the runner with
 * a temporary SQLite database and no data, sign in as an account made for the run, open the pages the project lists at a
 * phone and a desktop width, and fail on a `pageerror`, a `console.error`, a blank page or a redirect to the sign-in page.
 * Screenshots are uploaded as an artifact of the run.
 *
 * The account is the application's initial administrator (`INITIAL_ADMIN_*`, seeded on the first start of an empty
 * database), with a password generated in the job and masked in its log; no secret of the repository is used.
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
const PLAYWRIGHT_PACKAGE = ['@playwright', 'test'].join('/');

export const UI_SMOKE_SCRIPT = `const specifier = '${PLAYWRIGHT_PACKAGE}';
const { chromium } = await import(specifier);
import { existsSync, mkdirSync, readFileSync } from 'node:fs';

const base = process.env.UI_SMOKE_BASE;
const user = process.env.UI_SMOKE_USER;
const password = process.env.UI_SMOKE_PASSWORD;
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
  // The pages are behind the sign-in, so sign in first: the cookie the application sets stays with the context.
  const signIn = await context.request.post(base + '/api/auth/sign-in/username', {
    data: { username: user, password },
    headers: { origin: new URL(base).origin },
  });
  if (!signIn.ok()) {
    failures.push(size.name + ' sign-in: ' + signIn.status());
    await context.close();
    continue;
  }
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
    if (new URL(page.url()).pathname.includes('/login')) problems.push('sent back to the sign-in page');
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
      - name: Make an account for the run
        run: |
          password="$(openssl rand -hex 16)"
          echo "::add-mask::$password"
          {
            echo "INITIAL_ADMIN_USERNAME=ui.smoke"
            echo "INITIAL_ADMIN_EMAIL=ui-smoke@example.com"
            echo "INITIAL_ADMIN_PASSWORD=$password"
            echo "UI_SMOKE_USER=ui.smoke"
            echo "UI_SMOKE_PASSWORD=$password"
            echo "APP_PUBLIC_ORIGIN=http://127.0.0.1:13000"
          } >> "$GITHUB_ENV"
      - name: Start the application with a temporary database
        run: |
          cd dist
          pnpm nocobase config init --dialect sqlite
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
