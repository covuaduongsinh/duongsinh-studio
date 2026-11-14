#!/bin/sh
# Install as /etc/cron.hourly/ds-traefik-log-cap (chmod 755, no extension). Docker's log on this VPS has no size limit and
# Traefik's access log goes to stdout, so keep Traefik's Docker log under 100 MB by emptying it when it grows past that.
# The access-log collector reopens `docker logs -f` every 30 minutes, so it does not stay attached to a truncated file.
f=$(docker inspect -f '{{.LogPath}}' dokploy-traefik 2>/dev/null) || exit 0
[ -f "$f" ] || exit 0
size=$(stat -c %s "$f")
[ "$size" -gt 104857600 ] && truncate -s 0 "$f"
exit 0
