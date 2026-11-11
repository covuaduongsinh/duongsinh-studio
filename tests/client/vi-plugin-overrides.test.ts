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
