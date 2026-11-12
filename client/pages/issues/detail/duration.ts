import type { useTranslation } from '@nocobase/i18n/client';

export type Translate = ReturnType<typeof useTranslation>['t'];

/** "4 min 12 s": seconds under a minute, minutes and seconds under an hour, else hours and minutes. */
export function durationText(t: Translate, milliseconds: number): string {
  const total = Math.max(0, Math.round(milliseconds / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0)
    return t('issueWork.runs.duration.hours', { h: hours, m: minutes });
  if (minutes > 0)
    return t('issueWork.runs.duration.minutes', { m: minutes, s: seconds });
  return t('issueWork.runs.duration.seconds', { s: seconds });
}
