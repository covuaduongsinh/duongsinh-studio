#!/bin/sh
# Sao lưu hằng ngày cho Dương Sinh Studio trên VPS (/srv/duongsinh-studio/backup.sh, chạy bởi
# /etc/cron.d/duongsinh-studio-backup). Chỉ đụng tới project này. Giữ 14 bản gần nhất trên VPS.
# Có REMOTE trong /srv/duongsinh-studio/backup.env (ví dụ REMOTE=studio-backup:duongsinh-studio) thì đẩy thêm ra ngoài bằng
# rclone, kiểm lại bằng checksum/kích thước, và giữ 30 ngày ở đó. Đẩy lỗi thì script thoát khác 0, bản trên VPS vẫn còn.
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
# Các app NocoBase 3 do Studio quản (V5.2): lỗi của chúng không chặn bản sao Studio, nhưng làm script thoát khác 0 ở cuối.
NB3=0
if [ -x "$ROOT/backup-nb3.sh" ]; then BACKUP_DAY="$DAY" "$ROOT/backup-nb3.sh" || NB3=1; fi
REMOTE=
[ -f "$ROOT/backup.env" ] && . "$ROOT/backup.env"
if [ -n "$REMOTE" ]; then
  rclone copy "$DEST" "$REMOTE" --include "studio-$DAY.dump" --include "storage-$DAY.tar.gz" --log-level ERROR
  rclone check "$DEST" "$REMOTE" --include "studio-$DAY.dump" --include "storage-$DAY.tar.gz" --one-way --log-level ERROR
  [ -d "$DEST/nb3" ] && rclone copy "$DEST/nb3" "$REMOTE/nb3" --include "*-$DAY.*" --log-level ERROR
  rclone delete "$REMOTE" --min-age 30d --log-level ERROR || echo "duongsinh-studio backup: could not prune $REMOTE" >&2
fi
ls -1t "$DEST"/studio-2*.dump 2>/dev/null | tail -n +15 | xargs -r rm -f
ls -1t "$DEST"/storage-2*.tar.gz 2>/dev/null | tail -n +15 | xargs -r rm -f
[ "$NB3" = 0 ] || { echo "duongsinh-studio backup: an NB3 app backup failed" >&2; exit 1; }
