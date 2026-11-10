import { useIssueDetail } from '@nocobase/app-plugin-projects/client/issues';
import {
  pmKeys,
  PmDetailSkeleton,
} from '@nocobase/app-plugin-projects/client/kit';
import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon } from 'lucide-react';
import type { ReactElement } from 'react';

import { IssueDetailView } from './detail/index.js';

/** The right pane of the split view: the issue's own detail, read by the id kept in the URL. */
export function SplitDetailPane({
  issueId,
}: {
  readonly issueId: string;
}): ReactElement {
  const { t } = useTranslation();
  const query = useIssueDetail(issueId);

  if (query.data) {
    return (
      <div className='p-4 md:p-6'>
        <IssueDetailView
          detail={query.data}
          detailKey={pmKeys.issue(issueId)}
          embedded
        />
      </div>
    );
  }

  if (query.error) {
    return (
      <div className='p-6 text-center text-sm text-destructive'>
        <AlertCircleIcon className='mx-auto mb-2 size-6' />
        {t('issueDetail.loadFailed')}
      </div>
    );
  }

  return (
    <div className='p-6'>
      <PmDetailSkeleton />
    </div>
  );
}
