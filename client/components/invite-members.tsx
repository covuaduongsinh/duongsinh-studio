/**
 * "Invite members": the agents-less way into Studio now that public sign-up is closed. The button opens the projects
 * plugin's dialog, which takes several addresses, lists the projects the invitees join and shows each registration link
 * once with a copy button (Studio has no outgoing email until M5, so the link is forwarded by hand).
 *
 * Who sees it matches the server (`POST /api/projects/invitations`): whoever holds `invite` on `pm.members` may invite
 * into any project, or none; a project's lead only into that project, which is then required. The server checks again.
 */
import { useApiClient } from '@nocobase/app-client';
import {
  InvitationsSection,
  InviteDialog,
  canUseSetting,
  useViewer,
} from '@nocobase/app-plugin-projects/client/kit';
import { useTranslation } from '@nocobase/i18n/client';
import { useQuery } from '@tanstack/react-query';
import { UserPlusIcon } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { Button } from '#components/ui/button';

interface ProjectOption {
  readonly id: string;
  readonly name: string;
}

/**
 * Whether the viewer may invite anywhere. False while `GET /api/projects/me` is loading or answers without permissions:
 * the plugin's `canUseSetting` reads them unguarded, and a control the server would refuse is better hidden than a crash.
 */
function useMayInvite(): boolean {
  const viewer = useViewer();
  return viewer?.permissions
    ? canUseSetting(viewer, 'pm.members', 'invite')
    : false;
}

/** The projects to offer, read only once the dialog opens and only when nothing narrower was given. */
function useInvitableProjects(enabled: boolean) {
  const api = useApiClient();
  return useQuery({
    queryKey: ['invitable-projects'],
    enabled,
    queryFn: async ({ signal }) =>
      (
        await api.request<{ data: readonly ProjectOption[] }>({
          path: 'projects',
          signal,
        })
      ).data.map(({ id, name }) => ({ id, name })),
  });
}

export function InviteMembers({
  project,
}: {
  /** On a project's page: the project invited into, and its lead. Absent on the Users page. */
  readonly project?: ProjectOption & { readonly leadUserId: string | null };
}): ReactElement | null {
  const { t } = useTranslation();
  const viewer = useViewer();
  const [open, setOpen] = useState(false);
  const mayInviteAnywhere = useMayInvite();
  const leads =
    project !== undefined &&
    viewer !== undefined &&
    project.leadUserId === viewer.userId;
  const all = useInvitableProjects(open && !project && mayInviteAnywhere);
  if (!mayInviteAnywhere && !leads) return null;
  const projects: readonly ProjectOption[] = project
    ? [{ id: project.id, name: project.name }]
    : (all.data ?? []);
  return (
    <>
      <Button variant='outline' onClick={() => setOpen(true)}>
        <UserPlusIcon data-icon='inline-start' />
        {t('inviteMembers.button')}
      </Button>
      <InviteDialog
        open={open}
        projects={projects}
        requireProject={!mayInviteAnywhere}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

/** The invitations not accepted yet, each sendable again (a fresh link) or revocable; only for someone who may invite. */
export function PendingInvitations(): ReactElement | null {
  return useMayInvite() ? <InvitationsSection /> : null;
}
