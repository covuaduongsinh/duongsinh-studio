/**
 * The issue's NocoBase 2 preview (S5.6): shown once a pull request of the issue labelled `preview` has one, with its
 * link, the generated sign-in for whoever may edit the issue, and retry / take down.
 */
import { useTranslation } from '@nocobase/i18n/client';
import { MonitorIcon } from 'lucide-react';
import type { ReactElement } from 'react';

import { IssueSection } from '#extensions/nocobase-issue-detail/issue-detail';
import { usePreviews } from '#hooks/use-releases';

import { PreviewCard } from '../../releases/previews.js';

export function IssuePreview({ issueId }: { readonly issueId: string }): ReactElement | null {
  const { t } = useTranslation();
  const previews = usePreviews(issueId);
  const preview = previews.data?.find((item) => item.slot === 'preview' && item.status !== 'destroyed');
  if (!preview) return null;
  return (
    <IssueSection icon={<MonitorIcon />} title={t('releases.preview.title', { number: preview.pullNumber ?? '' })}>
      <PreviewCard preview={preview} />
    </IssueSection>
  );
}
