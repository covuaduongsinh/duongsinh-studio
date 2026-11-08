// Settings → My account: profile, password and personal API keys, through the Better Auth client.
import { answerApi, renderWithApp } from '@nocobase/app-testing/client';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import packageMetadata from '../../package.json' with { type: 'json' };
import enUS from '../../client/locales/en-US.js';
import MyAccountPage from '../../client/pages/settings/my-account/index.js';

const auth = vi.hoisted(() => ({
  refresh: vi.fn(),
  updateUser: vi.fn(),
  changePassword: vi.fn(),
  list: vi.fn(),
  create: vi.fn(),
  remove: vi.fn(),
  copy: vi.fn(),
}));

vi.mock('@nocobase/app-plugin-authentication/client', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  useAuthentication: () => ({
    client: {
      updateUser: auth.updateUser,
      changePassword: auth.changePassword,
      apiKey: { list: auth.list, create: auth.create, delete: auth.remove },
    },
    session: {
      user: {
        id: 'u1',
        name: 'Dương Sinh',
        email: 'owner@example.test',
        username: 'admin',
      },
    },
    isPending: false,
    refresh: auth.refresh,
  }),
}));
vi.mock('@nocobase/app-client', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  copyText: (text: string) => auth.copy(text),
}));

const key = (
  id: string,
  name: string,
  extra: Record<string, unknown> = {},
) => ({
  id,
  name,
  prefix: 'ds',
  start: 'ds_ab',
  enabled: true,
  createdAt: '2026-11-02T16:47:00.000Z',
  expiresAt: null,
  lastRequest: null,
  ...extra,
});

function render() {
  return renderWithApp(<MyAccountPage />, {
    namespace: packageMetadata.name,
    namespaces: { [packageMetadata.name]: enUS },
    fetch: answerApi(() => ({ data: null })),
  });
}

beforeEach(() => {
  for (const fn of Object.values(auth)) fn.mockReset();
  auth.updateUser.mockResolvedValue({ data: { status: true }, error: null });
  auth.changePassword.mockResolvedValue({ data: {}, error: null });
  auth.list.mockResolvedValue({
    data: { apiKeys: [key('k1', 'CLI on my laptop')], total: 1 },
    error: null,
  });
  auth.create.mockResolvedValue({
    data: { ...key('k2', 'CLI on my laptop'), key: 'ds_SECRET-VALUE-ONCE' },
    error: null,
  });
  auth.remove.mockResolvedValue({ data: { success: true }, error: null });
  auth.copy.mockResolvedValue(true);
});

describe('My account: profile', () => {
  it('shows who is signed in, and saves a new name', async () => {
    render();
    expect(await screen.findByText('owner@example.test')).toBeInTheDocument();
    expect(screen.getByText('admin')).toBeInTheDocument();
    const name = screen.getByLabelText('Name');
    await userEvent.clear(name);
    await userEvent.type(name, 'Chủ dự án');
    await userEvent.click(screen.getByRole('button', { name: 'Save profile' }));
    await waitFor(() =>
      expect(auth.updateUser).toHaveBeenCalledWith({ name: 'Chủ dự án' }),
    );
    await waitFor(() => expect(auth.refresh).toHaveBeenCalled());
  });
});

