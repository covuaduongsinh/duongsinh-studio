// Who sees "Invite members", and what the plugin's dialog is given.
import {
  answerApi,
  renderWithApp,
  type ApiCall,
} from '@nocobase/app-testing/client';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import packageMetadata from '../../package.json' with { type: 'json' };
import enUS from '../../client/locales/en-US.js';
import { InviteMembers } from '../../client/components/invite-members.js';

const viewer = vi.hoisted(() => ({
  value: { userId: 'u1', permissions: {} } as
    { userId: string; permissions?: object } | undefined,
  mayInvite: true,
}));
const dialog = vi.hoisted(() => ({
  props: null as null | {
    open: boolean;
    projects: { id: string; name: string }[];
    requireProject: boolean;
  },
}));

vi.mock('@nocobase/app-plugin-projects/client/kit', () => ({
  useViewer: () => viewer.value,
  canUseSetting: () => viewer.mayInvite,
  InviteDialog: (props: NonNullable<typeof dialog.props>) => {
    dialog.props = props;
    return props.open ? <div data-testid='invite-dialog' /> : <></>;
  },
}));

let calls: ApiCall[] = [];

function render(element: React.ReactElement) {
  return renderWithApp(element, {
    namespace: packageMetadata.name,
    namespaces: { [packageMetadata.name]: enUS },
    fetch: answerApi((call: ApiCall) => {
      calls.push(call);
      return {
        data: [
          { id: 'p1', name: 'Dương Sinh App' },
          { id: 'p2', name: 'Sandbox' },
        ],
      };
    }),
  });
}

beforeEach(() => {
  calls = [];
  dialog.props = null;
  viewer.value = { userId: 'u1', permissions: {} };
  viewer.mayInvite = true;
});

describe('Invite members', () => {
  it('lets someone who may invite choose among every project, with none required', async () => {
    render(<InviteMembers />);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Invite members' }),
    );
    expect(await screen.findByTestId('invite-dialog')).toBeInTheDocument();
    expect(dialog.props).toMatchObject({
      open: true,
      requireProject: false,
      projects: [
        { id: 'p1', name: 'Dương Sinh App' },
        { id: 'p2', name: 'Sandbox' },
      ],
    });
  });

  it('shows nothing, and asks for no projects, to someone who may not invite', async () => {
    viewer.mayInvite = false;
    render(
      <>
        <InviteMembers />
        <p>page ready</p>
      </>,
    );
    await screen.findByText('page ready');
    expect(
      screen.queryByRole('button', { name: 'Invite members' }),
    ).not.toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });

  it('on a project page, lets its lead invite into that project only, and requires it', async () => {
    viewer.mayInvite = false;
    render(
      <InviteMembers
        project={{ id: 'p2', name: 'Sandbox', leadUserId: 'u1' }}
      />,
    );
    await userEvent.click(
      await screen.findByRole('button', { name: 'Invite members' }),
    );
    expect(dialog.props).toMatchObject({
      requireProject: true,
      projects: [{ id: 'p2', name: 'Sandbox' }],
    });
    expect(calls).toHaveLength(0);
  });

  it('on a project page, shows nothing to a member who neither leads it nor may invite', async () => {
    viewer.mayInvite = false;
    render(
      <>
        <InviteMembers
          project={{ id: 'p2', name: 'Sandbox', leadUserId: 'someone' }}
        />
        <p>page ready</p>
      </>,
    );
    await screen.findByText('page ready');
    expect(
      screen.queryByRole('button', { name: 'Invite members' }),
    ).not.toBeInTheDocument();
  });

  it('shows nothing, and does not crash, while the viewer has no permissions yet', async () => {
    viewer.value = { userId: 'u1' };
    render(
      <>
        <InviteMembers />
        <p>page ready</p>
      </>,
    );
    await screen.findByText('page ready');
    expect(
      screen.queryByRole('button', { name: 'Invite members' }),
    ).not.toBeInTheDocument();
  });
});
