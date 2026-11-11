/** A project's Knowledge tab: the documents of its own knowledge space (the plugin checks every document's access). */
import { KnowledgeView } from '@nocobase/app-plugin-knowledge/client/pages';
import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { useKnowledgeDirectory } from '#hooks/use-knowledge-directory';

import { useProjectOutlet } from './shared.js';

export function ProjectKnowledgeTab(): ReactElement {
  const { t } = useTranslation();
  const { project } = useProjectOutlet();
  const directory = useKnowledgeDirectory();
  return (
    <section
      aria-label={t('projectDetail.tabs.knowledge')}
      className='h-[calc(100svh-16rem)] min-h-96'
    >
      <KnowledgeView
        space={{ scope: 'project', scopeId: project.id }}
        directory={directory}
        className='h-full'
        labels={{ inheritedHint: t('knowledge.inheritedHint') }}
      />
    </section>
  );
}
