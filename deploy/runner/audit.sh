#!/usr/bin/env bash
# What the shared runner's user can reach that it must not (plan T, T8). Run it AS the runner user (`su - studio-runner`
# then `bash audit.sh`); it only reads metadata and tests access, prints no file content, and changes nothing.
# Exit status: 0 when nothing it must not reach is reachable, 1 otherwise (one line each), 2 when run as root.
#
# Paths can be set in the environment, for another layout or for the test:
#   DS_AUDIT_SECRETS      Studio's configuration and keys (files or directories)
#   DS_AUDIT_DOKPLOY      Dokploy's data (directories)
#   DS_AUDIT_DOCKER_SOCK  the Docker socket
#   DS_AUDIT_EXEC_SOCK    the ds-nb3-exec daemon's socket
#   DS_AUDIT_BACKUPS      the backup directory
# Each variable holds paths separated by spaces.
set -u

if [ "$(id -u)" -eq 0 ]; then
  echo "Run this as the runner's user, not as root: root can read everything." >&2
  exit 2
fi

secrets=${DS_AUDIT_SECRETS-"/srv/duongsinh-studio/config.yml /srv/duongsinh-studio/.env /etc/ds-nb3-exec/config.json"}
dokploy=${DS_AUDIT_DOKPLOY-"/etc/dokploy /var/lib/dokploy"}
docker_sock=${DS_AUDIT_DOCKER_SOCK-"/var/run/docker.sock /run/docker.sock"}
exec_sock=${DS_AUDIT_EXEC_SOCK-"/run/ds-nb3/exec.sock"}
backups=${DS_AUDIT_BACKUPS-"/srv/duongsinh-studio/backups"}

red=0
say() {
  printf 'RED   %-14s %s\n' "$1" "$2"
  red=1
}

# A path the user may read (a file) or list (a directory).
readable() {
  if [ -d "$1" ]; then [ -r "$1" ] && [ -x "$1" ]; else [ -r "$1" ]; fi
}
# A socket the user may connect to needs write permission on it.
connectable() {
  [ -S "$1" ] && [ -w "$1" ]
}

for path in $secrets; do
  [ -e "$path" ] && readable "$path" && say "secrets" "$path can be read"
done
for path in $dokploy; do
  [ -e "$path" ] && readable "$path" && say "dokploy" "$path can be read"
done
for path in $docker_sock; do
  [ -e "$path" ] && connectable "$path" && say "docker-socket" "$path can be written (the Docker daemon is root)"
done
for path in $exec_sock; do
  [ -e "$path" ] && connectable "$path" && say "exec-socket" "$path can be written (it runs jobs inside the Apps)"
done
for path in $backups; do
  [ -e "$path" ] && readable "$path" && say "backups" "$path can be read"
done

if [ "$red" -eq 0 ]; then
  echo "OK    nothing it must not reach is reachable from $(id -un)"
fi
exit "$red"
