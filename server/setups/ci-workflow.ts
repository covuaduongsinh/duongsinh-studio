/**
 * The CI a new project starts with, pushed to `.github/workflows/ds-check.yml` with the creator's own token. The GitHub App
 * has no `workflows` permission, so an agent working through the App can never edit it, and autopilot treats
 * `.github/workflows/**` as sensitive. Studio reads the result as an ordinary check run (`checks_source = host`): nothing here
 * calls Studio and no secret is used. Runs only for pull requests, cancels a superseded run and has a time limit, because
 * Actions minutes are shared by every private repository of the account.
 */
export const CI_WORKFLOW_PATH = '.github/workflows/ds-check.yml';

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
