#!/usr/bin/env bash
# Switch Dương Sinh Studio to a release that is already unpacked in /srv/duongsinh-studio/releases/<sha>.
# Run on the VPS as root, after the checks in docs/trien-khai-vps.md ("Cập nhật lên phiên bản mới"):
#   bash switch-release.sh <sha>
# It never prints .env values. It does NOT roll back by itself once the container has started: a release that ran its
# migrations cannot be undone by starting the previous one (12/11/2026: 7d1625f refused to start with "Executed
# migration ... is missing from migration sources"). Roll forward, or restore the pre-deploy dump (see "Quay lui").
set -uo pipefail

NEW="${1:?sha}"
APP=duongsinh-studio-tluxoy-app-1
DBC=duongsinh-studio-tluxoy-db-1
CODE=/etc/dokploy/compose/duongsinh-studio-tluxoy/code
BACKUPS=/srv/duongsinh-studio/backups
REASON="Cập nhật Studio ($NEW)"
psqlq() { docker exec "$DBC" psql -U studio -d studio -Atc "$1"; }

[ -d "/srv/duongsinh-studio/releases/$NEW/dist" ] || { echo "release $NEW is not unpacked"; exit 1; }
[ "$(grep -c '^STUDIO_RELEASE=' "$CODE/.env")" = 1 ] || { echo ".env has no single STUDIO_RELEASE line"; exit 1; }
ls "$BACKUPS"/studio-before-"$NEW"-*.dump >/dev/null 2>&1 || { echo "take the pre-deploy dump first (docs: Sao lưu)"; exit 1; }

echo "== 1. no run in flight"
RUNS=$(psqlq "select count(*) from ag_runs where status in ('running','dispatched')")
[ "$RUNS" = 0 ] || { echo "$RUNS runs in flight; try again later"; exit 1; }

echo "== 2. pause autopilot"
psqlq "insert into ds_autopilot_events (id, project_id, kind, reason, created_at)
       select 'deploy-pause-' || project_id || '-$NEW', project_id, 'paused', '$REASON', now()
       from ds_autopilot_settings where paused_reason is null"
psqlq "update ds_autopilot_settings set paused_reason='$REASON', updated_at=now() where paused_reason is null"
resume() { psqlq "update ds_autopilot_settings set paused_reason=null, updated_at=now() where paused_reason='$REASON'" >/dev/null; echo "autopilot resumed"; }

echo "== 3. env backup and switch to $NEW"
cp -p "$CODE/.env" "$BACKUPS/studio-env-before-$NEW.bak"
chmod 600 "$BACKUPS/studio-env-before-$NEW.bak"
sed -i "s/^STUDIO_RELEASE=.*/STUDIO_RELEASE=\"$NEW\"/" "$CODE/.env"
(cd "$CODE" && docker compose -p duongsinh-studio-tluxoy up -d app 2>&1 | tail -4)

echo "== 4. wait for healthy (migrations run on start), then the public address"
ok=0
for _ in $(seq 1 48); do
  st=$(docker inspect -f '{{.State.Status}}/{{.State.Health.Status}}' "$APP" 2>/dev/null)
  [ "$st" = running/healthy ] && { ok=1; break; }
  sleep 5
done
# Traefik takes a few seconds to pick up the recreated container: retry before deciding.
code=000
for _ in $(seq 1 24); do
  code=$(curl -s -m 10 -o /dev/null -w '%{http_code}' https://studio.dsc.edu.vn/main/api/healthz)
  [ "$code" = 200 ] && break
  sleep 5
done
if [ "$ok" != 1 ] || [ "$code" != 200 ]; then
  echo "!! not fully up (container healthy=$ok, public=$code). Autopilot stays paused."
  docker logs --tail 20 "$APP" 2>&1 | cut -c1-220
  echo "Do NOT start the previous release if migrations ran. Fix forward, or restore the dump."
  exit 1
fi

echo "== 5. resume autopilot and tidy"
resume
rm -f "/srv/duongsinh-studio/incoming/studio-$NEW.tar.gz"
docker inspect -f '{{range .Mounts}}{{.Source}} {{end}}' "$APP" | tr ' ' '\n' | grep releases
echo "OK: $NEW is live. Set STUDIO_RELEASE=$NEW in Dokploy (compose studio > Environment) without deploying, or the next Dokploy Deploy brings the old release back."
