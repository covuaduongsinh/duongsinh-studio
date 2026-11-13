#!/usr/bin/env bash
# Fetches a Studio release built by .github/workflows/release.yml onto the VPS and unpacks it next to the others (V6.3).
# Run on the VPS as root by the owner (or from cron), never from CI:
#   GH_TOKEN_FILE=/root/.studio-release-token bash release.sh <tag>      e.g. v0.9.0
# The token is a read-only token for this repository's Releases (contents:read); it is read from the file, never printed.
# It does NOT change what runs. After it, follow docs/trien-khai-vps.md ("Cập nhật lên phiên bản mới"): wait until no run is
# in flight (ag_runs 'running'), take the pre-deploy dump, then `bash switch-release.sh <sha>` (it pauses the autopilot).
set -euo pipefail

TAG="${1:?tag, for example v0.9.0}"
REPO="${RELEASE_REPO:-covuaduongsinh/duongsinh-studio}"
ROOT="${STUDIO_ROOT:-/srv/duongsinh-studio}"
CODE="${STUDIO_CODE:-/etc/dokploy/compose/duongsinh-studio-tluxoy/code}"
KEEP=3
fail() { echo "release: $*" >&2; exit 1; }

[[ "$TAG" =~ ^v[0-9][A-Za-z0-9._-]*$ ]] || fail "the tag $TAG is not like v1.2.3"
[ -n "${GH_TOKEN_FILE:-}" ] && [ -r "$GH_TOKEN_FILE" ] || fail "GH_TOKEN_FILE must name a readable file holding a read-only token"
GH_TOKEN="$(tr -d '\n' < "$GH_TOKEN_FILE")"
export GH_TOKEN

work=$(mktemp -d "$ROOT/incoming.XXXXXX" 2>/dev/null || mktemp -d)
trap 'rm -rf "$work"' EXIT
umask 022

gh release download "$TAG" -R "$REPO" -D "$work" -p 'studio-*.tar.gz' -p 'studio-*.tar.gz.sha256' >/dev/null
archive=$(ls "$work"/studio-*.tar.gz | head -n1)
[ -n "$archive" ] && [ -f "$archive.sha256" ] || fail "the release $TAG has no archive with its .sha256"
(cd "$work" && sha256sum --check --status "$(basename "$archive").sha256") || fail "SHA-256 does not match: the download is damaged or was changed"

sha=$(basename "$archive" .tar.gz); sha=${sha#studio-}
[[ "$sha" =~ ^[0-9a-f]{7,40}$ ]] || fail "unexpected archive name $(basename "$archive")"
target="$ROOT/releases/$sha"
[ ! -e "$target" ] || fail "$target already exists; nothing changed"
mkdir -p "$target"
tar -xzf "$archive" -C "$target"
[ -d "$target/dist" ] || { rm -rf "$target"; fail "the archive has no dist/"; }
chown -R 1000:1000 "$target" 2>/dev/null || echo "release: could not chown to 1000:1000 (not root?)" >&2

# Keep the newest $KEEP releases, and never the one now running.
running=""
[ -r "$CODE/.env" ] && running=$(sed -n 's/^STUDIO_RELEASE="\{0,1\}\([^"]*\)"\{0,1\}$/\1/p' "$CODE/.env" | head -n1)
i=0
for dir in $(ls -1t "$ROOT/releases"); do
  i=$((i + 1))
  [ "$i" -le "$KEEP" ] && continue
  [ "$dir" = "$running" ] && continue
  rm -rf "${ROOT:?}/releases/$dir"
done

echo "release $TAG unpacked as $sha. Nothing is switched yet."
echo "Next: wait until no run is in flight, take the pre-deploy dump, then: bash switch-release.sh $sha"
