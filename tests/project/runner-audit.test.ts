import { spawn, spawnSync } from 'node:child_process';
import { createServer, type AddressInfo } from 'node:net';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// T8 (plan T): the audit says red when the runner's user reaches what it must not, and green when it does not.
const root = resolve(import.meta.dirname, '../..');
const script = join(root, 'deploy/runner/audit.sh');
const isRoot = process.getuid?.() === 0;

const audit = (env: Record<string, string>) =>
  spawnSync('bash', [script], {
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH ?? '',
      DS_AUDIT_SECRETS: '',
      DS_AUDIT_DOKPLOY: '',
      DS_AUDIT_DOCKER_SOCK: '',
      DS_AUDIT_EXEC_SOCK: '',
      DS_AUDIT_BACKUPS: '',
      // No address to try unless a test names one: a development machine has its own Postgres on loopback.
      DS_AUDIT_NET_HOSTS: '',
      ...env,
    },
  });

describe('deploy/runner/audit.sh', () => {
  it('is valid bash and makes no change', () => {
    expect(spawnSync('bash', ['-n', script]).status).toBe(0);
    expect(readFileSync(script, 'utf8')).not.toMatch(
      /\b(rm|chmod|chown|kill|systemctl)\b\s/u,
    );
  });

  it.skipIf(isRoot)('is green when nothing is reachable', () => {
    const dir = mkdtempSync(join(tmpdir(), 'audit-'));
    const hidden = join(dir, 'secret.yml');
    writeFileSync(hidden, 'x');
    chmodSync(hidden, 0o000);
    const result = audit({
      DS_AUDIT_SECRETS: `${hidden} ${join(dir, 'absent')}`,
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('OK');
  });

  it.skipIf(isRoot)(
    'is red for a readable secret, directory or backup, and names each without printing content',
    () => {
      const dir = mkdtempSync(join(tmpdir(), 'audit-'));
      const secret = join(dir, 'config.yml');
      writeFileSync(secret, 'password: hunter2');
      const dokploy = join(dir, 'dokploy');
      mkdirSync(dokploy);
      const backups = join(dir, 'backups');
      mkdirSync(backups);
      const result = audit({
        DS_AUDIT_SECRETS: secret,
        DS_AUDIT_DOKPLOY: dokploy,
        DS_AUDIT_BACKUPS: backups,
      });
      expect(result.status).toBe(1);
      expect(result.stdout).toContain('secrets');
      expect(result.stdout).toContain('dokploy');
      expect(result.stdout).toContain('backups');
      expect(result.stdout).not.toContain('hunter2');
    },
  );

  // S8 (plan S): a service on loopback or on the machine's own address is reachable by the runner, and the audit says so.
  const listening = async (): Promise<{
    port: number;
    sent: string[];
    close: () => void;
  }> => {
    const sent: string[] = [];
    const server = createServer((socket) => {
      socket.on('data', (chunk) => sent.push(String(chunk)));
    });
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    return {
      port: (server.address() as AddressInfo).port,
      sent,
      close: () => server.close(),
    };
  };
  const auditAsync = (env: Record<string, string>) =>
    new Promise<{ status: number | null; stdout: string }>((done) => {
      const child = spawn('bash', [script], {
        env: {
          PATH: process.env.PATH ?? '',
          DS_AUDIT_SECRETS: '',
          DS_AUDIT_DOKPLOY: '',
          DS_AUDIT_DOCKER_SOCK: '',
          DS_AUDIT_EXEC_SOCK: '',
          DS_AUDIT_BACKUPS: '',
          ...env,
        },
      });
      let stdout = '';
      child.stdout.on('data', (chunk) => (stdout += String(chunk)));
      child.on('close', (status) => done({ status, stdout }));
    });

  it.skipIf(isRoot)(
    'is red for a service that accepts a connection, names where, and sends it nothing',
    async () => {
      const service = await listening();
      try {
        const result = await auditAsync({
          DS_AUDIT_NET_HOSTS: '127.0.0.1',
          DS_AUDIT_NET_PORTS: `${service.port}:postgres`,
        });
        expect(result.status).toBe(1);
        expect(result.stdout).toContain('network');
        expect(result.stdout).toContain(`127.0.0.1:${service.port}`);
        expect(result.stdout).toContain('(postgres)');
        expect(service.sent).toEqual([]);
      } finally {
        service.close();
      }
    },
  );

  it.skipIf(isRoot)(
    'is green when nothing listens where it looks',
    async () => {
      const service = await listening();
      const port = service.port;
      service.close();
      const result = await auditAsync({
        DS_AUDIT_NET_HOSTS: '127.0.0.1',
        DS_AUDIT_NET_PORTS: `${port}:dokploy`,
      });
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('OK');
    },
  );

  it('refuses to run as root, where everything is readable', () => {
    if (!isRoot) return;
    expect(audit({}).status).toBe(2);
  });
});

describe('the drop-ins', () => {
  const read = (name: string) =>
    readFileSync(join(root, 'deploy/runner', name), 'utf8');

  it('keep the limits of the slice and add the early warning', () => {
    const slice = read('ds-runner-slice.conf');
    for (const line of [
      'MemoryHigh=2.0G',
      'MemoryMax=2.5G',
      'MemorySwapMax=512M',
      'CPUQuota=300%',
    ])
      expect(slice).toContain(line);
    expect(slice).toMatch(/IPAddressAllow=127\.0\.0\.0\/8 ::1/u);
    expect(slice).toMatch(
      /IPAddressDeny=.*10\.0\.0\.0\/8.*172\.16\.0\.0\/12.*192\.168\.0\.0\/16/u,
    );
  });

  it('harden the service without giving it more than it has', () => {
    const service = read('nocobase-runner-hardening.conf');
    for (const line of [
      'NoNewPrivileges=yes',
      'PrivateTmp=yes',
      'ProtectSystem=strict',
      'ReadWritePaths=%h',
    ])
      expect(service).toContain(line);
    expect(service).not.toMatch(/docker|sudo|CAP_/iu);
  });
});
