// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  comparisonText,
  pickTwoProviders,
} from '../../server/approaches/pick.js';

// T12 (plan T): two approaches come from two agents of different providers, and one is chosen with a reason.
const agent = (id: string, tool: string | null, status = 'enabled') => ({
  id,
  tool,
  status,
  name: id,
});

describe('pickTwoProviders', () => {
  it('takes the first agent of each of two different tools', () => {
    const picked = pickTwoProviders([
      agent('a1', 'claude'),
      agent('a2', 'claude'),
      agent('b1', 'codex'),
    ]);
    expect(picked?.map((a) => a.id)).toEqual(['a1', 'b1']);
  });
  it('is null when everything is one provider or an agent has no tool', () => {
    expect(
      pickTwoProviders([agent('a1', 'claude'), agent('a2', 'claude')]),
    ).toBeNull();
    expect(
      pickTwoProviders([agent('a1', null), agent('b1', 'codex')]),
    ).toBeNull();
    expect(pickTwoProviders([])).toBeNull();
  });
  it('keeps out the agent that holds the issue, so the chooser is not also a writer', () => {
    const picked = pickTwoProviders(
      [agent('pm', 'claude'), agent('a1', 'claude'), agent('b1', 'codex')],
      'pm',
    );
    expect(picked?.map((a) => a.id)).toEqual(['a1', 'b1']);
  });
});

describe('comparisonText', () => {
  it('asks the chooser to compare both and to write the reason', () => {
    const text = comparisonText([
      { agentName: 'Claude', runId: 'r1' },
      { agentName: 'Codex', runId: 'r2' },
    ]);
    expect(text).toContain('Claude');
    expect(text).toContain('Codex');
    expect(text).toMatch(/lý do/u);
  });
});
