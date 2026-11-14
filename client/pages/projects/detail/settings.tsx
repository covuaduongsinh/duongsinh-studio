/**
 * A project's Settings tab, in sections kept in `?section=`: General (autopilot), Directories (its repositories and
 * their checks), Variables and Skills (what only the runs of this project receive). Only people who manage the project
 * reach it.
 */
import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';
import { Link, useSearchParams } from 'react-router';

import { cn } from 'cn';

import { ProjectDefaultCriteriaCard } from '#components/criteria/criteria-editor';
import { ProjectAgentSettings } from '../project-agent-settings.js';
import { ProjectAutopilot } from '../project-autopilot.js';
import { ProjectBranchProtection } from '../project-branch-protection.js';
import { ProjectHarnessExport } from '../project-harness-export.js';
import { ProjectDefaultTier } from '../project-default-tier.js';
import { ProjectReactions } from '../project-reactions.js';
import { ProjectCode } from '../project-code.js';
import { useProjectOutlet } from './shared.js';

const SECTIONS = ['general', 'directories', 'variables', 'skills'] as const;
type Section = (typeof SECTIONS)[number];

export function ProjectSettingsTab(): ReactElement {
  const { t } = useTranslation();
  const { project, canManage } = useProjectOutlet();
  const [params] = useSearchParams();
  const asked = params.get('section');
  const section: Section = (SECTIONS as readonly string[]).includes(asked ?? '')
    ? (asked as Section)
    : 'general';

  return (
    <div className='grid gap-6 lg:grid-cols-[14rem_1fr]'>
      <nav
        aria-label={t('projectDetail.sectionsLabel')}
        className='flex gap-1 lg:flex-col'
      >
        {SECTIONS.map((key) => (
          <Link
            key={key}
            to={{ search: `?section=${key}` }}
            replace
            aria-current={section === key ? 'page' : undefined}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm transition-colors hover:bg-muted',
              section === key && 'bg-muted font-medium',
            )}
          >
            {t(`projectDetail.sections.${key}`)}
          </Link>
        ))}
      </nav>
      <div className='min-w-0'>
        {section === 'general' ? (
          <div className='flex flex-col gap-6'>
            <ProjectAutopilot projectId={project.id} />
            <ProjectDefaultTier projectId={project.id} canManage={canManage} />
            <ProjectBranchProtection
              projectId={project.id}
              canManage={canManage}
            />
            <ProjectReactions projectId={project.id} canManage={canManage} />
            <ProjectHarnessExport
              projectId={project.id}
              canManage={canManage}
            />
            <ProjectDefaultCriteriaCard
              projectId={project.id}
              canManage={canManage}
            />
          </div>
        ) : null}
        {section === 'directories' ? (
          <ProjectCode projectId={project.id} />
        ) : null}
        {section === 'variables' ? (
          <ProjectAgentSettings
            projectId={project.id}
            canManage={canManage}
            only='variables'
          />
        ) : null}
        {section === 'skills' ? (
          <ProjectAgentSettings
            projectId={project.id}
            canManage={canManage}
            only='skills'
          />
        ) : null}
      </div>
    </div>
  );
}
