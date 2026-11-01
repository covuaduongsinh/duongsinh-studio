import {
  canCreateIssues,
  myIssueFilters,
} from '@nocobase/app-plugin-projects/client/issues';
import {
  NewIssueButton,
  PmShortcuts,
  useViewer,
} from '@nocobase/app-plugin-projects/client/kit';
import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { Loading } from '#components/loading';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';

import { IssueWorkspace } from '../issues/issue-workspace.js';

/** `/my-issues`: the issues the viewer owns or executes, each once, as a list or a board. */
export default function MyIssuesPage(): ReactElement {
  const { t } = useTranslation();
  const viewer = useViewer();
  const canCreate = canCreateIssues(viewer);
  const mine = viewer ? myIssueFilters(viewer.userId) : null;

  return (
    <PageContainer>
      <PageHeader
        title={t('issues.myTitle')}
        description={t('issues.myDescription')}
        // "New issue" opens over the issue list, the dialog's home.
        actions={<NewIssueButton canCreate={canCreate} absolute />}
      />
      <PmShortcuts canCreate={canCreate} />
      {mine ? (
        <IssueWorkspace
          page='my-issues'
          fixedFilters={mine.fixedFilters}
          hiddenFilters={mine.hiddenFilters}
        />
      ) : (
        <Loading />
      )}
    </PageContainer>
  );
}
