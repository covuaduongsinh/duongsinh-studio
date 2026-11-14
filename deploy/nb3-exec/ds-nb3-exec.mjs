#!/usr/bin/env node
/* global Buffer, process, console, setTimeout, clearTimeout */
/**
 * ds-nb3-exec: the small root daemon that lets Studio run a fixed set of commands inside the NocoBase 3 apps it manages
 * (plan V, V4). It listens on a unix socket, answers only requests signed with a shared key, and runs only commands that
 * match an allowlist in its own configuration. Studio never gets the Docker socket and never a shell.
 *
 * Zero dependencies. Threat model and installation: README.md next to this file.
 *
 * Protocol: one JSON request per connection (a line), one JSON answer (a line).
 *   { v:1, id, op, app, argv?, since?, tail?, name?, value?, ts, nonce, sig }
 *   op: run | logs | inspect | secretSet | secretNames | lastAccess | dump
 *   sig: HMAC-SHA256 over the fields below, hex.
 */
import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { spawn } from 'node:child_process';
import {
  chmodSync,
  chownSync,
  closeSync,
  existsSync,
  fstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';

const MAX_REQUEST_BYTES = 64 * 1024;
const CLOCK_SKEW_MS = 60_000;
const NONCE_TTL_MS = 10 * 60_000;
const LOG_TAIL_BYTES = 20 * 1024;
const APP_NAME = /^nb3-[a-z0-9][a-z0-9-]{0,50}$/u;
const SECRET_NAME = /^[A-Z][A-Z0-9_]{1,63}$/u;
const OPS = new Set([
  'run',
  'logs',
  'inspect',
  'secretSet',
  'secretNames',
  'lastAccess',
  'dump',
]);
/** How much of the end of the Traefik access log `lastAccess` reads. */
const ACCESS_LOG_BYTES = 8 * 1024 * 1024;
/** The collector writes a heartbeat line every minute; a log not touched for this long is not trusted (the collector is down). */
const ACCESS_LOG_MAX_AGE_MS = 10 * 60_000;
const SINCE = /^\d{1,4}[smh]$/u;

/** The text the signature covers; every field that changes what the daemon does is in it. */
export function canonical(request) {
  const valueHash =
    request.value === undefined
      ? ''
      : createHash('sha256').update(String(request.value)).digest('hex');
  return [
    request.v,
    request.id,
    request.op,
    request.app,
    JSON.stringify(request.argv ?? null),
    request.since ?? '',
    request.tail ?? '',
    request.name ?? '',
    valueHash,
    request.ts,
    request.nonce,
  ].join('\n');
}

export function sign(key, request) {
  return createHmac('sha256', key).update(canonical(request)).digest('hex');
}

/** Secret values of an env file and the values of secret-looking names, as strings to hide in a log. */
function secretValuesOf(envFile) {
  if (!envFile || !existsSync(envFile)) return [];
  const values = [];
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/u.exec(line);
    if (!match) continue;
    const value = match[2].replace(/^["']|["']$/gu, '');
    if (value.length >= 6) values.push(value);
  }
  return values;
}

export function mask(text, secrets) {
  let result = text;
  for (const secret of [...secrets].sort((a, b) => b.length - a.length))
    result = result.split(secret).join('[HIDDEN]');
  return result.replace(
    /\b([A-Z][A-Z0-9_]*(?:SECRET|PASSWORD|PASSWD|TOKEN)[A-Z0-9_]*)=\S+/gu,
    '$1=[HIDDEN]',
  );
}

class Denied extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function sameArgv(a, b) {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

/**
 * @param {object} config see README.md
 * @param {{ now?: () => number }} [deps]
 */
export function createDaemon(config, deps = {}) {
  const now = deps.now ?? Date.now;
  const docker = config.dockerBin ?? 'docker';
  const key = readFileSync(config.hmacKeyFile, 'utf8').trim();
  if (key.length < 32)
    throw new Error('The HMAC key must be at least 32 characters.');
  const seen = new Map();
  const busy = new Set();
  const timeoutMs = config.timeoutMs ?? 15 * 60_000;

  function verify(request) {
    if (request?.v !== 1 || typeof request.sig !== 'string')
      throw new Denied('BAD_REQUEST', 'Malformed request.');
    for (const field of ['id', 'op', 'app', 'nonce'])
      if (typeof request[field] !== 'string' || request[field].length > 128)
        throw new Denied('BAD_REQUEST', `Bad ${field}.`);
    if (typeof request.ts !== 'number')
      throw new Denied('BAD_REQUEST', 'Bad ts.');
    const expected = Buffer.from(sign(key, request), 'hex');
    const given = Buffer.from(request.sig, 'hex');
    if (expected.length !== given.length || !timingSafeEqual(expected, given))
      throw new Denied('BAD_SIGNATURE', 'The signature does not match.');
    const at = now();
    if (Math.abs(at - request.ts) > CLOCK_SKEW_MS)
      throw new Denied('STALE', 'The request is too old or from the future.');
    for (const [nonce, when] of seen)
      if (at - when > NONCE_TTL_MS) seen.delete(nonce);
    if (seen.has(request.nonce))
      throw new Denied('REPLAY', 'This request was already used.');
    seen.set(request.nonce, at);
    if (!OPS.has(request.op)) throw new Denied('BAD_OP', 'Unknown operation.');
    if (!APP_NAME.test(request.app))
      throw new Denied('BAD_APP', 'Not an app name.');
    const app = config.apps?.[request.app];
    if (!app) throw new Denied('UNKNOWN_APP', 'This app is not configured.');
    return app;
  }

  function run(command, args, options = {}) {
    const { onTimeout, ...spawnOptions } = options;
    return new Promise((resolve) => {
      const child = spawn(command, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        ...spawnOptions,
      });
      const chunks = [];
      let size = 0;
      let total = 0;
      const hash = createHash('sha256');
      let timedOut = false;
      const keep = (chunk) => {
        hash.update(chunk);
        total += chunk.length;
        chunks.push(chunk);
        size += chunk.length;
        while (
          size - chunks[0].length >= LOG_TAIL_BYTES * 2 &&
          chunks.length > 1
        )
          size -= chunks.shift().length;
      };
      child.stdout.on('data', keep);
      child.stderr.on('data', keep);
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGKILL');
        onTimeout?.();
      }, timeoutMs);
      child.on('error', (error) => {
        clearTimeout(timer);
        resolve({
          exitCode: null,
          output: Buffer.from(String(error.message)),
          total: 0,
          sha256: '',
          timedOut,
        });
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        resolve({
          exitCode: code,
          output: Buffer.concat(chunks),
          total,
          sha256: hash.digest('hex'),
          timedOut,
        });
      });
    });
  }

  const composeArgs = (app) => [
    'compose',
    '-p',
    app.project,
    ...(app.composeFile ? ['-f', app.composeFile] : []),
  ];

  async function opRun(request, app) {
    const argv = request.argv;
    if (
      !Array.isArray(argv) ||
      argv.length === 0 ||
      argv.some((item) => typeof item !== 'string' || item.length > 200)
    )
      throw new Denied('BAD_REQUEST', 'argv must be a list of strings.');
    if (!(app.allow ?? []).some((entry) => sameArgv(entry, argv)))
      throw new Denied(
        'NOT_ALLOWED',
        'This command is not in the allowlist for this app.',
      );
    if (busy.has(request.app))
      throw new Denied('BUSY', 'A job is already running for this app.');
    busy.add(request.app);
    const started = now();
    const container = `ds-job-${request.id.replace(/[^a-zA-Z0-9_.-]/gu, '').slice(0, 40)}`;
    try {
      const args = [
        ...composeArgs(app),
        'run',
        '--rm',
        '--no-deps',
        '--name',
        container,
        app.jobService ?? app.service,
        ...(app.entry ?? ['node', 'dist/cli/index.js']),
        ...argv,
      ];
      const result = await run(docker, args, {
        cwd: app.composeDir,
        onTimeout: () =>
          void spawn(docker, ['rm', '-f', container], { stdio: 'ignore' }),
      });
      return {
        exitCode: result.timedOut ? null : result.exitCode,
        timedOut: result.timedOut,
        durationMs: now() - started,
        log: tailOf(result.output, app),
        logBytes: result.total,
        sha256: result.sha256,
      };
    } finally {
      busy.delete(request.app);
    }
  }

  function tailOf(output, app) {
    const tail =
      output.length > LOG_TAIL_BYTES
        ? output.subarray(output.length - LOG_TAIL_BYTES)
        : output;
    return mask(tail.toString('utf8'), secretValuesOf(app.envFile));
  }

  async function containerOf(app) {
    const found = await run(docker, [
      'ps',
      '-a',
      '-q',
      '--filter',
      `label=com.docker.compose.project=${app.project}`,
      '--filter',
      `label=com.docker.compose.service=${app.service}`,
    ]);
    return found.output.toString('utf8').split('\n').find(Boolean) ?? null;
  }

  async function opLogs(request, app) {
    const container = await containerOf(app);
    if (!container)
      throw new Denied('NO_CONTAINER', 'No container for this app.');
    const since =
      request.since && SINCE.test(request.since) ? request.since : '1h';
    const tail = Number.isInteger(request.tail)
      ? Math.min(Math.max(request.tail, 1), 1000)
      : 200;
    const result = await run(docker, [
      'logs',
      '--since',
      since,
      '--tail',
      String(tail),
      container,
    ]);
    return { log: tailOf(result.output, app), exitCode: result.exitCode };
  }

  async function opInspect(request, app) {
    const container = await containerOf(app);
    if (!container) return { state: 'missing' };
    const result = await run(docker, [
      'inspect',
      '-f',
      '{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{end}}|{{.State.StartedAt}}|{{.State.ExitCode}}|{{.RestartCount}}|{{.State.OOMKilled}}',
      container,
    ]);
    const [status, health, startedAt, exitCode, restartCount, oom] =
      result.output.toString('utf8').trim().split('|');
    return {
      state: status,
      health: health || null,
      startedAt,
      exitCode: Number(exitCode),
      restartCount: Number(restartCount),
      oomKilled: oom === 'true',
    };
  }

  /**
   * When did a request last reach one of the app's host names (plan V, V5.1b)? Reads the end of Traefik's JSON access log
   * (`accessLog` in the configuration) for the app's `hosts`, ignoring health probes. `known` is false when no log or no
   * host is configured or the log cannot be read: the caller must not conclude anything. `from` is the time of the first
   * line read, so a caller can tell whether the window reaches back far enough to call an app idle.
   */
  function opLastAccess(app) {
    const hosts = new Set(app.hosts ?? []);
    if (!config.accessLog || hosts.size === 0) return { known: false };
    let text;
    try {
      const fd = openSync(config.accessLog, 'r');
      try {
        const stat = fstatSync(fd);
        const maxAge = config.accessLogMaxAgeMs ?? ACCESS_LOG_MAX_AGE_MS;
        if (now() - stat.mtimeMs > maxAge) return { known: false };
        const size = stat.size;
        const length = Math.min(size, ACCESS_LOG_BYTES);
        const buffer = Buffer.alloc(length);
        readSync(fd, buffer, 0, length, size - length);
        text = buffer.toString('utf8');
      } finally {
        closeSync(fd);
      }
    } catch {
      return { known: false };
    }
    let from = null;
    let last = null;
    for (const line of text.split('\n')) {
      if (!line.startsWith('{')) continue;
      let entry;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }
      const at = Date.parse(entry.StartUTC ?? entry.time ?? '');
      if (!Number.isFinite(at)) continue;
      if (from === null || at < from) from = at;
      const host = String(entry.RequestHost ?? '').toLowerCase();
      const requestPath = String(entry.RequestPath ?? '');
      if (!hosts.has(host) || /^\/(?:[^/]+\/)*api\/healthz/u.test(requestPath))
        continue;
      if (last === null || at > last) last = at;
    }
    return {
      known: true,
      from: from === null ? null : new Date(from).toISOString(),
      lastAt: last === null ? null : new Date(last).toISOString(),
    };
  }

  /** Runs `docker` with its stdout written to `file` (mode 0600) and optionally `input` as stdin; resolves the exit code. */
  function runToFile(args, file, input) {
    return new Promise((resolve) => {
      const out = openSync(file, 'w', 0o600);
      const inFd = input ? openSync(input, 'r') : null;
      const child = spawn(docker, args, {
        stdio: [inFd ?? 'ignore', out, 'ignore'],
      });
      const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
      const done = (code) => {
        clearTimeout(timer);
        closeSync(out);
        if (inFd !== null) closeSync(inFd);
        resolve(code);
      };
      child.on('error', () => done(null));
      child.on('close', done);
    });
  }

  /**
   * A custom-format `pg_dump` of the app's database into `dumpDir` (V5.2b), checked with `pg_restore -l`, before Studio removes
   * the app's data. The only place the daemon uses `docker exec`, and with a fixed command: the container comes from the
   * configuration's compose labels, the user and database from that container's own environment, nothing from the request.
   */
  async function opDump(request, app) {
    if (!app.dbService || !app.dumpDir)
      throw new Denied('NO_DUMP', 'This app has no database dump configured.');
    if (busy.has(request.app))
      throw new Denied('BUSY', 'A job is already running for this app.');
    busy.add(request.app);
    try {
      const found = await run(docker, [
        'ps',
        '-q',
        '--filter',
        `label=com.docker.compose.project=${app.project}`,
        '--filter',
        `label=com.docker.compose.service=${app.dbService}`,
      ]);
      const container = found.output.toString('utf8').split('\n').find(Boolean);
      if (!container)
        throw new Denied(
          'NO_CONTAINER',
          'The database container is not running.',
        );
      const env = async (name) =>
        (await run(docker, ['exec', container, 'printenv', name])).output
          .toString('utf8')
          .trim();
      const user = await env('POSTGRES_USER');
      const database = await env('POSTGRES_DB');
      if (
        !/^[A-Za-z0-9_]{1,63}$/u.test(user) ||
        !/^[A-Za-z0-9_]{1,63}$/u.test(database)
      )
        throw new Denied(
          'FAILED',
          'The database container has no usable user or name.',
        );
      mkdirSync(app.dumpDir, { recursive: true, mode: 0o700 });
      const stamp = new Date(now())
        .toISOString()
        .replace(/[-:]/gu, '')
        .replace(/\..*$/u, '')
        .replace('T', '-');
      const file = path.join(app.dumpDir, `${request.app}-${stamp}.dump`);
      const temporary = `${file}.tmp`;
      const code = await runToFile(
        ['exec', container, 'pg_dump', '-U', user, '-d', database, '-Fc'],
        temporary,
      );
      const listing = path.join(app.dumpDir, `.${request.app}.list.tmp`);
      const listed =
        code === 0
          ? await runToFile(
              ['exec', '-i', container, 'pg_restore', '-l'],
              listing,
              temporary,
            )
          : null;
      const tables =
        listed === 0
          ? readFileSync(listing, 'utf8')
              .split('\n')
              .filter((line) => line.includes('TABLE DATA')).length
          : 0;
      rmSync(listing, { force: true });
      if (code !== 0 || tables === 0) {
        rmSync(temporary, { force: true });
        throw new Denied(
          'DUMP_FAILED',
          'The dump failed or holds no table data.',
        );
      }
      chmodSync(temporary, 0o600);
      renameSync(temporary, file);
      const bytes = readFileSync(file);
      return {
        file,
        bytes: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        tables,
      };
    } finally {
      busy.delete(request.app);
    }
  }

  function envFileOf(app) {
    if (!app.envFile)
      throw new Denied('NO_ENV_FILE', 'This app has no job environment file.');
    return app.envFile;
  }

  function opSecretNames(app) {
    const file = envFileOf(app);
    if (!existsSync(file)) return { names: [] };
    return {
      names: readFileSync(file, 'utf8')
        .split('\n')
        .flatMap((line) => /^([A-Za-z_][A-Za-z0-9_]*)=/u.exec(line)?.[1] ?? []),
    };
  }

  function opSecretSet(request, app) {
    const file = envFileOf(app);
    if (typeof request.name !== 'string' || !SECRET_NAME.test(request.name))
      throw new Denied('BAD_NAME', 'Not a variable name.');
    if (
      typeof request.value !== 'string' ||
      request.value.length === 0 ||
      request.value.length > 4096 ||
      /[\r\n\0]/u.test(request.value)
    )
      throw new Denied(
        'BAD_VALUE',
        'The value must be one line of 1-4096 characters.',
      );
    if (
      (app.secretNames ?? []).length > 0 &&
      !app.secretNames.includes(request.name)
    )
      throw new Denied(
        'NAME_NOT_ALLOWED',
        'This name is not allowed for this app.',
      );
    const lines = existsSync(file)
      ? readFileSync(file, 'utf8')
          .split('\n')
          .filter((line) => line !== '')
      : [];
    const next = lines.filter((line) => !line.startsWith(`${request.name}=`));
    next.push(`${request.name}=${request.value}`);
    mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    const temporary = `${file}.${randomBytes(4).toString('hex')}.tmp`;
    writeFileSync(temporary, `${next.join('\n')}\n`, { mode: 0o600 });
    chmodSync(temporary, 0o600);
    renameSync(temporary, file);
    return { stored: request.name };
  }

  /** @returns {Promise<object>} the answer; never throws */
  async function handle(raw) {
    let request;
    try {
      request = JSON.parse(raw);
    } catch {
      return { ok: false, error: 'BAD_REQUEST', message: 'Not JSON.' };
    }
    try {
      const app = verify(request);
      const body =
        request.op === 'run'
          ? await opRun(request, app)
          : request.op === 'logs'
            ? await opLogs(request, app)
            : request.op === 'inspect'
              ? await opInspect(request, app)
              : request.op === 'dump'
                ? await opDump(request, app)
                : request.op === 'lastAccess'
                  ? opLastAccess(app)
                  : request.op === 'secretSet'
                    ? opSecretSet(request, app)
                    : opSecretNames(app);
      return { ok: true, id: request.id, ...body };
    } catch (error) {
      if (error instanceof Denied)
        return {
          ok: false,
          id: request?.id,
          error: error.code,
          message: error.message,
        };
      return {
        ok: false,
        id: request?.id,
        error: 'FAILED',
        message: 'The daemon could not do this.',
      };
    }
  }

  function listen() {
    const server = createServer((socket) => {
      let data = '';
      let answered = false;
      socket.setEncoding('utf8');
      socket.on('data', async (chunk) => {
        if (answered) return;
        data += chunk;
        if (data.length > MAX_REQUEST_BYTES) {
          answered = true;
          socket.end(
            `${JSON.stringify({ ok: false, error: 'TOO_LARGE', message: 'Request too large.' })}\n`,
          );
          return;
        }
        const end = data.indexOf('\n');
        if (end < 0) return;
        answered = true;
        const answer = await handle(data.slice(0, end));
        socket.end(`${JSON.stringify(answer)}\n`);
      });
      socket.on('error', () => {});
    });
    return server;
  }

  return { handle, listen };
}

/* c8 ignore start: the process entry */
if (import.meta.url === `file://${process.argv[1]}`) {
  const configFile =
    process.env.DS_NB3_EXEC_CONFIG ?? '/etc/ds-nb3-exec/config.json';
  const config = JSON.parse(readFileSync(configFile, 'utf8'));
  const daemon = createDaemon(config);
  const server = daemon.listen();
  mkdirSync(path.dirname(config.socket), { recursive: true, mode: 0o750 });
  if (existsSync(config.socket)) {
    try {
      renameSync(config.socket, `${config.socket}.old`);
    } catch {
      // The old socket could not be moved; listen() below reports the real problem.
    }
  }
  server.listen(config.socket, () => {
    chmodSync(config.socket, 0o660);
    if (config.socketGid !== undefined && process.getuid?.() === 0)
      chownSync(config.socket, 0, config.socketGid);
    console.error(`ds-nb3-exec listening on ${config.socket}`);
  });
}
/* c8 ignore stop */
