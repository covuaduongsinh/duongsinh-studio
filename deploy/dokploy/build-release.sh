#!/usr/bin/env bash
# Builds the Dương Sinh Studio release archive (V6.3): `dist` for linux-x64 on Node 24, checked, packed as
# studio-<sha>.tar.gz with its SHA-256 beside it. Run by .github/workflows/release.yml and by hand on a Linux machine
# (docs/trien-khai-vps.md). It refuses to build:
#   - on anything but Linux (native packages for linux-x64 resolve only there; see .agents/rules/duongsinh-studio.md),
#   - with uncommitted changes (the archive must be what the commit says),
#   - from a commit that is not on origin/main (a release is something that was reviewed and merged).
# Usage: bash deploy/dokploy/build-release.sh [output-dir]      (default: ./release-out)
# RELEASE_UNAME overrides `uname -s` for the tests only.
set -euo pipefail

OUT="${1:-release-out}"
fail() { echo "build-release: $*" >&2; exit 1; }

[ "${RELEASE_UNAME:-$(uname -s)}" = Linux ] || fail "build on Linux only (WSL Ubuntu or the CI runner), not $(uname -s)"
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || fail "not inside a git checkout"
[ -z "$(git status --porcelain)" ] || fail "the working tree has uncommitted changes"
git rev-parse --verify -q origin/main >/dev/null || fail "origin/main is not known: fetch it first (git fetch origin main)"
git merge-base --is-ancestor HEAD origin/main || fail "HEAD is not on origin/main"

SHA=$(git rev-parse --short=7 HEAD)
mkdir -p "$OUT"

pnpm install --frozen-lockfile
pnpm build --target linux-x64 --node-version 24
pnpm nocobase dist check
tar --exclude='*/.bin' --exclude='dist/.env' -czf "$OUT/studio-$SHA.tar.gz" dist config.example.yml
(cd "$OUT" && sha256sum "studio-$SHA.tar.gz" > "studio-$SHA.tar.gz.sha256")
echo "built $OUT/studio-$SHA.tar.gz"
