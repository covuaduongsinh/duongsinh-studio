import { canCreateIssues } from '@nocobase/app-plugin-projects/client/issues';
import {
  NewIssueButton,
  PmShortcuts,
  useViewer,
} from '@nocobase/app-plugin-projects/client/kit';
import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';
import { Outlet } from 'react-router';

import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';

import { IssueWorkspace } from './issue-workspace.js';

/**
 * `/issues`: every issue the viewer can see, as a list or a board. Its children are the projects plugin's "New issue"
 * dialog and plan page (`issueChildRoutes`) and the issue's own page, all rendered at the outlet.
 */
export default function IssuesPage(): ReactElement {
  const { t } = useTranslation();
  const viewer = useViewer();
  const canCreate = canCreateIssues(viewer);

  return (
    <PageContainer>
      <PageHeader
        title={t('issues.title')}
        description={t('issues.description')}
        actions={<NewIssueButton canCreate={canCreate} />}
      />
      {/* `C` opens New issue, ⌘K searches issues. */}
      <PmShortcuts canCreate={canCreate} />
      <IssueWorkspace page='issues' />
      <Outlet />
    </PageContainer>
  );
}
