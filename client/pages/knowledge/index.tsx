/**
 * `/knowledge`: the knowledge plugin's view over every space the viewer may read (the shared system space and the
 * spaces of the projects they see), listed and searched through Studio's authorized directory
 * (`server/routes/kb.ts`, `/api/knowledgeDirectory`). The plugin itself checks every document's access.
 */
import { KnowledgeView } from '@nocobase/app-plugin-knowledge/client/pages';
import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import {
  SYSTEM_SPACE,
  useKnowledgeDirectory,
} from '#hooks/use-knowledge-directory';

export default function KnowledgePage(): ReactElement {
  const { t } = useTranslation();
  const directory = useKnowledgeDirectory();
  return (
    <section
      aria-labelledby='knowledge-title'
      className='h-[calc(100svh-4rem)] min-h-96 p-4 md:p-6'
    >
      <KnowledgeView
        space={SYSTEM_SPACE}
        directory={directory}
        className='h-full'
        labels={{ inheritedHint: t('knowledge.inheritedHint') }}
        title={
          <h1
            id='knowledge-title'
            className='truncate font-heading text-lg font-semibold'
          >
            {t('knowledge.title')}
          </h1>
        }
      />
    </section>
  );
}
