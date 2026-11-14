/**
 * Routines (plan T, T6): work that comes back on a schedule. What a routine does at its time is decided here, as pure
 * functions, so each rule is tested without a database or a clock.
 */

export interface RoutineTemplate {
  readonly key:
    'nangTemplate' | 'licences' | 'backupRestore' | 'pendingLessons';
  readonly name: string;
  readonly playbookSlug: string | null;
  /** The issue's description (the playbook's `!slug` line is added in front when there is one). */
  readonly template: string;
  readonly cron: string;
}

/** Four ready-made routines. None runs until a person turns it on. */
export const ROUTINE_TEMPLATES: readonly RoutineTemplate[] = [
  {
    key: 'nangTemplate',
    name: 'Kiểm bản mẫu NocoBase 3 mới',
    playbookSlug: 'nang-template',
    template:
      'Xem bản mẫu ứng dụng NocoBase 3 có bản mới không và báo kết quả; chỉ nâng khi người duyệt.',
    cron: '0 8 * * 1',
  },
  {
    key: 'licences',
    name: 'Quét giấy phép thư viện',
    playbookSlug: null,
    template:
      'Chạy `pnpm licenses list --json` (liệt kê cả devDependencies, vì thư viện giao diện nằm ở đó) và báo thư viện nào theo GPL/AGPL/LGPL mà không có lựa chọn `OR` cho phép. Không sửa gì, chỉ báo.',
    cron: '0 9 1 * *',
  },
  {
    key: 'backupRestore',
    name: 'Thử khôi phục sao lưu',
    playbookSlug: null,
    template:
      'Chọn bản sao lưu mới nhất, khôi phục vào một CSDL tạm theo hướng dẫn trong docs, kiểm vài bảng quan trọng có dữ liệu, rồi xoá CSDL tạm và báo kết quả. Không đụng dữ liệu thật.',
    cron: '0 10 1 * *',
  },
  {
    key: 'pendingLessons',
    name: 'Rà bài học chờ duyệt',
    playbookSlug: null,
    template:
      'Liệt kê các bài học đang chờ duyệt, gộp những bài trùng ý và đề xuất duyệt hay bỏ từng bài. Quyết định cuối là của người.',
    cron: '0 9 * * 5',
  },
];

/** A hidden marker in the issue's description, so the next run can tell whether one of its issues is still open. */
export const routineMarker = (routineId: string): string =>
  `<!-- ds-routine:${routineId} -->`;

const FIELD_RANGES: readonly (readonly [number, number])[] = [
  [0, 59],
  [0, 23],
  [1, 31],
  [1, 12],
  [0, 7],
];

/** Five fields of numbers, lists, ranges and steps; names and macros are refused. */
export function isValidCron(expression: string): boolean {
  const fields = expression.trim().split(/\s+/u);
  if (fields.length !== 5) return false;
  return fields.every((field, index) => {
    const [min, max] = FIELD_RANGES[index];
    return field.split(',').every((part) => {
      const [range, step] = part.split('/');
      if (step !== undefined && !/^[1-9]\d*$/u.test(step)) return false;
      if (range === '*') return true;
      const bounds = range.split('-');
      if (bounds.length > 2) return false;
      return bounds.every(
        (value) =>
          /^\d+$/u.test(value) && Number(value) >= min && Number(value) <= max,
      );
    });
  });
}

export type RoutineSkip = 'alreadyOpen' | 'projectFull' | 'budget';

export function decideRoutineRun(input: {
  readonly openFromRoutine: boolean;
  readonly activeIssues: number;
  readonly maxActiveIssues: number | null;
  readonly budgetBlocked: boolean;
}): { run: true } | { run: false; reason: RoutineSkip } {
  if (input.openFromRoutine) return { run: false, reason: 'alreadyOpen' };
  if (
    input.maxActiveIssues !== null &&
    input.activeIssues >= input.maxActiveIssues
  )
    return { run: false, reason: 'projectFull' };
  if (input.budgetBlocked) return { run: false, reason: 'budget' };
  return { run: true };
}
