// Settings → Organization API keys, with `server/routes/organization-keys.ts` answered by the fixture below.
import {
  answerApi,
  renderWithApp,
  type ApiCall,
} from '@nocobase/app-testing/client';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import packageMetadata from '../../package.json' with { type: 'json' };
import enUS from '../../client/locales/en-US.js';
import OrganizationKeysPage from '../../client/pages/settings/organization-keys.js';

const key = {
  id: 'k1',
  keyId: 'k1',
  name: 'CI',
  description: null,
  scope: { groups: { 'releases.apps': { level: 'read' } } },
  start: 'nb_abc',
  createdBy: { id: 'u1', name: 'Chủ dự án' },
  createdAt: '2026-11-01T00:00:00.000Z',
  expiresAt: null,
  lastUsedAt: null,
  status: 'active',
  managedBy: null,
};
const options = {
  groups: [
    {
      id: 'releases.apps',
      title: 'Apps',
      levels: ['read', 'write'],
      held: { read: true, write: false },
    },
  ],
  defaultExpiresInDays: 90,
};

let calls: ApiCall[] = [];

function render() {
  return renderWithApp(<OrganizationKeysPage />, {
    namespace: packageMetadata.name,
    namespaces: { [packageMetadata.name]: enUS },
    fetch: answerApi((call: ApiCall) => {
      calls.push(call);
      const path = String(call.path);
      if (call.method === 'DELETE') return { data: null };
      if (path.includes('scopeOptions')) return { data: options };
      if (call.method === 'POST' && path.endsWith('rotate'))
        return { data: { key, secret: 'nb_rotated' } };
      if (call.method === 'POST' && path.endsWith('organizationKeys'))
        return { data: { key, secret: 'nb_secret_once' } };
      if (call.method === 'POST') return { data: key };
      return { data: [key], meta: { total: 1 } };
    }),
  });
}

describe('organization keys', () => {
  beforeEach(() => {
    calls = [];
  });

  it('lists keys with who made them and what state they are in', async () => {
    render();
    const row = (await screen.findByText('CI')).closest('tr') as HTMLElement;
    expect(within(row).getByText('Active')).toBeTruthy();
    expect(within(row).getByText('Chủ dự án')).toBeTruthy();
  });

  it('creates a key with a scope and shows its secret once', async () => {
    render();
    await screen.findByText('CI');
    await userEvent.click(screen.getByRole('button', { name: 'New key' }));
    const apps = await screen.findByRole('group', { name: 'Apps' });
    // Only what the person holds can be given.
    expect(within(apps).getByRole('button', { name: 'Write' })).toHaveProperty(
      'disabled',
      true,
    );
    const create = screen.getByRole('button', { name: 'Create key' });
    expect(create).toHaveProperty('disabled', true);

    await userEvent.type(screen.getByLabelText('Name'), 'Triển khai');
    await userEvent.click(within(apps).getByRole('button', { name: 'Read' }));
    await userEvent.click(create);

    expect(await screen.findByText('nb_secret_once')).toBeTruthy();
    const sent = calls.find(
      (call) =>
        call.method === 'POST' &&
        String(call.path).endsWith('organizationKeys'),
    );
    expect(JSON.stringify(sent)).toContain('Triển khai');
    expect(JSON.stringify(sent)).toContain('"level":"read"');
  });

  it('asks once more before rotating, and shows the new secret', async () => {
    render();
    const row = (await screen.findByText('CI')).closest('tr') as HTMLElement;
    await userEvent.click(within(row).getByRole('button', { name: 'Rotate' }));
    expect(calls.some((call) => call.method === 'POST')).toBe(false);
    await userEvent.click(
      within(row).getByRole('button', { name: 'Confirm rotation' }),
    );
    expect(await screen.findByText('nb_rotated')).toBeTruthy();
  });

  it('asks once more before deleting, and can step back', async () => {
    render();
    const row = (await screen.findByText('CI')).closest('tr') as HTMLElement;
    await userEvent.click(within(row).getByRole('button', { name: 'Delete' }));
    await userEvent.click(within(row).getByRole('button', { name: 'Cancel' }));
    expect(calls.some((call) => call.method === 'DELETE')).toBe(false);
    await userEvent.click(within(row).getByRole('button', { name: 'Delete' }));
    await userEvent.click(
      within(row).getByRole('button', { name: 'Confirm deletion' }),
    );
    await waitFor(() =>
      expect(calls.some((call) => call.method === 'DELETE')).toBe(true),
    );
  });

  it('disables a key', async () => {
    render();
    const row = (await screen.findByText('CI')).closest('tr') as HTMLElement;
    await userEvent.click(within(row).getByRole('button', { name: 'Disable' }));
    await waitFor(() =>
      expect(
        calls.some((call) => String(call.path).endsWith('k1/disable')),
      ).toBe(true),
    );
  });
});
