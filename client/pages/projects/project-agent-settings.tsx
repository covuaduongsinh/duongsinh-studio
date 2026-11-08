/**
 * A project's agent settings: environment variables and skills that only the runs in this project receive, on top of the
 * global ones. They are the plugin's own sections on the `project` scope Studio registers
 * (`server/providers/project-defaults.ts`); the server decides again who may read or change them, values are write-only,
 * and revealing one is recorded in the scope's access log. Only people who manage the project see the section at all, so
 * even the names of its secrets stay with them.
 */
import {
  DefaultSkillsSection,
  VariablesSection,
} from '@nocobase/app-plugin-agents/client/kit';
import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { ProjectSection } from '#extensions/nocobase-project-detail/project-detail';

/** `PROJECT_SCOPE` of `server/agents/ids.ts`, which client code cannot import. */
const PROJECT_SCOPE = 'project';

export function ProjectAgentSettings({
  projectId,
  canManage,
}: {
  readonly projectId: string;
  readonly canManage: boolean;
}): ReactElement | null {
  const { t } = useTranslation();
  if (!canManage) return null;
  return (
    <ProjectSection
      title={t('projectAgentSettings.title')}
      description={t('projectAgentSettings.description')}
    >
      <div className='flex flex-col gap-6'>
        <VariablesSection
          scope={PROJECT_SCOPE}
          scopeId={projectId}
          canEdit
          description={t('projectAgentSettings.variables')}
        />
        <DefaultSkillsSection
          scope={PROJECT_SCOPE}
          scopeId={projectId}
          canEdit
          description={t('projectAgentSettings.skills')}
        />
      </div>
    </ProjectSection>
  );
}
