// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { contextFrom, snippetOf } from '../../server/run-profile/excerpt.js';

// T11 (plan T): a run's log, searched, continued from a step, or turned into a lesson, never with a secret in it.
const events = [
  { seq: 1, type: 'message', content: 'Start the work.' },
  {
    seq: 2,
    type: 'tool',
    tool: 'bash',
    content: 'pnpm exec vitest run a',
    output: 'FAIL a.test.ts',
  },
  {
    seq: 3,
    type: 'message',
    content: 'token ghp_' + 'a'.repeat(36) + ' was printed',
  },
  { seq: 4, type: 'message', content: 'Fixing it.' },
];

describe('snippetOf', () => {
  it('cuts a window around the match', () => {
    const text = 'x'.repeat(300) + ' NEEDLE ' + 'y'.repeat(300);
    const snippet = snippetOf(text, 'needle', 40);
    expect(snippet).toContain('NEEDLE');
    expect(snippet.length).toBeLessThan(120);
    expect(snippet.startsWith('…')).toBe(true);
  });
  it('masks a secret even when it is the match', () => {
    const snippet = snippetOf(
      'token ghp_' + 'a'.repeat(36) + ' here',
      'token',
      80,
    );
    expect(snippet).not.toContain('ghp_');
  });
});

describe('contextFrom', () => {
  it('carries the events up to the chosen step, newest last, without any secret', () => {
    const text = contextFrom(events, 3, 10);
    expect(text).toContain('Start the work.');
    expect(text).toContain('FAIL a.test.ts');
    expect(text).not.toContain('Fixing it.');
    expect(text).not.toContain('ghp_');
  });
  it('keeps only the last few events of a long log', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      seq: i + 1,
      type: 'message',
      content: `event ${i + 1}`,
    }));
    const text = contextFrom(many, 30, 5);
    expect(text).toContain('event 30');
    expect(text).toContain('event 26');
    expect(text).not.toContain('event 25\n');
  });
});
