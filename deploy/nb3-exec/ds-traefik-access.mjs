#!/usr/bin/env node
/* global process, console, setInterval, setTimeout, clearInterval, clearTimeout */
/**
 * ds-traefik-access: turns Traefik's access log into the small file the job daemon reads for `lastAccess` (plan V, V5.1b).
 *
 * Traefik's container has no directory of its own on the host, and Docker's log on this VPS has no size limit, so Traefik writes
 * its (JSON, three-field) access log to stdout and this process follows it with `docker logs -f`. It keeps only the requests
 * to the host names of the apps in the daemon's configuration (`apps.*.hosts`), as `{RequestHost, RequestPath, StartUTC}`
 * lines, and adds a heartbeat line (`{"StartUTC": ..., "heartbeat": true}`) every minute while the stream is alive: the
 * daemon uses the first line as "observed since" and refuses a file nobody has touched for ten minutes.
 *
 * It reads and writes nothing else, takes no input from the network, and holds no secret. Zero dependencies (Node 24).
 */
import { spawn } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const HEARTBEAT_MS = 60_000;
const HOSTS_REFRESH_MS = 60_000;
/** `docker logs -f` is reopened now and then: it can stall when Docker's own log file is truncated to cap its size. */
const SESSION_MS = 30 * 60_000;
const RETRY_MS = 5_000;

/** The line to keep for one line of Traefik's access log, or null when it is not for one of `hosts`. */
export function keepLine(text, hosts) {
  if (!text.startsWith('{')) return null;
  let entry;
  try {
    entry = JSON.parse(text);
  } catch {
    return null;
  }
  const host = String(entry.RequestHost ?? '').toLowerCase();
  if (!hosts.has(host)) return null;
  const at = Date.parse(entry.StartUTC ?? '');
  if (!Number.isFinite(at)) return null;
  return JSON.stringify({
    RequestHost: host,
    RequestPath: String(entry.RequestPath ?? ''),
    StartUTC: new Date(at).toISOString(),
  });
}

/** Every host name of every app in the daemon's configuration. */
export function hostsOf(config) {
  const hosts = new Set();
  for (const app of Object.values(config.apps ?? {}))
    for (const host of app.hosts ?? [])
      if (typeof host === 'string') hosts.add(host.toLowerCase());
  return hosts;
}

function run(env = process.env) {
  const configFile = env.DS_NB3_EXEC_CONFIG ?? '/etc/ds-nb3-exec/config.json';
  const container = env.TRAEFIK_CONTAINER ?? 'dokploy-traefik';
  const docker = env.DOCKER_BIN ?? '/usr/bin/docker';
  const readConfig = () => JSON.parse(readFileSync(configFile, 'utf8'));
  let config = readConfig();
  let hosts = hostsOf(config);
  const output = () => config.accessLog ?? '/var/log/traefik/access.log';
  mkdirSync(path.dirname(output()), { recursive: true, mode: 0o750 });
  const write = (line) =>
    appendFileSync(output(), `${line}\n`, { mode: 0o640 });
  let since = new Date().toISOString();

  setInterval(() => {
    try {
      config = readConfig();
      hosts = hostsOf(config);
    } catch (error) {
      console.error(`config not reloaded: ${error.message}`);
    }
  }, HOSTS_REFRESH_MS).unref();

  function follow() {
    const child = spawn(docker, ['logs', '-f', '--since', since, container], {
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    let rest = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      const lines = (rest + chunk).split('\n');
      rest = lines.pop() ?? '';
      for (const text of lines) {
        const kept = keepLine(text, hosts);
        if (kept) write(kept);
      }
    });
    const beat = setInterval(
      () =>
        write(
          JSON.stringify({
            StartUTC: new Date().toISOString(),
            heartbeat: true,
          }),
        ),
      HEARTBEAT_MS,
    );
    const session = setTimeout(() => child.kill('SIGTERM'), SESSION_MS);
    write(
      JSON.stringify({ StartUTC: new Date().toISOString(), heartbeat: true }),
    );
    child.on('close', () => {
      clearInterval(beat);
      clearTimeout(session);
      since = new Date(Date.now() - 2000).toISOString();
      setTimeout(follow, RETRY_MS);
    });
    child.on('error', () => child.kill());
  }
  follow();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  run();
