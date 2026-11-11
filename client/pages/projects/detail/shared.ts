/** What the tabs of a project's page share: the project, the words of its detail block and its status labels. */
import type {
  ProjectDetail,
  ProjectStatus,
} from '@nocobase/app-plugin-projects/shared/projects';
import { useTranslation } from '@nocobase/i18n/client';
import { useOutletContext } from 'react-router';

import type { IssueTableColor } from '#components/issue-table';
import {
  defaultProjectDetailLabels,
  type ProjectDetailLabels,
} from '#extensions/nocobase-project-detail/labels';

/** What the page hands each tab through the outlet. */
export interface ProjectOutlet {
  readonly project: ProjectDetail;
  /** Whether the viewer manages the project (settings, members, description). */
  readonly canManage: boolean;
}

export function useProjectOutlet(): ProjectOutlet {
  return useOutletContext<ProjectOutlet>();
}

/** A project status's colour, the same hues as the issue statuses. */
export const PROJECT_STATUS_COLOR: Readonly<
  Record<ProjectStatus, IssueTableColor>
> = {
  planned: 'gray',
  in_progress: 'blue',
  paused: 'yellow',
  completed: 'green',
  cancelled: 'gray',
};

/** The words of the `project-detail` block this page uses; the sections it does not show keep the block's own. */
export function useProjectDetailLabels(): ProjectDetailLabels {
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

export function projectStatusLabel(
  t: (key: string) => string,
  status: ProjectStatus,
): string {
  if (status === 'planned') return t('projectDetail.statuses.planned');
  if (status === 'in_progress') return t('projectDetail.statuses.inProgress');
  if (status === 'paused') return t('projectDetail.statuses.paused');
  if (status === 'completed') return t('projectDetail.statuses.completed');
  return t('projectDetail.statuses.cancelled');
}
