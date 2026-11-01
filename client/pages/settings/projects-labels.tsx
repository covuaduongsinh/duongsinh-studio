import { LabelsSettings } from '@nocobase/app-plugin-projects/client/config';
import type { ReactElement } from 'react';

import { PageContainer } from '#components/page-container';

/** The projects plugin's shared issue labels, routed under the application's settings; the plugin's page brings its own header. */
export default function ProjectsLabelsSettingsPage(): ReactElement {
  return (
    <PageContainer>
      <LabelsSettings />
    </PageContainer>
  );
}
