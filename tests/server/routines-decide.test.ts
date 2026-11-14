// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  ROUTINE_TEMPLATES,
  decideRoutineRun,
  isValidCron,
  routineMarker,
} from '../../server/routines/decide.js';

// T6 (plan T): a routine opens work only when nothing of it is open, the project has room and the budget allows.
describe('decideRoutineRun', () => {
  const base = {
    openFromRoutine: false,
    activeIssues: 1,
    maxActiveIssues: 3,
    budgetBlocked: false,
  };
  it('runs when nothing blocks it', () => {
    expect(decideRoutineRun(base)).toEqual({ run: true });
    expect(decideRoutineRun({ ...base, maxActiveIssues: null })).toEqual({
      run: true,
    });
  });
  it('does not open a second issue while one of the routine is still open', () => {
    expect(decideRoutineRun({ ...base, openFromRoutine: true })).toEqual({
      run: false,
      reason: 'alreadyOpen',
    });
  });
  it('respects the project’s limit of active issues', () => {
    expect(decideRoutineRun({ ...base, activeIssues: 3 })).toEqual({
      run: false,
      reason: 'projectFull',
    });
  });
  it('respects a budget that holds work back', () => {
    expect(decideRoutineRun({ ...base, budgetBlocked: true })).toEqual({
      run: false,
      reason: 'budget',
    });
  });
});

describe('routineMarker', () => {
  it('is a comment a person does not see and the routine can find', () => {
    expect(routineMarker('r1')).toBe('<!-- ds-routine:r1 -->');
  });
});

describe('isValidCron', () => {
  it('takes five fields of numbers, lists, ranges and steps', () => {
    for (const ok of [
      '0 3 * * 1',
      '*/15 * * * *',
      '0 9,17 * * 1-5',
      '30 2 1 * *',
    ])
      expect(isValidCron(ok)).toBe(true);
  });
  it('refuses anything else', () => {
    for (const bad of [
      '',
      '* * * *',
      '0 3 * * 1 *',
      'every day',
      '0 3 * * $(x)',
      '61 * * * *',
    ])
      expect(isValidCron(bad)).toBe(false);
  });
});

describe('ROUTINE_TEMPLATES', () => {
  it('has the four templates, each off until someone turns it on, and the licence scan has no --prod', () => {
    expect(ROUTINE_TEMPLATES.map((t) => t.key)).toEqual([
      'nangTemplate',
      'licences',
      'backupRestore',
      'pendingLessons',
    ]);
    expect(ROUTINE_TEMPLATES.every((t) => isValidCron(t.cron))).toBe(true);
    expect(
      ROUTINE_TEMPLATES.find((t) => t.key === 'nangTemplate')!.playbookSlug,
    ).toBe('nang-template');
    const licences = ROUTINE_TEMPLATES.find((t) => t.key === 'licences')!;
    expect(licences.template).toContain('pnpm licenses list');
    expect(licences.template).not.toContain('--prod');
  });
});
