/**
 * `/projects/:projectId`: one project, laid over the projects plugin's project list (`projectsRoute`, whose child it is).
 * It is composed from the UI Library's `project-detail` block and `property-fields` over the plugin's headless
 * `client/projects` hooks: the project, its property changes, its members and visibility, and deleting it.
 */
import { ApiClientError } from '@nocobase/app-client';
import {
  canDeleteProjects,
  canManageProject,
  progressFromCounts,
  projectNumbers,
  useDeleteProject,
  useProjectDetail,
  useProjectMembership,
  useProjectStatuses,
  useProjectUpdate,
  useWorkspaceMembers,
} from '@nocobase/app-plugin-projects/client/projects';
import {
  PmDetailSkeleton,
  useViewer,
} from '@nocobase/app-plugin-projects/client/kit';
import { PRIORITIES } from '@nocobase/app-plugin-projects/shared/common';
import {
  PROJECT_STATUSES,
  type ProjectDetail,
  type ProjectStatus,
  type UpdateProjectRequest,
} from '@nocobase/app-plugin-projects/shared/projects';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import { CircleAlertIcon, ListTodoIcon } from 'lucide-react';
import type { ReactElement } from 'react';
import { Link, useNavigate, useParams } from 'react-router';

import { BackButton } from '#components/back-button';
import type { IssueTableColor } from '#components/issue-table';
import { MarkdownView } from '#components/markdown-view';
import { PageContainer } from '#components/page-container';
import {
  PersonValue,
  PropertyCard,
  PropertyDate,
  PropertyRow,
  PropertySelect,
} from '#components/property-fields';
import { RouteChildPage } from '#components/route-child-page';
import { Alert, AlertDescription } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import {
  ProjectDeleteMenu,
  ProjectDescription,
  ProjectHeader,
  ProjectMembersRow,
  ProjectMetrics,
  ProjectOverviewLayout,
  ProjectStatusDistribution,
} from '#extensions/nocobase-project-detail/project-detail';
import {
  defaultProjectDetailLabels,
  type ProjectDetailLabels,
} from '#extensions/nocobase-project-detail/labels';
import { ProjectMembersEditor } from '#extensions/nocobase-project-detail/project-settings';

import {
  usePropertyFieldLabels,
  useRichTextLabels,
  useStatusPresenter,
} from '../issues/presentation.js';

/** A project status's colour, the same hues as the issue statuses. */
const PROJECT_STATUS_COLOR: Readonly<Record<ProjectStatus, IssueTableColor>> = {
  planned: 'gray',
  in_progress: 'blue',
  paused: 'yellow',
  completed: 'green',
  cancelled: 'gray',
};

/** The words of the `project-detail` block this page uses; the sections it does not show keep the block's own. */
function useProjectDetailLabels(): ProjectDetailLabels {
  const { t } = useTranslation();
  return {
    ...defaultProjectDetailLabels,
    header: {
      lead: t('projectDetail.block.lead'),
      noLead: t('projectDetail.block.noLead'),
      private: t('projectDetail.block.private'),
      workflow: t('projectDetail.block.workflow'),
    },
    deletion: {
      more: t('projectDetail.block.more'),
      delete: t('projectDetail.block.deleteProject'),
      title: t('projectDetail.block.deleteTitle'),
      description: t('projectDetail.block.deleteDescription'),
      cancel: t('projectDetail.block.cancel'),
    },
    overview: {
      numbers: t('projectDetail.block.numbers'),
      distribution: t('projectDetail.block.distribution'),
      noIssues: t('projectDetail.block.noIssues'),
      description: t('projectDetail.block.description'),
      noDescription: t('projectDetail.block.noDescription'),
      descriptionHint: t('projectDetail.block.descriptionHint'),
      editDescription: t('projectDetail.block.editDescription'),
      descriptionPlaceholder: t('projectDetail.block.descriptionPlaceholder'),
      save: t('projectDetail.block.save'),
      cancel: t('projectDetail.block.cancel'),
      members: t('projectDetail.block.members'),
      noMembers: t('projectDetail.block.noMembers'),
      memberCount: t('projectDetail.block.memberCount'),
      manageMembers: t('projectDetail.block.manageMembers'),
    },
    members: {
      title: t('projectDetail.block.members'),
      visibility: t('projectDetail.block.visibility'),
      everyone: t('projectDetail.block.everyone'),
      membersOnly: t('projectDetail.block.membersOnly'),
      everyoneHint: t('projectDetail.block.everyoneHint'),
      membersOnlyHint: t('projectDetail.block.membersOnlyHint'),
      empty: t('projectDetail.block.emptyMembers'),
      lead: t('projectDetail.block.lead'),
      actions: t('projectDetail.block.memberActions'),
      setLead: t('projectDetail.block.setLead'),
      removeAction: t('projectDetail.block.removeMember'),
      removeTitle: t('projectDetail.block.removeMemberTitle'),
      removeDescription: t('projectDetail.block.removeMemberDescription'),
      cancel: t('projectDetail.block.cancel'),
      choose: t('projectDetail.block.chooseMember'),
      noMatches: t('projectDetail.block.noMatches'),
    },
  };
}

