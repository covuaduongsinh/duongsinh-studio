import { randomUUID } from 'node:crypto';
import type { DatabaseConnection } from '@nocobase/db';
import { str, strOrNull, type Row } from '../git/rows.js';
import type { Nb3Channel } from './channel.js';
import {
  JOB_LOG_DAYS,
  JOB_STALE_MINUTES,
  type JobCommand,
} from './commands.js';

const TABLE = 'dsNb3Jobs';
const DAY_MS = 86_400_000;

export interface JobView {
  readonly id: string;
  readonly appId: string;
  readonly command: string;
  readonly write: boolean;
  readonly actorType: string;
  readonly actorId: string;
  readonly status: 'running' | 'succeeded' | 'failed' | 'timeout' | 'denied';
  readonly exitCode: number | null;
  readonly errorCode: string | null;
  readonly logTail: string | null;
  readonly logSha256: string | null;
  readonly durationMs: number | null;
  readonly startedAt: string;
  readonly finishedAt: string | null;
}

export class JobError extends Error {
  constructor(
    readonly code: 'RUNNING' | 'NOT_FOUND' | 'CHANNEL_DOWN',
    message: string,
  ) {
    super(message);
  }
}

const iso = (value: unknown): string =>
  new Date(value as string | Date).toISOString();

export function createNb3JobsService(deps: {
  readonly connection: () => DatabaseConnection;
  readonly channel: () => Nb3Channel | null;
  /** The daemon's name for an App: `nb3-…`, the App's id. */
  readonly now?: () => Date;
}) {
  const now = deps.now ?? (() => new Date());
  const conn = () => deps.connection();

  const viewOf = (row: Row): JobView => {
    const started = new Date(row.startedAt as string | Date);
    const stale =
      str(row.status) === 'running' &&
      now().getTime() - started.getTime() > JOB_STALE_MINUTES * 60_000;
    return {
      id: str(row.id),
      appId: str(row.appId),
      command: str(row.command),
      write: row.isWrite === true || row.isWrite === 1,
      actorType: str(row.actorType),
      actorId: str(row.actorId),
      status: stale ? 'timeout' : (str(row.status) as JobView['status']),
      exitCode: row.exitCode === null ? null : Number(row.exitCode),
      errorCode: strOrNull(row.errorCode),
      logTail: strOrNull(row.logTail),
      logSha256: strOrNull(row.logSha256),
      durationMs: row.durationMs === null ? null : Number(row.durationMs),
      startedAt: started.toISOString(),
      finishedAt: row.finishedAt ? iso(row.finishedAt) : null,
    };
  };

  const get = async (appId: string, id: string): Promise<JobView> => {
    const row: Row | undefined = await conn()
      .query.selectFrom(TABLE)
      .selectAll()
      .where('appId', '=', appId)
      .where('id', '=', id)
      .executeTakeFirst();
    if (!row) throw new JobError('NOT_FOUND', 'No such job.');
    return viewOf(row);
  };

  return {
    get,

    async list(appId: string, limit = 20): Promise<JobView[]> {
      const rows: Row[] = await conn()
        .query.selectFrom(TABLE)
        .selectAll()
        .where('appId', '=', appId)
        .orderBy('createdAt', 'desc')
        .limit(limit)
        .execute();
      return rows.map(viewOf);
    },

    /**
     * Asks the daemon to run `command` in the App and returns at once with the job; the daemon's answer fills the row later.
     * One job per App at a time (the daemon says so too).
     */
    async start(input: {
      readonly appId: string;
      readonly command: JobCommand;
      readonly actor: { readonly type: string; readonly id: string };
    }): Promise<JobView> {
      const channel = deps.channel();
      if (!channel || !(await channel.reachable()))
        throw new JobError(
          'CHANNEL_DOWN',
          'The job channel is off or the daemon is not running on the server.',
        );
      const at = now();
      await conn()
        .query.deleteFrom(TABLE)
        .where('createdAt', '<', new Date(at.getTime() - JOB_LOG_DAYS * DAY_MS))
        .execute();
      const current = (await this.list(input.appId, 5)).some(
        (job) => job.status === 'running',
      );
      if (current)
        throw new JobError('RUNNING', 'A job is already running for this App.');
      const id = randomUUID();
      await conn()
        .query.insertInto(TABLE)
        .values({
          id,
          appId: input.appId,
          command: input.command.key,
          isWrite: input.command.write,
          actorType: input.actor.type,
          actorId: input.actor.id,
          status: 'running',
          startedAt: at,
          createdAt: at,
        })
        .execute();
      void this.finish(id, input.appId, input.command, channel);
      return get(input.appId, id);
    },

    async finish(
      id: string,
      appId: string,
      command: JobCommand,
      channel: Nb3Channel,
    ): Promise<void> {
      const answer = await channel.call({
        op: 'run',
        app: appId,
        argv: command.argv,
      });
      const ended = now();
      const timedOut = answer.ok && answer['timedOut'] === true;
      const status = !answer.ok
        ? answer.error === 'NOT_ALLOWED' || answer.error === 'UNKNOWN_APP'
          ? 'denied'
          : 'failed'
        : timedOut
          ? 'timeout'
          : answer['exitCode'] === 0
            ? 'succeeded'
            : 'failed';
      await conn()
        .query.updateTable(TABLE)
        .set({
          status,
          exitCode:
            typeof answer['exitCode'] === 'number' ? answer['exitCode'] : null,
          errorCode: answer.ok ? null : (answer.error ?? 'FAILED').slice(0, 40),
          logTail:
            typeof answer['log'] === 'string'
              ? answer['log']
              : (answer.message ?? null),
          logSha256:
            typeof answer['sha256'] === 'string' ? answer['sha256'] : null,
          durationMs:
            typeof answer['durationMs'] === 'number'
              ? answer['durationMs']
              : null,
          finishedAt: ended,
        })
        .where('id', '=', id)
        .execute();
    },
  };
}

export type Nb3JobsService = ReturnType<typeof createNb3JobsService>;
