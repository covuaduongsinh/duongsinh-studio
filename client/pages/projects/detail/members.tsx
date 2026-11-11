/** A project's Members tab: who is in it, who leads it and who may see it. */
import {
  useProjectMembership,
  useWorkspaceMembers,
} from '@nocobase/app-plugin-projects/client/projects';
import type { ReactElement } from 'react';

import { ProjectMembersEditor } from '#extensions/nocobase-project-detail/project-settings';

import { useProjectDetailLabels, useProjectOutlet } from './shared.js';

export function ProjectMembersTab(): ReactElement {
  const { project, canManage } = useProjectOutlet();
  const workspace = useWorkspaceMembers();
  const membership = useProjectMembership(project.id);
  const labels = useProjectDetailLabels();
  return (
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
            !project.members.some((member) => member.id === person.userId),
        )
        .map((person) => ({
          value: person.userId,
          label: person.name,
        }))}
      busy={membership.isPending}
      {...(canManage
        ? {
            onVisibilityChange: (visibility) => {
              membership.setVisibility(visibility).catch(() => undefined);
            },
            onAdd: membership.add,
            onSetLead: membership.setLead,
            onRemove: membership.remove,
          }
        : {})}
      labels={labels}
    />
  );
}
