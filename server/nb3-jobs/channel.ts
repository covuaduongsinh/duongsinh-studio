/**
 * The client of the `ds-nb3-exec` daemon (plan V, V4): one signed JSON request over a unix socket, one JSON answer. It signs
 * with the same text the daemon verifies (`deploy/nb3-exec/ds-nb3-exec.mjs`, `canonical`); keep the two in step.
 */
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { connect } from 'node:net';

export interface DaemonRequest {
  readonly op:
    'run' | 'logs' | 'inspect' | 'secretSet' | 'secretNames' | 'lastAccess';
  readonly app: string;
  readonly argv?: readonly string[];
  readonly since?: string;
  readonly tail?: number;
  readonly name?: string;
  readonly value?: string;
}

export type DaemonAnswer = {
  readonly ok: boolean;
  readonly error?: string;
  readonly message?: string;
} & Readonly<Record<string, unknown>>;

export interface Nb3Channel {
  /** Whether the daemon accepts a connection now. */
  reachable(): Promise<boolean>;
  call(request: DaemonRequest, timeoutMs?: number): Promise<DaemonAnswer>;
}

interface Signable {
  readonly v: 1;
  readonly id: string;
  readonly op: string;
  readonly app: string;
  readonly argv?: readonly string[] | undefined;
  readonly since?: string | undefined;
  readonly tail?: number | undefined;
  readonly name?: string | undefined;
  readonly value?: string | undefined;
  readonly ts: number;
  readonly nonce: string;
}

/** Same fields, same order as the daemon's `canonical`. */
export function canonicalText(request: Signable): string {
  const valueHash =
    request.value === undefined
      ? ''
      : createHash('sha256').update(request.value).digest('hex');
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

/** A job can run as long as the daemon lets it (15 minutes by default) plus the time to start and to answer. */
const DEFAULT_TIMEOUT_MS = 16 * 60_000;

export function createNb3Channel(options: {
  readonly socket: string;
  readonly keyFile: string;
  readonly now?: () => number;
}): Nb3Channel {
  const now = options.now ?? Date.now;
  return {
    reachable: () =>
      new Promise((resolve) => {
        const probe = connect(options.socket);
        const done = (value: boolean) => {
          probe.destroy();
          resolve(value);
        };
        probe.once('connect', () => done(true));
        probe.once('error', () => done(false));
        probe.setTimeout(2000, () => done(false));
      }),
    call: (request, timeoutMs = DEFAULT_TIMEOUT_MS) =>
      new Promise((resolve) => {
        let key: string;
        try {
          key = readFileSync(options.keyFile, 'utf8').trim();
        } catch {
          resolve({
            ok: false,
            error: 'NO_KEY',
            message: 'The job key cannot be read.',
          });
          return;
        }
        const body: Signable = {
          v: 1,
          id: randomUUID(),
          ts: now(),
          nonce: randomBytes(16).toString('hex'),
          ...request,
        };
        const sig = createHmac('sha256', key)
          .update(canonicalText(body))
          .digest('hex');
        const socket = connect(options.socket);
        let data = '';
        let settled = false;
        const finish = (answer: DaemonAnswer) => {
          if (settled) return;
          settled = true;
          socket.destroy();
          resolve(answer);
        };
        socket.setEncoding('utf8');
        socket.setTimeout(timeoutMs, () =>
          finish({ ok: false, error: 'TIMEOUT', message: 'No answer.' }),
        );
        socket.once('error', () =>
          finish({
            ok: false,
            error: 'UNREACHABLE',
            message: 'The job daemon cannot be reached.',
          }),
        );
        socket.on('data', (chunk: string) => {
          data += chunk;
          const end = data.indexOf('\n');
          if (end < 0) return;
          try {
            finish(JSON.parse(data.slice(0, end)) as DaemonAnswer);
          } catch {
            finish({
              ok: false,
              error: 'BAD_ANSWER',
              message: 'The daemon answered something else.',
            });
          }
        });
        socket.once('close', () =>
          finish({
            ok: false,
            error: 'NO_ANSWER',
            message: 'The daemon closed without an answer.',
          }),
        );
        socket.once('connect', () =>
          socket.write(`${JSON.stringify({ ...body, sig })}\n`),
        );
      }),
  };
}

/** The channel from the environment, or null while it is off (no socket or key configured). */
export function channelFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): Nb3Channel | null {
  const { NB3_EXEC_SOCKET: socket, NB3_EXEC_KEY_FILE: keyFile } = env;
  return socket && keyFile ? createNb3Channel({ socket, keyFile }) : null;
}
