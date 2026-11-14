// The release workflow, the build guard and the VPS fetch script (plan V, V6.3). No network, no real pnpm or gh: fakes on PATH.
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
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
const build = path.join(root, 'deploy/dokploy/build-release.sh');
const fetchScript = path.join(root, 'deploy/dokploy/release.sh');
const workflow = readFileSync(
  path.join(root, '.github/workflows/release.yml'),
  'utf8',
);

let folder = '';
let bin = '';
const fake = (name: string, body: string) => {
  const file = path.join(bin, name);
  writeFileSync(file, `#!/bin/sh\n${body}\n`);
  chmodSync(file, 0o755);
};
const sh = (
  script: string,
  args: string[],
  cwd: string,
  env: Record<string, string> = {},
) =>
  spawnSync('bash', [script, ...args], {
    cwd,
    encoding: 'utf8',
    env: { PATH: `${bin}:${process.env.PATH}`, HOME: folder, ...env },
  });
const git = (cwd: string, ...args: string[]) =>
  spawnSync('git', args, { cwd, encoding: 'utf8' });

beforeEach(() => {
  folder = mkdtempSync(path.join(tmpdir(), 'ds-release-'));
  bin = path.join(folder, 'bin');
  mkdirSync(bin);
});
afterEach(() => rmSync(folder, { recursive: true, force: true }));

describe('release workflow', () => {
  it('runs on version tags, builds for linux-x64 through the guarded script, and sends nothing to the VPS', () => {
    expect(workflow).toMatch(/tags:\s*\['v\*'\]/u);
    expect(workflow).toContain('deploy/dokploy/build-release.sh');
    expect(workflow).toContain('fetch-depth: 0');
    expect(workflow).not.toMatch(/\bssh\b|\bscp\b|rsync|id_rsa|SSH_KEY/u);
    expect(workflow).not.toMatch(/\becho\b/u);
    expect(workflow).not.toMatch(/secrets\./u);
    expect(workflow).toContain('contents: write');
  });

  it('the build script carries the linux-x64 build, the dist check and the archive rules', () => {
    const script = readFileSync(build, 'utf8');
    expect(script).toContain('pnpm build --target linux-x64 --node-version 24');
    expect(script).toContain('pnpm nocobase dist check');
    expect(script).toContain("--exclude='*/.bin' --exclude='dist/.env'");
  });
});

describe('build-release.sh guards', () => {
  function repo(): string {
    const origin = path.join(folder, 'origin.git');
    const work = path.join(folder, 'work');
    spawnSync('git', ['init', '-q', '--bare', '-b', 'main', origin]);
    spawnSync('git', ['clone', '-q', origin, work]);
    git(work, 'config', 'user.email', 't@example.test');
    git(work, 'config', 'user.name', 't');
    writeFileSync(path.join(work, 'config.example.yml'), 'app: {}\n');
    git(work, 'add', '.');
    git(work, 'commit', '-q', '-m', 'one');
    git(work, 'push', '-q', 'origin', 'HEAD:main');
    git(work, 'fetch', '-q', 'origin');
    fake(
      'pnpm',
      'echo "$*" >> "$PNPM_LOG"; case "$1" in build) mkdir -p dist; echo x > dist/a;; esac',
    );
    return work;
  }
  const env = () => ({ PNPM_LOG: path.join(folder, 'pnpm.log') });

  it('builds, checks and packs a clean commit that is on origin/main', () => {
    const work = repo();
    const result = sh(build, ['out'], work, env());
    expect(result.status).toBe(0);
    const log = readFileSync(env().PNPM_LOG, 'utf8');
    expect(log).toContain('build --target linux-x64 --node-version 24');
    expect(log).toContain('nocobase dist check');
    const files = readdirSync(path.join(work, 'out'));
    expect(files).toHaveLength(2);
    expect(files.some((f) => f.endsWith('.tar.gz.sha256'))).toBe(true);
  });

  it('refuses outside Linux, with uncommitted changes, and from a commit that is not on origin/main', () => {
    const work = repo();
    const mac = sh(build, ['out'], work, { ...env(), RELEASE_UNAME: 'Darwin' });
    expect(mac.status).not.toBe(0);
    expect(mac.stderr).toMatch(/Linux only/u);

    writeFileSync(path.join(work, 'dirty.txt'), 'x');
    const dirty = sh(build, ['out'], work, env());
    expect(dirty.status).not.toBe(0);
    expect(dirty.stderr).toMatch(/uncommitted/u);
    rmSync(path.join(work, 'dirty.txt'));

    writeFileSync(path.join(work, 'local.txt'), 'x');
    git(work, 'add', '.');
    git(work, 'commit', '-q', '-m', 'local only');
    const unpushed = sh(build, ['out'], work, env());
    expect(unpushed.status).not.toBe(0);
    expect(unpushed.stderr).toMatch(/not on origin\/main/u);
    expect(existsSync(env().PNPM_LOG)).toBe(false);
  });
});