describe('My account: password', () => {
  const fill = async (current: string, next: string, again: string) => {
    await userEvent.type(
      await screen.findByLabelText('Current password'),
      current,
    );
    await userEvent.type(screen.getByLabelText('New password'), next);
    await userEvent.type(
      screen.getByLabelText('Repeat the new password'),
      again,
    );
  };

  it('needs a long enough new password, written twice the same', async () => {
    render();
    await fill('old-password-1', 'short', 'short');
    expect(
      screen.getByRole('button', { name: 'Change password' }),
    ).toBeDisabled();
    await userEvent.clear(screen.getByLabelText('New password'));
    await userEvent.clear(screen.getByLabelText('Repeat the new password'));
    await userEvent.type(
      screen.getByLabelText('New password'),
      'long-enough-1',
    );
    await userEvent.type(
      screen.getByLabelText('Repeat the new password'),
      'different-2',
    );
    expect(
      screen.getByRole('button', { name: 'Change password' }),
    ).toBeDisabled();
    expect(screen.getByText('The two passwords differ.')).toBeInTheDocument();
  });

  it('changes it and signs out the other sessions by default', async () => {
    render();
    await fill('old-password-1', 'long-enough-1', 'long-enough-1');
    await userEvent.click(
      screen.getByRole('button', { name: 'Change password' }),
    );
    await waitFor(() =>
      expect(auth.changePassword).toHaveBeenCalledWith({
        currentPassword: 'old-password-1',
        newPassword: 'long-enough-1',
        revokeOtherSessions: true,
      }),
    );
    expect(
      await screen.findByText('Your password was changed.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Current password')).toHaveValue('');
  });

  it('shows the server’s reason when the current password is wrong, and keeps what was typed', async () => {
    auth.changePassword.mockResolvedValue({
      data: null,
      error: { message: 'Invalid password' },
    });
    render();
    await fill('wrong-password-1', 'long-enough-1', 'long-enough-1');
    await userEvent.click(
      screen.getByRole('button', { name: 'Change password' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Invalid password',
    );
    expect(screen.getByLabelText('New password')).toHaveValue('long-enough-1');
  });
});

describe('My account: API keys', () => {
  it('lists the keys by name and the part of them that is safe to show, never a secret', async () => {
    render();
    const row = await screen.findByTestId('api-key-k1');
    expect(within(row).getByText('CLI on my laptop')).toBeInTheDocument();
    expect(within(row).getByText(/ds_ab/u)).toBeInTheDocument();
    expect(within(row).getByText(/never expires/iu)).toBeInTheDocument();
    expect(screen.queryByText('ds_SECRET-VALUE-ONCE')).not.toBeInTheDocument();
  });

  it('says so when there are no keys', async () => {
    auth.list.mockResolvedValue({
      data: { apiKeys: [], total: 0 },
      error: null,
    });
    render();
    expect(await screen.findByText(/no API keys yet/iu)).toBeInTheDocument();
  });

  it('creates a key and shows its secret once, with a copy button', async () => {
    render();
    await userEvent.click(
      await screen.findByRole('button', { name: 'New key' }),
    );
    await userEvent.type(
      await screen.findByLabelText('Name of the key'),
      'Backup script',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Create key' }));
    await waitFor(() =>
      expect(auth.create).toHaveBeenCalledWith({
        name: 'Backup script',
        expiresIn: 90 * 24 * 60 * 60,
      }),
    );
    expect(await screen.findByText('ds_SECRET-VALUE-ONCE')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Copy the key' }));
    expect(auth.copy).toHaveBeenCalledWith('ds_SECRET-VALUE-ONCE');
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByText('ds_SECRET-VALUE-ONCE')).not.toBeInTheDocument();
  });

  it('rotates a key: the replacement is made first, and only then the old one removed', async () => {
    const order: string[] = [];
    auth.create.mockImplementation(async () => {
      order.push('create');
      return {
        data: { ...key('k2', 'CLI on my laptop'), key: 'ds_SECRET-VALUE-ONCE' },
        error: null,
      };
    });
    auth.remove.mockImplementation(async () => {
      order.push('delete');
      return { data: { success: true }, error: null };
    });
    render();
    const row = await screen.findByTestId('api-key-k1');
    await userEvent.click(within(row).getByRole('button', { name: 'Rotate' }));
    await userEvent.click(
      await screen.findByRole('button', { name: 'Create key' }),
    );
    await waitFor(() => expect(auth.remove).toHaveBeenCalledTimes(1));
    expect(auth.create.mock.calls[0]?.[0]).toMatchObject({
      name: 'CLI on my laptop',
    });
    expect(auth.remove).toHaveBeenCalledWith({ keyId: 'k1' });
    expect(order).toEqual(['create', 'delete']);
    expect(await screen.findByText('ds_SECRET-VALUE-ONCE')).toBeInTheDocument();
  });

  it('keeps the old key when the replacement could not be made', async () => {
    auth.create.mockResolvedValue({
      data: null,
      error: { message: 'Name already used' },
    });
    render();
    const row = await screen.findByTestId('api-key-k1');
    await userEvent.click(within(row).getByRole('button', { name: 'Rotate' }));
    await userEvent.click(
      await screen.findByRole('button', { name: 'Create key' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Name already used',
    );
    expect(auth.remove).not.toHaveBeenCalled();
  });

  it('deletes a key only after confirming', async () => {
    render();
    const row = await screen.findByTestId('api-key-k1');
    await userEvent.click(within(row).getByRole('button', { name: 'Delete' }));
    expect(auth.remove).not.toHaveBeenCalled();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Delete the key' }),
    );
    await waitFor(() =>
      expect(auth.remove).toHaveBeenCalledWith({ keyId: 'k1' }),
    );
  });
});
