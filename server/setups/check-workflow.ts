/**
 * The check a repository Studio creates gets on its pull requests (`.github/workflows/ds-check.yml`). It runs on GitHub,
 * not on the shared runner, so the whole-repository `pnpm check` the runner may not run happens here; Studio reads its
 * result as the host's checks (`checks_source = host`). It needs no secret and no organization key.
 *
 * It is pushed once with the creator's own token: Studio's GitHub App has no workflows permission, so an agent working
 * through the App cannot change it, and `.github/workflows/**` is one of autopilot's sensitive paths.
 */
export const CHECK_WORKFLOW_PATH = '.github/workflows/ds-check.yml';

const BANNED =
  'chessground|chessops|@lichess-org/pgn-viewer|tournament-pairings|stockfish';

export const CHECK_WORKFLOW = `# Created by Dương Sinh Studio. Runs the checks agents may not run on the shared runner.
name: ds-check

on:
  pull_request:

permissions:
  contents: read

concurrency:
  group: ds-check-\${{ github.event.pull_request.number }}
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
      - run: pnpm check
      - name: Licenses
        run: |
          if grep -E "^\\s+'?(${BANNED})@" pnpm-lock.yaml; then
            echo "A banned package is in pnpm-lock.yaml." >&2
            exit 1
          fi
          pnpm licenses list --json > "$RUNNER_TEMP/licenses.json"
          node -e '
            const licenses = require(process.argv[1]);
            const copyleft = Object.keys(licenses).filter(
              (name) => /(^|[^L])GPL/i.test(name) && !/\\bOR\\b/.test(name),
            );
            for (const name of copyleft)
              console.error(name + ": " + licenses[name].map((item) => item.name).join(", "));
            process.exit(copyleft.length ? 1 : 0);
          ' "$RUNNER_TEMP/licenses.json"
      - name: Files that must not be committed
        run: |
          if git ls-files | grep -iE "\\.sqlite|\\.env$|config\\.yml$|\\.dump"; then
            echo "Remove these files from the repository." >&2
            exit 1
          fi
`;
