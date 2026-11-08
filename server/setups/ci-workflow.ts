/**
 * The licence gate, as the JavaScript `node -e` runs on `pnpm licenses list --json` (a map from licence expression to the
 * packages under it). It runs WITHOUT `--prod`: this stack declares client libraries as devDependencies, so a production-only
 * listing never sees `react-chessboard` or any other browser library. An expression passes when it names no GPL, AGPL or LGPL, or
 * offers an alternative with `OR` (`(MIT OR GPL-3.0-or-later)` of `jszip` lets the consumer take the permissive side).
 */
export const LICENSE_GATE_JS =
  "const d=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));" +
  'const bad=Object.keys(d).filter(l=>/(^|[^A-Za-z])(A|L)?GPL/i.test(l)&&!/\\sOR\\s/.test(l));' +
  "if(bad.length){console.error('Copyleft licences with no OR alternative: '+bad.join(', '));process.exit(1)}";

/**
 * The CI a new project starts with, pushed to `.github/workflows/ds-check.yml` with the creator's own token. The GitHub App
 * has no `workflows` permission, so an agent working through the App can never edit it, and autopilot treats
 * `.github/workflows/**` as sensitive. Studio reads the result as an ordinary check run (`checks_source = host`): nothing here
 * calls Studio and no secret is used. Runs only for pull requests, cancels a superseded run and has a time limit, because
 * Actions minutes are shared by every private repository of the account.
 */
export const CI_WORKFLOW_PATH = '.github/workflows/ds-check.yml';

/** The branch a proposal to an existing repository is opened from. */
export const CI_PROPOSAL_BRANCH = 'ci/ds-check';

export const CI_WORKFLOW = `name: ds-check

on:
  pull_request:

concurrency:
  group: ds-check-\${{ github.ref }}
  cancel-in-progress: true

jobs:
  check:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - name: Check
        run: pnpm check
      - name: Licences of what the application added
        run: |
          pnpm licenses list --json > "$RUNNER_TEMP/licenses.json"
          node -e "${LICENSE_GATE_JS}" "$RUNNER_TEMP/licenses.json"
          if grep -qE "^\\s+'?(chessground|chessops|@lichess-org/pgn-viewer|tournament-pairings|stockfish)@" pnpm-lock.yaml; then
            echo "A GPL chess library is in pnpm-lock.yaml" >&2
            exit 1
          fi
      - name: No secrets or data in the repository
        run: |
          if git ls-files | grep -iE "\\.sqlite|(^|/)\\.env$|(^|/)config\\.yml$|\\.dump$"; then
            echo "Files that must not be committed" >&2
            exit 1
          fi
`;
