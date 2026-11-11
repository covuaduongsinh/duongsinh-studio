/**
 * `/projects/:projectId`: one project, laid over the projects plugin's project list (`projectsRoute`, whose child it is).
 * It is composed from the UI Library's `project-detail` block and `property-fields` over the plugin's headless
 * `client/projects` hooks: the project, its property changes, its members and visibility, and deleting it.
 */
import { useChatContextSource } from '@nocobase/app-plugin-agents/client/chat';
import { ApiClientError } from '@nocobase/app-client';
import {
  canDeleteProjects,
  canManageProject,
  progressFromCounts,
  useDeleteProject,
  useProjectDetail,
} from '@nocobase/app-plugin-projects/client/projects';
import {
  PmDetailSkeleton,
  useViewer,
} from '@nocobase/app-plugin-projects/client/kit';
import type { ProjectDetail } from '@nocobase/app-plugin-projects/shared/projects';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import { CircleAlertIcon, ListTodoIcon } from 'lucide-react';
import { useMemo, type ReactElement } from 'react';
import {
  Link,
  Navigate,
  useNavigate,
  useOutlet,
  useParams,
} from 'react-router';

import { BackButton } from '#components/back-button';
import { InviteMembers } from '#components/invite-members';
import { PageContainer } from '#components/page-container';
import { RouteChildPage } from '#components/route-child-page';
import { Alert, AlertDescription } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import { AskAgentButton } from '#extensions/nocobase-agent-chat/launchers';
import {
  ProjectDeleteMenu,
  ProjectHeader,
} from '#extensions/nocobase-project-detail/project-detail';

import { ProjectAutopilotBadge } from '../project-autopilot.js';
import {
  PROJECT_STATUS_COLOR,
  projectStatusLabel,
  useProjectDetailLabels,
  type ProjectOutlet,
} from './shared.js';
import { ProjectTabs } from './tabs.js';

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
  const deleteProject = useDeleteProject(project);
  const labels = useProjectDetailLabels();
  const outlet = useOutlet({ project, canManage } satisfies ProjectOutlet);

  const progress = progressFromCounts(project.issueCounts);
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
  const remove = async (): Promise<void> => {
    await deleteProject();
    await navigate('/projects', { replace: true });
  };
  // What the agents' chat pins while this page is open; "Ask agent" opens it with the project and a draft question.
  const chatItem = useMemo(
    () => ({ kind: 'project', id: project.id, label: project.name }),
    [project.id, project.name],
  );
  useChatContextSource(chatItem);

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
            <ProjectAutopilotBadge projectId={project.id} />
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
            <InviteMembers
              project={{
                id: project.id,
                name: project.name,
                leadUserId: project.leadUserId,
              }}
            />
            <AskAgentButton
              item={chatItem}
              label={t('studioChat.askProject')}
              draft={t('studioChat.askProjectDraft')}
              size='default'
              newConversation
            />
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
      <ProjectTabs
        tabs={[
          { key: 'overview' },
          { key: 'issues', count: project.issueCounts.total },
          { key: 'knowledge' },
          { key: 'memory' },
          { key: 'members', count: project.memberCount },
          { key: 'releases' },
          ...(canManage ? [{ key: 'settings' }] : []),
        ]}
      />
      {/* The bare path has no tab of its own: it opens Overview. */}
      {outlet ?? <Navigate to='overview' replace />}
    </>
  );
}
