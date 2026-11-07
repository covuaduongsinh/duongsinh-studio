import { describe, expect, it } from 'vitest';
import enUS from '../../server/locales/en-US.js';
import viVN from '../../server/locales/vi-VN.js';
import zhCN from '../../server/locales/zh-CN.js';
import { stepOf, type StepKey } from '../../server/progress/service.js';

const wordsOf =
  (steps: Record<StepKey, string>) => (key: StepKey, issue: string) =>
    steps[key].replace('{{issue}}', issue);

describe('stepOf', () => {
  const vi = wordsOf(viVN.studioProgress.steps);

  it('words the hand-overs Studio and the plugin write, by kind', () => {
    expect(stepOf('DS-7 is in progress: work on it.', vi)).toBe(
      'Bắt đầu làm DS-7.',
    );
    expect(
      stepOf('DS-7 was handed to you while in progress: work on it.', vi),
    ).toBe('Nhận DS-7 khi việc đang làm dở.');
    expect(stepOf('Nothing holds DS-7 any more: work on it.', vi)).toBe(
      'DS-7 hết vướng, làm tiếp.',
    );
    expect(stepOf('Retry the work of the previous run.', vi)).toBe(
      'Chạy lại phần việc của lượt trước.',
    );
  });

  it('keeps what a person wrote, from its first line, and nothing without text', () => {
    expect(stepOf('[@Coder](agent:a1)\n\n  Sửa nút lưu  \nchi tiết', vi)).toBe(
      'Sửa nút lưu',
    );
    expect(stepOf('DS-7 is in progress: work on it, quickly.', vi)).toBe(
      'DS-7 is in progress: work on it, quickly.',
    );
    expect(stepOf('DS-7 is in progress: work on it.')).toBe(
      'DS-7 is in progress: work on it.',
    );
    expect(stepOf('x'.repeat(300), vi)).toHaveLength(200);
    expect(stepOf('   \n', vi)).toBeNull();
    expect(stepOf(undefined, vi)).toBeNull();
  });

  it('has every step in every language', () => {
    const keys = Object.keys(enUS.studioProgress.steps).sort();
    expect(keys).toEqual(['entered', 'handed', 'retry', 'unblocked']);
    for (const steps of [viVN.studioProgress.steps, zhCN.studioProgress.steps])
      expect(Object.keys(steps).sort()).toEqual(keys);
  });
});
