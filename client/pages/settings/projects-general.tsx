import { GeneralSettings } from '@nocobase/app-plugin-projects/client/config';
import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';

/**
 * The projects plugin's issue prefix setting, routed under the application's settings. The plugin's section brings
 * its own heading and form; the page supplies the container and the page title.
 */
export default function ProjectsGeneralSettingsPage(): ReactElement {
  const { t } = useTranslation();
  return (
    <PageContainer>
      <PageHeader
        title={t('projectSettings.generalTitle')}
        description={t('projectSettings.generalDescription')}
      />
      <GeneralSettings />
    </PageContainer>
  );
}