function projectStatusLabel(
  t: (key: string) => string,
  status: ProjectStatus,
): string {
  if (status === 'planned') return t('projectDetail.statuses.planned');
  if (status === 'in_progress') return t('projectDetail.statuses.inProgress');
  if (status === 'paused') return t('projectDetail.statuses.paused');
  if (status === 'completed') return t('projectDetail.statuses.completed');
  return t('projectDetail.statuses.cancelled');
}

export default function ProjectDetailPage(): ReactElement {
  const { t } = useTranslation();
  const { projectId = '' } = useParams();
  const query = useProjectDetail(projectId);

  let content: ReactElement;
  if (query.data) {
    content = <ProjectDetailView project={query.data} />;
  } else if (query.error) {
    const status =
      query.error instanceof ApiClientError ? query.error.status : undefined;
    content = (
      <>
        <BackButton />
        <Alert variant='destructive' role='alert'>
          <CircleAlertIcon />
          <AlertDescription>
            {status === 404 || status === 403
              ? t('projectDetail.notFound')
              : t('projectDetail.loadFailed')}
          </AlertDescription>
        </Alert>
      </>
    );
  } else {
    content = <PmDetailSkeleton />;
  }

  return (
    <RouteChildPage>
      <PageContainer>{content}</PageContainer>
    </RouteChildPage>
  );
}

function ProjectDetailView({
  project,
}: {
  readonly project: ProjectDetail;
}): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const navigate = useNavigate();
  const viewer = useViewer();
  const canManage = canManageProject(viewer, project);
  const statuses = useProjectStatuses(project.id, true);
  const workspace = useWorkspaceMembers();
  const update = useProjectUpdate(project.id);
  const membership = useProjectMembership(project.id);
  const deleteProject = useDeleteProject(project);
  const issueStatus = useStatusPresenter();
  const labels = useProjectDetailLabels();
  const fieldLabels = usePropertyFieldLabels();
  const richTextLabels = useRichTextLabels();

  const progress = progressFromCounts(project.issueCounts);
  const numbers = projectNumbers(project.issueCounts.byStatus, statuses.data);
  const dateFormat = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });
  const formatDate = (value: string | null) =>
    value
      ? dateFormat.format(new Date(`${value.slice(0, 10)}T00:00:00`))
      : t('projectDetail.noDate');
  const dates =
    project.startDate || project.dueDate
      ? t('projectDetail.dates', {
          start: formatDate(project.startDate),
          due: formatDate(project.dueDate),
        })
      : null;
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
  const remove = async (): Promise<void> => {
    await deleteProject();
    await navigate('/projects', { replace: true });
  };

  return (
    <>
      <ProjectHeader
        name={project.name}
        status={{
          name: projectStatusLabel(t, project.status),
          color: PROJECT_STATUS_COLOR[project.status],
        }}
        membersOnly={project.visibility === 'members'}
        progress={{
          percent: progress.percent,
          label: t('projectDetail.progress', {
            done: progress.done,
            total: progress.total,
          }),
        }}
        lead={project.lead ? { name: project.lead.name } : null}
        dates={dates}
        trail={<BackButton />}
        actions={
          <>
            <Button
              variant='outline'
              nativeButton={false}
              render={
                <Link
                  to={{
                    pathname: '/issues',
                    search: `?view=list&project=${encodeURIComponent(project.id)}`,
                  }}
                />
              }
            >
              <ListTodoIcon data-icon='inline-start' />
              {t('projectDetail.viewIssues')}
            </Button>
            {canDeleteProjects(viewer) ? (
              <ProjectDeleteMenu
                name={project.name}
                onDelete={remove}
                labels={labels}
              />
            ) : null}
          </>
        }
        labels={labels}
      />
      <ProjectOverviewLayout
        asideLabel={t('projectDetail.properties')}
        main={
          <>
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
            <ProjectMembersEditor
              visibility={project.visibility}
              members={project.members.map((member) => ({
                id: member.id,
                name: member.name,
                lead: member.id === project.leadUserId,
              }))}
              candidates={(workspace.data ?? [])
                .filter(
                  (person) =>
                    !project.members.some(
                      (member) => member.id === person.userId,
                    ),
                )
                .map((person) => ({
                  value: person.userId,
                  label: person.name,
                }))}
              busy={membership.isPending}
              {...(canManage
                ? {
                    onVisibilityChange: (visibility) => {
                      membership
                        .setVisibility(visibility)
                        .catch(() => undefined);
                    },
                    onAdd: membership.add,
                    onSetLead: membership.setLead,
                    onRemove: membership.remove,
                  }
                : {})}
              labels={labels}
            />
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
                    const priority = PRIORITIES.find(
                      (entry) => entry === value,
                    );
                    if (priority) apply({ priority });
                  }}
                />
              </PropertyRow>
              <PropertyRow
                label={t('projectDetail.lead')}
                htmlFor='project-lead'
              >
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
    </>
  );
}
