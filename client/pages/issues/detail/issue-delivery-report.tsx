/**
 * The delivery report of an issue handed over for acceptance: the markdown the agent wrote into `issue.acceptance`
 * (Result, Evidence), with the screenshots it attached to its comments under it.
 */
import { useTranslation } from '@nocobase/i18n/client';
import { ListChecksIcon } from 'lucide-react';
import type { ReactElement } from 'react';

import { MarkdownView } from '#components/markdown-view';
import { IssueSection } from '#extensions/nocobase-issue-detail/issue-detail';
import { useIssueScreenshots } from '#hooks/use-issue-screenshots';

export function IssueDeliveryReport({
  issueId,
  acceptance,
}: {
  readonly issueId: string;
  readonly acceptance: string | null;
}): ReactElement | null {
  const { t } = useTranslation();
  const shots = useIssueScreenshots(issueId, Boolean(acceptance));
  if (!acceptance) return null;
  const images = (shots.data ?? []).filter((shot) =>
    shot.mimeType.startsWith('image/'),
  );
  return (
    <IssueSection
      icon={<ListChecksIcon />}
      title={t('issueDetail.deliveryReport')}
    >
      {/* A long report scrolls inside its card, so the tabs below it stay in reach. */}
      <div className='max-h-96 overflow-y-auto'>
        <MarkdownView content={acceptance} />
      </div>
      {images.length > 0 ? (
        <ul
          className='flex flex-wrap gap-2'
          aria-label={t('issueDetail.screenshots')}
        >
          {images.map((shot) => (
            <li key={shot.id}>
              <a href={shot.contentUrl} target='_blank' rel='noreferrer'>
                <img
                  src={shot.contentUrl}
                  alt={shot.filename}
                  loading='lazy'
                  className='h-24 w-auto rounded-md border object-cover'
                />
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </IssueSection>
  );
}
