/**
 * Routines (plan T, T6): work that comes back on a schedule. What a routine does at its time is decided here, as pure
 * functions, so each rule is tested without a database or a clock.
 */

/** What a routine does when it is not an issue for an agent: the daemon's job Studio runs itself (plan S, S7). */
export type RoutineJob = 'backupDump';

export interface RoutineTemplate {
  readonly key:
    'nangTemplate' | 'licences' | 'backupRestore' | 'pendingLessons';
  readonly name: string;
  readonly playbookSlug: string | null;
  /** The issue's description (the playbook's `!slug` line is added in front when there is one). */
  readonly template: string;
  readonly cron: string;
  /** Set for a routine the daemon runs, which opens no issue and wakes no agent. */
  readonly job: RoutineJob | null;
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
    job: null,
  },
  {
    key: 'licences',
    name: 'Quét giấy phép thư viện',
    playbookSlug: null,
    template:
      'Chạy `pnpm licenses list --json` (liệt kê cả devDependencies, vì thư viện giao diện nằm ở đó) và báo thư viện nào theo GPL/AGPL/LGPL mà không có lựa chọn `OR` cho phép. Không sửa gì, chỉ báo.',
    cron: '0 9 1 * *',
    job: null,
  },
  {
    key: 'backupRestore',
    name: 'Thử khôi phục sao lưu',
    playbookSlug: null,
    template:
      'Chạy qua daemon, không giao cho agent: tạo bản dump mới của CSDL mỗi App NocoBase 3 của dự án và đọc lại danh mục của nó bằng pg_restore để chắc rằng bản dump dùng được. Chưa khôi phục vào CSDL tạm.',
    cron: '0 10 1 * *',
    job: 'backupDump',
  },
  {
    key: 'pendingLessons',
    name: 'Rà bài học chờ duyệt',
    playbookSlug: null,
    template:
      'Liệt kê các bài học đang chờ duyệt, gộp những bài trùng ý và đề xuất duyệt hay bỏ từng bài. Quyết định cuối là của người.',
    cron: '0 9 * * 5',
    job: null,
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
