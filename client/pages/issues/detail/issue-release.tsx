/**
 * Where an issue's work is (`server/routes/deploys.ts`): merged, in a version, on staging or on production. Shown only
 * once the issue was merged through a linked repository, as the page's other sections show nothing until they have
 * something to say.
 */
import { useTranslation } from '@nocobase/i18n/client';
import { PackageIcon } from 'lucide-react';
import type { ReactElement } from 'react';

import { IssueSection } from '#extensions/nocobase-issue-detail/issue-detail';
import { useIssueMarks } from '#hooks/use-releases';

import { WhereBadge } from '../../releases/index.js';

export function IssueRelease({ issueId }: { readonly issueId: string }): ReactElement | null {
  const { t, i18n } = useTranslation();
  const marks = useIssueMarks([issueId]);
  const mark = marks.data?.find((item) => item.issueId === issueId);
  if (!mark) return null;
  const at = mark.production?.at ?? mark.staging?.at ?? mark.mergedAt;
  return (
    <IssueSection icon={<PackageIcon />} title={t('releases.issue.title')}>
      <p className='flex flex-wrap items-center gap-2 text-sm'>
        <WhereBadge where={mark.where} />
        {mark.version ? <span className='font-mono'>{t('releases.issue.version', { tag: mark.version.tag })}</span> : null}
        {at ? (
          <time dateTime={at} className='text-muted-foreground'>
            {new Date(at).toLocaleString(i18n.language, { dateStyle: 'medium', timeStyle: 'short' })}
          </time>
        ) : null}
      </p>
    </IssueSection>
  );
}
