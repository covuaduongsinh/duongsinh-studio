// deploy/dokploy/backup-nb3.sh over a fake `docker`: which apps it backs up, how, what it keeps and what a failure does (V5.2).
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '../..');
const script = path.join(root, 'deploy/dokploy/backup-nb3.sh');
const fakeBin = path.join(root, 'tests/fixtures/fake-docker');

let folder = '';
let log = '';

const PG = 'c-pg|proj-pg|nb3-pgapp-app';
const LITE = 'c-lite|proj-lite|nb3-liteapp-app';
const OTHER = 'c-studio|duongsinh-studio-tluxoy|app';

function run(env: Record<string, string> = {}) {
  return spawnSync('sh', [script], {
    encoding: 'utf8',
    env: {
      PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
      BACKUP_ROOT: folder,
      BACKUP_DAY: '20261112-0300',
      FAKE_DOCKER_LOG: log,
      FAKE_APPS: [PG, LITE, OTHER].join('\n'),
      ...env,
    },
  });
}
const dest = () => path.join(folder, 'backups/nb3');
const files = () => (existsSync(dest()) ? readdirSync(dest()).sort() : []);

beforeEach(() => {
  folder = mkdtempSync(path.join(tmpdir(), 'ds-nb3-backup-'));
  log = path.join(folder, 'docker.log');
  writeFileSync(log, '');
});
afterEach(() => rmSync(folder, { recursive: true, force: true }));

describe('backup-nb3.sh', () => {
  it('dumps a PostgreSQL app, copies a SQLite one safely, archives the uploads of both, and leaves other projects alone', () => {
    const result = run();
    expect(result.status).toBe(0);
    expect(files()).toEqual([
      'liteapp-20261112-0300.sqlite',
      'liteapp-20261112-0300.storage.tar.gz',
      'pgapp-20261112-0300.dump',
      'pgapp-20261112-0300.storage.tar.gz',
    ]);
    expect(
      readFileSync(path.join(dest(), 'pgapp-20261112-0300.dump'), 'utf8'),
    ).toContain('pgdump-bytes');
    expect(
      readFileSync(path.join(dest(), 'liteapp-20261112-0300.sqlite'), 'utf8'),
    ).toContain('sqlite-bytes');
    const calls = readFileSync(log, 'utf8');
    // Never touches the Studio's own project, and never prints environment values.
    expect(calls).not.toContain('c-studio');
    expect(calls).toContain('pg_dump -U app_user -d app_db -Fc');
    expect(calls).not.toMatch(
      /printenv (POSTGRES_PASSWORD|DB_PASSWORD|SECRETS_KEYS)/u,
    );
  });

  it('writes the backups readable by the owner only', () => {
    run();
    const mode = spawnSync(
      'stat',
      ['-c', '%a', path.join(dest(), 'pgapp-20261112-0300.dump')],
      { encoding: 'utf8' },
    );
    expect(mode.stdout.trim()).toBe('600');
  });

  it('keeps the last 14 of each kind per app and removes older ones', () => {
    mkdirSync(dest(), { recursive: true });
    for (let day = 1; day <= 16; day += 1) {
      const name = `pgapp-202611${String(day).padStart(2, '0')}-0300.dump`;
      writeFileSync(path.join(dest(), name), 'old');
      const when = new Date(Date.UTC(2026, 10, day));
      utimesSync(path.join(dest(), name), when, when);
    }
    expect(run().status).toBe(0);
    const dumps = files().filter(
      (name) => name.startsWith('pgapp-') && name.endsWith('.dump'),
    );
    expect(dumps).toHaveLength(14);
    expect(dumps).toContain('pgapp-20261112-0300.dump');
    expect(dumps).not.toContain('pgapp-20261101-0300.dump');
  });

  it('does not keep a dump that has no table data, and exits non-zero', () => {
    const result = run({ FAKE_EMPTY_DUMP: '1' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'pgapp: pg_dump failed or has no table data',
    );
    expect(files().filter((name) => name.endsWith('.dump'))).toEqual([]);
    expect(files().some((name) => name.endsWith('.tmp'))).toBe(false);
    // The other app was still backed up.
    expect(files()).toContain('liteapp-20261112-0300.sqlite');
  });

  it('reports a failed SQLite copy without leaving a partial file', () => {
    const result = run({ FAKE_SQLITE_FAIL: '1' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('liteapp: sqlite backup failed');
    expect(files().some((name) => name.endsWith('.sqlite'))).toBe(false);
    expect(files()).toContain('pgapp-20261112-0300.dump');
  });

  it('succeeds with nothing to do when no NB3 app runs', () => {
    const result = run({ FAKE_APPS: OTHER });
    expect(result.status).toBe(0);
    expect(files()).toEqual([]);
  });
});
