/**
 * What a job may run in a NocoBase 3 App (plan V, V4). Studio names the commands; the daemon holds the real allowlist per
 * App, so a name here that the daemon does not list is refused there too. A command that changes data (`write`) is for the
 * owner only (Q8); the dry run of the Lark import is the one an agent may start.
 */
export interface JobCommand {
  readonly key: string;
  readonly argv: readonly string[];
  readonly write: boolean;
}

export const JOB_COMMANDS: readonly JobCommand[] = [
  { key: 'dbApply', argv: ['db', 'apply'], write: true },
  {
    key: 'larkImportDry',
    argv: ['edu', 'import-lark', '--dry-run'],
    write: false,
  },
  {
    key: 'larkImportCommit',
    argv: ['edu', 'import-lark', '--commit'],
    write: true,
  },
];

export const JOB_COMMAND_KEYS = JOB_COMMANDS.map((item) => item.key) as [
  string,
  ...string[],
];

export const commandOf = (key: string): JobCommand | undefined =>
  JOB_COMMANDS.find((item) => item.key === key);

/** Logs are kept this long (plan V, V4.3). */
export const JOB_LOG_DAYS = 14;
/** A job still "running" this long after it started lost its Studio (restart); it is shown as timed out. */
export const JOB_STALE_MINUTES = 20;
