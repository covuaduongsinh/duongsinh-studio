import { describe, expect, it } from 'vitest';

import enUS from '../../client/locales/en-US.js';
import zhCN from '../../client/locales/zh-CN.js';
import {
  conversationPath,
  conversationPlansQuery,
  PLAN_DECIDED_NEWS,
  studioNewsText,
} from '../../client/lib/studio-chat.js';

describe('Studio chat helpers', () => {
  it('opens a conversation as a page and lists the plans its agent proposed', () => {
    expect(conversationPath('c 1')).toBe('/chat/c%201');
    expect(conversationPlansQuery('c-1')).toEqual({
      sourceKind: 'conversation',
      sourceKey: 'conversation:c-1',
      limit: 20,
    });
  });

  it('words the plan decisions it delivers, and leaves other news to the plugin', () => {
    const asked: [string, Record<string, unknown> | undefined][] = [];
    const t = (key: string, options?: Record<string, unknown>) => {
      asked.push([key, options]);
      return `${key}|${String(options?.title)}`;
    };
    expect(
      studioNewsText(
        {
          type: PLAN_DECIDED_NEWS,
          title: 'Plan "X" executed',
          params: { outcome: 'executed', title: 'X', planId: 'p' },
        },
        t,
      ),
    ).toBe('studioChat.planDecided.executed|X');
    expect(
      studioNewsText(
        { type: PLAN_DECIDED_NEWS, title: 'x', params: { outcome: 'other' } },
        t,
      ),
    ).toBeNull();
    expect(studioNewsText({ type: 'other', title: 'x' }, t)).toBeNull();
    expect(asked).toHaveLength(1);
  });

  it('has the Ask agent wording in both languages', () => {
    for (const locale of [enUS, zhCN]) {
      expect(locale.studioChat.askIssue).toBeTruthy();
      expect(locale.studioChat.askIssueDraft).toContain('{{issue}}');
      expect(locale.studioChat.askProjectDraft).toBeTruthy();
      expect(Object.keys(locale.studioChat.planDecided).sort()).toEqual([
        'executed',
        'failed',
        'stale',
        'undone',
        'voided',
      ]);
    }
  });
});
