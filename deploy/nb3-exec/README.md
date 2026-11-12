# ds-nb3-exec

A small root daemon on the VPS that lets Dương Sinh Studio run a fixed list of commands inside the NocoBase 3 apps it manages
(`docker compose run --rm --no-deps`), read an app's container logs and state, and keep the secrets only a job needs. Plan V, V4.
Zero dependencies (Node 24). Studio's side is the `nb3-jobs` provider and routes.

## Why it exists

Studio's Dokploy client has no `exec`, the shared runner is not in the `docker` group, and the Dokploy key is an account-wide key. The
alternatives were worse: the Docker socket in Studio's container is root on the VPS; SSH from a job puts a root way in on the Studio
side; GitHub Actions cannot reach the database. This daemon keeps root in one short process that does only what its own
configuration allows.

## Protocol

One JSON request per connection on a unix socket (`/run/ds-nb3/exec.sock`, mode 0660, group = Studio container's gid), one JSON answer.

```
{ v:1, id, op, app, argv?, since?, tail?, name?, value?, ts, nonce, sig }
op = run | logs | inspect | secretSet | secretNames
sig = HMAC-SHA256(key, v \n id \n op \n app \n JSON(argv) \n since \n tail \n name \n sha256(value) \n ts \n nonce)
```

## Threat model

**Assets:** student data in the apps' databases; integration secrets (`LARK_APP_SECRET`); root on a VPS that also runs production
NocoBase 2.

**Who can call it.** A process that can write to the socket (the Studio container's group) **and** knows the HMAC key
(`/etc/ds-nb3-exec/hmac.key`, mode 0640, group readable by that container only). People and agents never reach it: they go through
Studio's route, which needs login and `rel.apps/operate` (and root for commands that write). `studio-runner` has neither the group nor
the key.

**What it refuses:** a wrong or altered signature (the signature covers every field that changes what is done, including the
hash of a secret value); a request older or newer than 60 s, or a nonce seen in the last 10 min; an app name that is not
`nb3-<slug>` or not in its configuration; an operation it does not know; any `argv` that is not **exactly** one of the vectors in the
app's `allow` list (no prefixes, no extra arguments, so no `; ...`, no `--flag` the list did not name); a second job while one runs for
the same app; a job past `timeoutMs` (killed, and its container removed); `secretSet` names outside the app's `secretNames`, values
with a line break; requests over 64 KiB. It never uses a shell, never mounts anything extra, never `docker exec`s.

**What the log can hold.** Whatever the command prints. The daemon keeps only the **last 20 KB**, hides the value of every variable
in the job's env file and any `NAME=value` where the name ends in SECRET, PASSWORD, PASSWD or TOKEN, and returns the SHA-256 of the
whole output. A command that prints student records would put them in that tail: the allowed commands must print counts and column
differences, not rows (a rule for the playbook and the app's command, not something the daemon can check).

**If Studio is taken over.** The attacker can run the allowed commands on the configured apps, one at a time, with a time limit; cannot
read a secret back (`secretNames` lists names only); has no Docker socket, no shell, no way to change `allow`. The remaining risk is
running a write command (`--commit`, `db apply`) when nobody meant to: Studio allows writes to root only, records every job, and the
backup before a write is the backup scripts' job.

**If the HMAC key leaks:** rotate it (below); the daemon rejects the old signatures at once.

**Not covered:** a root compromise of the VPS itself; a command in `allow` that is itself unsafe; SQLite apps (a job running beside
the app can hit `SQLITE_BUSY`: stop the app first or enable WAL).

## Install (on the VPS, as root; the owner does this)

1. `install -d -m 755 /usr/local/lib/ds-nb3-exec && install -m 755 ds-nb3-exec.mjs /usr/local/lib/ds-nb3-exec/`
2. `install -d -m 750 /etc/ds-nb3-exec && install -d -m 700 /srv/duongsinh-studio/jobs`
3. `openssl rand -hex 32 > /etc/ds-nb3-exec/hmac.key; chown root:1000 /etc/ds-nb3-exec/hmac.key; chmod 640 /etc/ds-nb3-exec/hmac.key`
4. Copy `config.example.json` to `/etc/ds-nb3-exec/config.json` (root, 0600) and edit the apps and their `allow` lists.
5. `cp ds-nb3-exec.service /etc/systemd/system/ && systemctl daemon-reload && systemctl enable --now ds-nb3-exec`
6. Mount into the Studio container (read-only is enough to connect): `/run/ds-nb3:/run/ds-nb3:ro` and
   `/etc/ds-nb3-exec/hmac.key:/run/secrets/nb3-exec-hmac:ro`, and give Studio the settings `nb3Exec.socket` and `nb3Exec.keyFile` (see
   `docs/trien-khai-vps.md`). Do **not** mount `/var/run/docker.sock`.

Rotate the key: write a new `hmac.key`, `systemctl restart ds-nb3-exec`, restart Studio so it reads the new file.

## Test

`tests/project/nb3-exec-daemon.test.ts` runs the daemon on a real socket with a fake `docker` (`tests/fixtures/fake-docker/nb3-docker`).
It does not run Docker.
