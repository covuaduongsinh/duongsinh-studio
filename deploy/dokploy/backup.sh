#!/bin/sh
# Sao lưu hằng ngày cho Dương Sinh Studio trên VPS (/srv/duongsinh-studio/backup.sh, chạy bởi
# /etc/cron.d/duongsinh-studio-backup). Chỉ đụng tới project này. Giữ 14 bản gần nhất.
set -eu
ROOT=/srv/duongsinh-studio
DEST=$ROOT/backups
DAY=$(date +%Y%m%d-%H%M)
DB=$(docker ps -q --filter label=com.docker.compose.project=duongsinh-studio-tluxoy --filter label=com.docker.compose.service=db | head -n1)
[ -n "$DB" ] || { echo "duongsinh-studio backup: db container not running" >&2; exit 1; }
umask 077
nice -n 19 docker exec "$DB" pg_dump -U studio -d studio -Fc > "$DEST/studio-$DAY.dump.tmp"
mv "$DEST/studio-$DAY.dump.tmp" "$DEST/studio-$DAY.dump"
nice -n 19 ionice -c3 tar -czf "$DEST/storage-$DAY.tar.gz" -C "$ROOT" storage
ls -1t "$DEST"/studio-*.dump 2>/dev/null | tail -n +15 | xargs -r rm -f
ls -1t "$DEST"/storage-*.tar.gz 2>/dev/null | tail -n +15 | xargs -r rm -f
