import { describe, expect, it } from 'vitest';
import { stepOf } from '../../server/progress/service.js';

describe('stepOf', () => {
  it('shows the system hand-overs in Vietnamese', () => {
    expect(stepOf('DS-24 is in progress: work on it.')).toBe(
      'DS-24 đang thực hiện: hãy làm việc này.',
    );
    expect(
      stepOf('DS-24 was handed to you while in progress: work on it.'),
    ).toBe('DS-24 được giao cho bạn khi đang thực hiện: hãy làm việc này.');
    expect(stepOf('Nothing holds DS-24 any more: work on it.')).toBe(
      'Không còn gì chặn DS-24: hãy làm việc này.',
    );
    expect(stepOf('Retry the work of the previous run.')).toBe(
      'Thử lại việc của lượt chạy trước.',
    );
  });

  it('keeps a person’s own words and skips mentions', () => {
    expect(stepOf('[@Agent]\n\nLàm giúp phần B')).toBe('Làm giúp phần B');
    expect(stepOf(null)).toBeNull();
  });
});
