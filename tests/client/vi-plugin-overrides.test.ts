// The Vietnamese wording the application gives the plugins' pages (docs/thuat-ngu.md): the plugins ship machine
// translations ("Mã thông báo" for tokens, "nhiệm vụ" for issues, "đặc vụ" for agents) that P8 replaced.
import { describe, expect, it } from 'vitest';

import overrides from '../../client/locales/overrides/vi-VN.js';

const at = (root: unknown, path: string): unknown =>
  path
    .split('.')
    .reduce<unknown>(
      (value, key) => (value as Record<string, unknown> | undefined)?.[key],
      root,
    );

describe('Vietnamese plugin overrides', () => {
  it('says Token, not "Mã thông báo", on the Usage page and in transcripts', () => {
    const agents = overrides['@nocobase/app-plugin-agents'];
    expect(at(agents, 'usage.chart.tokens')).toBe('Token');
    expect(at(agents, 'transcript.tokens')).toContain('Token');
    expect(at(agents, 'prices.section.description')).toContain('token');
  });

  it('keeps what was overridden before the additions were merged in', () => {
    const agents = overrides['@nocobase/app-plugin-agents'];
    expect(at(agents, 'agents.fromRunners')).toBe('Agent từ runner');
    expect(at(agents, 'usage.groups.agent')).toBe('Agent');
  });

  it('names the plugin’s own-computer sessions for what they are, apart from My sessions', () => {
    const sessions = overrides['@nocobase/app-plugin-agent-sessions'];
    expect(at(sessions, 'navigation.agentSessions')).toBe('Agent trên máy tôi');
    expect(at(sessions, 'list.title')).toBe('Agent trên máy tôi');
  });

  it('calls an issue "công việc" in the sessions plugin and the projects plan', () => {
    expect(
      at(overrides['@nocobase/app-plugin-agent-sessions'], 'links.count_other'),
    ).toBe('{{count}} công việc');
    expect(
      (
        at(overrides['@nocobase/app-plugin-projects'], 'plans.ops') as Record<
          string,
          string
        >
      )['issue.retract'],
    ).toBe('Xoá công việc');
  });
});

/** Every string value of a nested locale object. */
function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (typeof value === 'object' && value !== null)
    return Object.values(value).flatMap(strings);
  return [];
}

describe('Vietnamese wording (V6.2)', () => {
  const banned = [
    'đặc vụ',
    'Đại tướng',
    'Chia tay',
    'Chờ em',
    'thi hành',
    'Khai mạc',
    'thiết bị đầu cuối',
    'Cây cầu',
  ];

  it('keeps the machine-translated words out of the plugin overrides', () => {
    const text = strings(overrides).join('\n');
    expect(banned.filter((word) => text.includes(word))).toEqual([]);
  });

  it('words the issue-creation tabs for what they do', () => {
    const tabs = at(
      overrides['@nocobase/app-plugin-projects'],
      'newIssue.tabs',
    ) as Record<string, string>;
    expect(tabs.manual).toBe('Một công việc');
    expect(tabs.ai).toBe('Tách thành nhiều công việc');
  });

  it('uses one set of words for the states of an issue, and one spelling of Huỷ and Xoá', async () => {
    const { default: studio } = await import('../../client/locales/vi-VN.js');
    const groups = at(studio, 'issues.groups') as Record<string, string>;
    expect(groups).toMatchObject({
      inProgress: 'Đang làm',
      backlog: 'Chờ làm',
      done: 'Xong',
      inReview: 'Chờ nghiệm thu',
      blocked: 'Đang vướng',
    });
    expect(at(studio, 'followUps.group')).toMatchObject({
      in_review: 'Chờ nghiệm thu',
      blocked: 'Đang vướng',
      in_progress: 'Đang làm',
      backlog: 'Chờ làm',
    });
    expect(at(studio, 'studioCriteria.cancel')).toBe('Huỷ');
    expect(at(studio, 'studioCriteria.delete')).toBe('Xoá');
    expect(at(studio, 'bench.forceRunConfirm')).toBe('Chạy vượt hạn mức');
    expect(at(studio, 'lessons.target')).toBe('Áp dụng vào');
  });
});
