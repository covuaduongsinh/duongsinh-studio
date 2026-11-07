/** A project's way to what is kept elsewhere: its knowledge, its memory and its releases. */
import { KnowledgeView } from '@nocobase/app-plugin-knowledge/client/pages';
import { useTranslation } from '@nocobase/i18n/client';
import { useState, type ReactElement } from 'react';
import { Link } from 'react-router';

import { Button } from '#components/ui/button';
import { ProjectSection } from '#extensions/nocobase-project-detail/project-detail';

export function ProjectLinks({
  projectId,
}: {
  readonly projectId: string;
}): ReactElement {
  const { t } = useTranslation();
  const [knowledge, setKnowledge] = useState(false);
  return (
    <ProjectSection title={t('projectDetail.more')}>
      <div className='flex flex-wrap gap-2'>
        <Button
          aria-expanded={knowledge}
          size='sm'
          variant='outline'
          onClick={() => setKnowledge((open) => !open)}
        >
          {t('navigation.knowledge')}
        </Button>
        <Button
          size='sm'
          variant='outline'
          render={<Link to={`/project-memory?project=${projectId}`} />}
        >
          {t('navigation.projectMemory')}
        </Button>
        <Button
          size='sm'
          variant='outline'
          render={<Link to={`/releases?project=${projectId}`} />}
        >
          {t('projectDetail.releases')}
        </Button>
      </div>
      {knowledge ? (
        <div className='mt-3 h-[32rem]'>
          <KnowledgeView
            className='h-full'
            space={{ scope: 'project', scopeId: projectId }}
            labels={{ inheritedHint: t('knowledge.inheritedHint') }}
          />
        </div>
      ) : null}
    </ProjectSection>
  );
}
