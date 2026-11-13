import { describe, expect, it } from 'vitest';
import { parsePlaybookInvocations } from '../../server/playbooks/parser.js';

describe('playbook syntax parser', () => {
  it('parses simple !slug invocation', () => {
    const text = 'Xin hãy áp dụng !nang-template cho việc này';
    const result = parsePlaybookInvocations(text);
    expect(result).toHaveLength(1);
    expect(result[0]!.slug).toBe('nang-template');
    expect(result[0]!.params).toEqual({});
  });

  it('parses !slug with key=value parameters', () => {
    const text = '!nang-template version=beta.89 dryRun=false';
    const result = parsePlaybookInvocations(text);
    expect(result).toHaveLength(1);
    expect(result[0]!.slug).toBe('nang-template');
    expect(result[0]!.params).toEqual({
      version: 'beta.89',
      dryRun: 'false',
    });
  });

  it('parses quoted values with spaces', () => {
    const text = '!tao-app-nocobase name="App Duong Sinh" port=3001';
    const result = parsePlaybookInvocations(text);
    expect(result).toHaveLength(1);
    expect(result[0]!.slug).toBe('tao-app-nocobase');
    expect(result[0]!.params).toEqual({
      name: 'App Duong Sinh',
      port: '3001',
    });
  });

  it('parses the App registration playbook with its repository and App', () => {
    const result = parsePlaybookInvocations(
      '!noi-app-nb3 repo=covuaduongsinh/nocolms app=nocolms-preview role=preview',
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.slug).toBe('noi-app-nb3');
    expect(result[0]!.params).toEqual({
      repo: 'covuaduongsinh/nocolms',
      app: 'nocolms-preview',
      role: 'preview',
    });
  });

  it('parses multiple playbook invocations across lines', () => {
    const text = `
    Đầu tiên chạy !nhap-lark table="Customers" dryRun=true
    Sau đó chạy !deploy-dokploy environment=staging
    `;
    const result = parsePlaybookInvocations(text);
    expect(result).toHaveLength(2);
    expect(result[0]!.slug).toBe('nhap-lark');
    expect(result[0]!.params).toEqual({
      table: 'Customers',
      dryRun: 'true',
    });
    expect(result[1]!.slug).toBe('deploy-dokploy');
    expect(result[1]!.params).toEqual({
      environment: 'staging',
    });
  });

  it('returns empty array when no playbook syntax is present', () => {
    const text = 'Chỉ là bình luận thông thường không có lệnh nào';
    expect(parsePlaybookInvocations(text)).toEqual([]);
  });
});
