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

export type Nb3Role = 'preview' | 'staging' | 'production';

export const NB3_CI_SECRET = 'DS_STUDIO_API_KEY';

/**
 * The one CI file for a NocoBase 3 App (plan V, V5.3; it replaced the two templates M4.3 and the M4.2 build upload had).
 * Build `dist` for linux-x64, pack it, and upload it with a one-time ticket from the releases plugin
 * (`POST /api/releases/apps/{appId}/uploadTickets`, then `POST /api{path}` with `X-Artifact-SHA256`), which is the plugin's own
 * route set (checked against its sources, 13/11/2026). What differs is the role:
 * - `preview`: a pull request labelled `preview`; deployed on arrival, labelled with its pull request (`pr`, `sha`), one at a time;
 * - `staging`: a push to the branch; deployed on arrival;
 * - `production`: a push to the branch; uploaded only. A protected environment refuses a deploying ticket
 *   (`TICKET_DEPLOY_REFUSED`); the owner deploys it through a deployment request.
 * The API key is the repository's narrow CI key (only its own Apps, 90 days); never echoed.
 */
export function nb3AppWorkflow(input: {
  readonly appId: string;
  readonly role: Nb3Role;
  readonly branch: string;
  readonly apiBase: string;
}): { readonly path: string; readonly content: string } {
  const { appId, role, branch, apiBase } = input;
  const deploy = role !== 'production';
  const trigger =
    role === 'preview'
      ? `on:
  pull_request:
    types: [labeled, synchronize, reopened]
`
      : `on:
  push:
    branches: [${branch}]
`;
  const guard =
    role === 'preview'
      ? "    if: contains(github.event.pull_request.labels.*.name, 'preview')\n"
      : '';
  const concurrency =
    role === 'preview'
      ? `    concurrency: { group: nb3-preview-${appId}, cancel-in-progress: true }\n`
      : '';
  const labels =
    role === 'preview'
      ? `
          PR: \${{ github.event.pull_request.number }}
          SHA: \${{ github.event.pull_request.head.sha }}`
      : `
          SHA: \${{ github.sha }}`;
  const labelHeader =
    role === 'preview'
      ? `-H "X-Release-Labels: {\\"pr\\":\\"$PR\\",\\"sha\\":\\"$SHA\\"}"`
      : `-H "X-Release-Labels: {\\"sha\\":\\"$SHA\\"}"`;
  return {
    path: `.github/workflows/ds-studio-${appId}.yml`,
    content: `name: Dương Sinh Studio ${appId}
${trigger}jobs:
  build:
    runs-on: ubuntu-latest
${guard}${concurrency}    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm build --target linux-x64 --node-version 24
      - run: tar --exclude='*/.bin' --exclude=dist/.env -czf dist.tar.gz dist config.example.yml
      - name: Upload${deploy ? ' and deploy' : ''} to Studio
        env:
          API: ${apiBase}
          KEY: \${{ secrets.${NB3_CI_SECRET} }}
          APP_ID: ${appId}${labels}
        run: |
          # A one-time upload ticket; neither the key nor the ticket is printed.
          ticket=$(curl -fsS -X POST "$API/releases/apps/$APP_ID/uploadTickets" \\
            -H "x-api-key: $KEY" -H 'content-type: application/json' -d '{"deploy":${deploy ? 'true' : 'false'}}')
          token=$(jq -er .data.token <<<"$ticket"); path=$(jq -er .data.path <<<"$ticket")
          curl -fsS -X POST "$API$path" \\
            -H "Authorization: Bearer $token" \\
            -H "X-Artifact-SHA256: $(sha256sum dist.tar.gz | cut -d' ' -f1)" \\
            -H 'X-Release-Deploy: ${deploy ? 'true' : 'false'}' \\
            ${labelHeader} \\
            -H 'content-type: application/gzip' --data-binary @dist.tar.gz -o /dev/null
`,
  };
}
