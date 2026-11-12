#!/bin/sh
# Sao lưu mọi app NocoBase 3 do Studio quản (compose `nb3-<slug>`), V5.2. Chạy từ backup.sh (cron hằng đêm) hoặc tay.
# Mỗi app một bản DB + một bản tệp tải lên, vào $ROOT/backups/nb3/, giữ 14 bản gần nhất mỗi loại:
#   - app có container `nb3-<slug>-db` (PostgreSQL): pg_dump -Fc, kiểm bằng pg_restore -l;
#   - app SQLite: bản sao an toàn bằng better-sqlite3 backup() trong container (không dừng app);
#   - tệp: tar của /app/storage trừ SQLite, log và jobs.
# Không in biến môi trường. Một app lỗi không chặn các app còn lại; thoát khác 0 nếu có app lỗi.
set -u
ROOT=${BACKUP_ROOT:-/srv/duongsinh-studio}
DEST=$ROOT/backups/nb3
DAY=${BACKUP_DAY:-$(date +%Y%m%d-%H%M)}
KEEP=${NB3_KEEP:-14}
umask 077
mkdir -p "$DEST"
failed=0
list=$(mktemp)
trap 'rm -f "$list"' EXIT
docker ps --format '{{.Names}}|{{.Label "com.docker.compose.project"}}|{{.Label "com.docker.compose.service"}}' |
  awk -F'|' '$3 ~ /^nb3-.+-app$/ { print $1 "|" $2 "|" $3 }' > "$list"

fail() { echo "backup-nb3: $1" >&2; failed=1; }

while IFS='|' read -r container project service; do
  [ -n "$container" ] || continue
  name=${service#nb3-}
  name=${name%-app}
  base=$DEST/$name-$DAY
  db=$(docker ps -q --filter "label=com.docker.compose.project=$project" --filter "label=com.docker.compose.service=nb3-$name-db" | head -n1)
  if [ -n "$db" ]; then
    user=$(docker exec "$db" printenv POSTGRES_USER)
    database=$(docker exec "$db" printenv POSTGRES_DB)
    if docker exec "$db" pg_dump -U "$user" -d "$database" -Fc > "$base.dump.tmp" &&
      [ "$(docker exec -i "$db" pg_restore -l < "$base.dump.tmp" | grep -c 'TABLE DATA')" -gt 0 ]; then
      mv "$base.dump.tmp" "$base.dump"
    else
      rm -f "$base.dump.tmp"
      fail "$name: pg_dump failed or has no table data"
    fi
  else
    if docker exec "$container" node -e '
      const Database = require("/app/dist/node_modules/better-sqlite3");
      const file = process.env.DB_STORAGE || "/app/storage/database.sqlite";
      new Database(file, { readonly: true }).backup("/tmp/ds-backup.sqlite")
        .then(() => process.exit(0), (error) => { console.error(error.message); process.exit(1); });
    ' &&
      docker cp "$container:/tmp/ds-backup.sqlite" "$base.sqlite.tmp"; then
      mv "$base.sqlite.tmp" "$base.sqlite"
    else
      rm -f "$base.sqlite.tmp"
      fail "$name: sqlite backup failed"
    fi
    docker exec "$container" rm -f /tmp/ds-backup.sqlite >/dev/null 2>&1 || true
  fi
  if docker exec "$container" tar -czf - -C /app/storage --exclude='*.sqlite*' --exclude=logs --exclude=jobs . > "$base.storage.tar.gz.tmp"; then
    mv "$base.storage.tar.gz.tmp" "$base.storage.tar.gz"
  else
    rm -f "$base.storage.tar.gz.tmp"
    fail "$name: storage archive failed"
  fi
  for kind in dump sqlite storage.tar.gz; do
    ls -1t "$DEST/$name"-2*."$kind" 2>/dev/null | tail -n +"$((KEEP + 1))" | xargs -r rm -f
  done
done < "$list"

exit "$failed"
