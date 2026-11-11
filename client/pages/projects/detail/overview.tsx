/** A project's Overview tab: where it stands, its description, what is left of its setup, and its properties. */
import {
  useProjectOutlet,
  projectStatusLabel,
  useProjectDetailLabels,
} from './shared.js';
import {
  projectNumbers,
  useProjectMembership,
  useProjectStatuses,
  useProjectUpdate,
} from '@nocobase/app-plugin-projects/client/projects';
import { PRIORITIES } from '@nocobase/app-plugin-projects/shared/common';
import {
  PROJECT_STATUSES,
  type UpdateProjectRequest,
} from '@nocobase/app-plugin-projects/shared/projects';
import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';
import { Link } from 'react-router';

import { MarkdownView } from '#components/markdown-view';
import {
  PersonValue,
  PropertyCard,
  PropertyDate,
  PropertyRow,
  PropertySelect,
} from '#components/property-fields';
import { buttonVariants } from '#components/ui/button';
import {
  ProjectDescription,
  ProjectMembersRow,
  ProjectMetrics,
  ProjectOverviewLayout,
  ProjectSection,
  ProjectStatusDistribution,
} from '#extensions/nocobase-project-detail/project-detail';
import { useProjectInit } from '#hooks/use-project-setup';

import {
  usePropertyFieldLabels,
  useRichTextLabels,
  useStatusPresenter,
} from '../../issues/presentation.js';
import { ProjectLinks } from '../project-links.js';

/** What is left of a project's setup (its repository and first issue are made by an agent), until it is done. */
function NextSteps({
  projectId,
}: {
  readonly projectId: string;
}): ReactElement | null {
  const { t } = useTranslation();
  const init = useProjectInit(projectId);
  const state = init.data;
  if (!state || state.state === 'done') return null;
  return (
    <ProjectSection
      title={t('projectDetail.nextSteps.title')}
      description={t(`projectDetail.nextSteps.${state.state}`)}
    >
      {state.error ? (
        <p role='alert' className='text-sm text-destructive'>
          {state.error}
        </p>
      ) : null}
      {state.issueId ? (
        <Link
          to={`/issues/${encodeURIComponent(state.issueId)}`}
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
        >
          {t('projectDetail.nextSteps.openIssue')}
        </Link>
      ) : null}
    </ProjectSection>
  );
}

export function ProjectOverviewTab(): ReactElement {
  const { t } = useTranslation();
  const { project, canManage } = useProjectOutlet();
  const statuses = useProjectStatuses(project.id, true);
  const update = useProjectUpdate(project.id);
  const membership = useProjectMembership(project.id);
  const issueStatus = useStatusPresenter();
  const labels = useProjectDetailLabels();
  const fieldLabels = usePropertyFieldLabels();
  const richTextLabels = useRichTextLabels();
  const numbers = projectNumbers(project.issueCounts.byStatus, statuses.data);
  const members = project.members.map((member) => ({
    id: member.id,
    name: member.name,
  }));
  const change = async (changes: UpdateProjectRequest): Promise<void> => {
    await update.update(changes);
  };
  const apply = (changes: UpdateProjectRequest): void => {
    // The hook has already said what failed; the field keeps showing the stored value.
    change(changes).catch(() => undefined);
  };

  return (
    <ProjectOverviewLayout
      asideLabel={t('projectDetail.properties')}
      main={
        <>
          <NextSteps projectId={project.id} />
          <ProjectMetrics
            metrics={[
              {
                key: 'total',
                label: t('projectDetail.metrics.total'),
                value: numbers.total,
              },
              {
                key: 'started',
                label: t('projectDetail.metrics.started'),
                value: numbers.started,
              },
              {
                key: 'review',
                label: t('projectDetail.metrics.review'),
                value: numbers.review,
              },
              {
                key: 'done',
                label: t('projectDetail.metrics.done'),
                value: numbers.done,
              },
            ]}
            labels={labels}
          />
          <ProjectStatusDistribution
            rows={(statuses.data ?? []).map((entry) => ({
              key: entry.key,
              ...issueStatus(entry.key, statuses.data),
              count: project.issueCounts.byStatus[entry.key] ?? 0,
            }))}
            labels={labels}
          />
          <ProjectDescription
            description={project.description ?? ''}
            renderMarkdown={(markdown) => <MarkdownView content={markdown} />}
            {...(canManage
              ? { onSave: (description) => change({ description }) }
              : {})}
            richTextLabels={richTextLabels}
            labels={labels}
          />
          <ProjectLinks projectId={project.id} />
        </>
      }
      aside={
        <>
          <PropertyCard
            title={t('projectDetail.properties')}
            busy={update.isPending}
            labels={fieldLabels}
          >
            <PropertyRow
              label={t('projectDetail.status')}
              htmlFor='project-status'
            >
              <PropertySelect
                id='project-status'
                disabled={!canManage}
                options={PROJECT_STATUSES.map((status) => ({
                  value: status,
                  label: projectStatusLabel(t, status),
                }))}
                value={project.status}
                onChange={(value) => {
                  const status = PROJECT_STATUSES.find(
                    (entry) => entry === value,
                  );
                  if (status) apply({ status });
                }}
              />
            </PropertyRow>
            <PropertyRow
              label={t('projectDetail.priority')}
              htmlFor='project-priority'
            >
              <PropertySelect
                id='project-priority'
                disabled={!canManage}
                options={PRIORITIES.map((priority) => ({
                  value: priority,
                  label: t(`issues.priority.${priority}`),
                }))}
                value={project.priority}
                onChange={(value) => {
                  const priority = PRIORITIES.find((entry) => entry === value);
                  if (priority) apply({ priority });
                }}
              />
            </PropertyRow>
            <PropertyRow label={t('projectDetail.lead')} htmlFor='project-lead'>
              <PropertySelect
                id='project-lead'
                disabled={!canManage}
                options={members.map((member) => ({
                  value: member.id,
                  label: member.name,
                }))}
                value={project.leadUserId}
                renderValue={(value) => (
                  <PersonValue
                    name={
                      members.find((member) => member.id === value)?.name ??
                      project.lead?.name ??
                      value
                    }
                  />
                )}
                onChange={(value) => {
                  if (value) membership.setLead(value).catch(() => undefined);
                }}
              />
            </PropertyRow>
            <PropertyRow
              label={t('projectDetail.startDate')}
              htmlFor='project-start'
            >
              <PropertyDate
                id='project-start'
                disabled={!canManage}
                value={project.startDate?.slice(0, 10) ?? null}
                clearLabel={t('projectDetail.clearStart')}
                onChange={(startDate) => apply({ startDate })}
              />
            </PropertyRow>
            <PropertyRow
              label={t('projectDetail.dueDate')}
              htmlFor='project-due'
            >
              <PropertyDate
                id='project-due'
                disabled={!canManage}
                value={project.dueDate?.slice(0, 10) ?? null}
                clearLabel={t('projectDetail.clearDue')}
                onChange={(dueDate) => apply({ dueDate })}
              />
            </PropertyRow>
          </PropertyCard>
          <ProjectMembersRow members={members} labels={labels} />
        </>
      }
    />
  );
}
