// Settings → New members: the role a new member is given once, and who holds it now.
import {
  answerApi,
  renderWithApp,
  type ApiCall,
} from '@nocobase/app-testing/client';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import packageMetadata from '../../package.json' with { type: 'json' };
import enUS from '../../client/locales/en-US.js';
import NewMemberRolePage from '../../client/pages/settings/new-member-role.js';

const can = vi.hoisted(() => ({ read: true, define: true }));
vi.mock('@nocobase/app-plugin-authorization/client', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  useCan: ({ action }: { action: string }) => ({
    can: action === 'define-roles' ? can.define : can.read,
    loading: false,
  }),
}));

const role = (key: string, title: unknown, holderIds: string[]) => ({
  key,
  title,
  builtIn: true,
  editable: key !== 'owner',
  pages: [],
  settings: {},
  abilities: {},
  holderIds,
  holderCount: holderIds.length,
});
const roles = [
  role('owner', 'Owner', ['u1']),
  role('ds-admin', 'Admin', []),
  role('contributor', 'Contributor', ['u2', 'u3']),
];
const members = [
  {
    userId: 'u1',
    name: 'Dương Sinh',
    email: 'a@x',
    disabled: false,
    roles: ['owner'],
  },
  {
    userId: 'u2',
    name: 'Lan',
    email: 'b@x',
    disabled: false,
    roles: ['contributor'],
  },
  {
    userId: 'u3',
    name: 'Minh',
    email: 'c@x',
    disabled: false,
    roles: ['contributor'],
  },
];

let calls: ApiCall[] = [];
let defaultRole: string | null = null;

function render() {
  return renderWithApp(<NewMemberRolePage />, {
    namespace: packageMetadata.name,
    namespaces: { [packageMetadata.name]: enUS },
    fetch: answerApi((call: ApiCall) => {
      calls.push(call);
      const path = String(call.path);
      if (path.endsWith('access/settings')) {
        if (call.method === 'PUT') {
          defaultRole = (call.json as { defaultRole: string | null })
            .defaultRole;
        }
        return { data: { defaultRole } };
      }
      if (path.endsWith('access/roles')) return { data: roles };
      return { data: members, meta: { total: members.length } };
    }),
  });
}
const puts = () => calls.filter((call) => call.method === 'PUT');

beforeEach(() => {
  calls = [];
  defaultRole = null;
  can.read = true;
  can.define = true;
});

describe('Settings → New members', () => {
  it('says plainly that, with no default role, a new member sees nothing yet', async () => {
    render();
    expect(await screen.findByText(/no role yet/iu)).toBeInTheDocument();
    expect(screen.getByLabelText('Role for new members')).toHaveTextContent(
      'No role',
    );
  });

  it('names who holds the chosen role now, and never offers the owner role', async () => {
    defaultRole = 'contributor';
    render();
    const holders = await screen.findByTestId('role-holders');
    expect(within(holders).getByText('Lan')).toBeInTheDocument();
    expect(within(holders).getByText('Minh')).toBeInTheDocument();
    expect(within(holders).queryByText('Dương Sinh')).not.toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('Role for new members'));
    expect(
      screen.queryByRole('option', { name: 'Owner' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Admin' })).toBeInTheDocument();
  });

  it('saves the chosen role, and removing it saves null', async () => {
    render();
    await userEvent.click(await screen.findByLabelText('Role for new members'));
    await userEvent.click(
      await screen.findByRole('option', { name: 'Contributor' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(puts()).toHaveLength(1));
    expect(puts()[0]?.json).toEqual({ defaultRole: 'contributor' });

    await userEvent.click(screen.getByLabelText('Role for new members'));
    await userEvent.click(
      await screen.findByRole('option', { name: 'No role' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(puts()).toHaveLength(2));
    expect(puts()[1]?.json).toEqual({ defaultRole: null });
  });

  it('is read-only without the right to define roles, and shows nothing without the right to read', async () => {
    can.define = false;
    render();
    expect(await screen.findByLabelText('Role for new members')).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: 'Save' }),
    ).not.toBeInTheDocument();
  });

  it('asks for nothing when the viewer may not read members', async () => {
    can.read = false;
    can.define = false;
    render();
    expect(await screen.findByText(/not allowed/iu)).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });
});