describe('release.sh on the VPS', () => {
  const SHA = 'abc1234';
  function setup(corrupt = false) {
    const ROOT = path.join(folder, 'srv');
    const CODE = path.join(folder, 'code');
    mkdirSync(path.join(ROOT, 'releases'), { recursive: true });
    mkdirSync(CODE);
    writeFileSync(path.join(CODE, '.env'), 'STUDIO_RELEASE="oldest0"\n');
    // Four releases already there; the running one is the oldest.
    ['oldest0', 'older11', 'newer22', 'newest3'].forEach((name, index) => {
      const dir = path.join(ROOT, 'releases', name);
      mkdirSync(path.join(dir, 'dist'), { recursive: true });
      const at = new Date(Date.UTC(2026, 10, 1 + index));
      utimesSync(dir, at, at);
    });
    const payload = path.join(folder, 'payload');
    mkdirSync(path.join(payload, 'dist'), { recursive: true });
    writeFileSync(path.join(payload, 'dist', 'index.js'), 'x');
    const archive = path.join(folder, `studio-${SHA}.tar.gz`);
    spawnSync('tar', ['-czf', archive, '-C', payload, 'dist']);
    const sum = spawnSync('sha256sum', [`studio-${SHA}.tar.gz`], {
      cwd: folder,
      encoding: 'utf8',
    }).stdout;
    writeFileSync(
      `${archive}.sha256`,
      // Change the first hex digit to a different one. The digest depends on the tarball's mtime, so any fixed
      // replacement digit matches the real one in 1 of 16 runs and the "wrong checksum" case would flake.
      corrupt ? sum.replace(/^./u, (c) => (c === '0' ? '1' : '0')) : sum,
    );
    fake(
      'gh',
      `[ "$GH_TOKEN" = "read-only-token" ] || exit 9\nout=""; while [ $# -gt 0 ]; do [ "$1" = "-D" ] && out="$2"; shift; done\ncp "${archive}" "${archive}.sha256" "$out"/`,
    );
    const token = path.join(folder, 'token');
    writeFileSync(token, 'read-only-token\n');
    return {
      ROOT,
      env: {
        GH_TOKEN_FILE: token,
        STUDIO_ROOT: ROOT,
        STUDIO_CODE: CODE,
      },
    };
  }

  it('verifies the checksum, unpacks next to the others, keeps three and never the running one', () => {
    const { ROOT, env } = setup();
    const result = sh(fetchScript, ['v1.2.3'], folder, env);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`bash switch-release.sh ${SHA}`);
    expect(existsSync(path.join(ROOT, 'releases', SHA, 'dist/index.js'))).toBe(
      true,
    );
    const left = readdirSync(path.join(ROOT, 'releases')).sort();
    // The new one (newest), the running one (oldest0, kept although old), and the two newest of the rest.
    expect(left).toContain(SHA);
    expect(left).toContain('oldest0');
    expect(left).not.toContain('older11');
    expect(result.stdout + result.stderr).not.toContain('read-only-token');
  });

  it('stops with a non-zero exit when the checksum is wrong, and unpacks nothing', () => {
    const { ROOT, env } = setup(true);
    const result = sh(fetchScript, ['v1.2.3'], folder, env);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/SHA-256 does not match/u);
    expect(existsSync(path.join(ROOT, 'releases', SHA))).toBe(false);
    expect(readdirSync(path.join(ROOT, 'releases'))).toHaveLength(4);
  });

  it('refuses a tag that is not a version and a missing token file', () => {
    const { env } = setup();
    expect(sh(fetchScript, ['main; rm -rf /'], folder, env).status).not.toBe(0);
    expect(
      sh(fetchScript, ['v1.0.0'], folder, { ...env, GH_TOKEN_FILE: '/nope' })
        .status,
    ).not.toBe(0);
  });
});
