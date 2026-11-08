// An administrator sets a new password for someone, and may sign them out of every session.
import {
  answerApi,
  renderWithApp,
  type ApiCall,
} from '@nocobase/app-testing/client';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import packageMetadata from '../../package.json' with { type: 'json' };
import enUS from '../../client/locales/en-US.js';
import { ResetPasswordAction } from '../../client/pages/settings/reset-password.js';

const rights = vi.hoisted(() => ({ reset: true, revoke: true }));
vi.mock('@nocobase/app-plugin-authorization/client', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  useCan: ({ action }: { action: string }) => ({
    can:
      action === 'reset-password'
        ? rights.reset
        : action === 'revoke-sessions'
          ? rights.revoke
          : false,
    loading: false,
  }),
}));

let calls: ApiCall[] = [];
let failReset = false;

function render() {
  return renderWithApp(
    <>
      <ResetPasswordAction user={{ id: 'u2', name: 'Lan' }} />
      <p>page ready</p>
    </>,
    {
      namespace: packageMetadata.name,
      namespaces: { [packageMetadata.name]: enUS },
      fetch: answerApi((call: ApiCall) => {
        calls.push(call);
        if (failReset && String(call.path).endsWith('/resetPassword'))
          throw new Error('The password is too short.');
        return { data: null };
      }),
    },
  );
}
const posted = (suffix: string) =>
  calls.filter(
    (call) => call.method === 'POST' && String(call.path).endsWith(suffix),
  );

beforeEach(() => {
  calls = [];
  failReset = false;
  rights.reset = true;
  rights.revoke = true;
});

describe('Reset password', () => {
  it('shows nothing to someone who may not reset passwords', async () => {
    rights.reset = false;
    render();
    await screen.findByText('page ready');
    expect(
      screen.queryByRole('button', { name: 'Reset password' }),
    ).not.toBeInTheDocument();
  });

  it('will not send a short password, and generates a long one on request', async () => {
    render();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Reset password' }),
    );
    const field = await screen.findByLabelText('New password');
    await userEvent.type(field, 'short');
    expect(screen.getByRole('button', { name: 'Set password' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Generate' }));
    expect((field as HTMLInputElement).value).toHaveLength(16);
    expect(screen.getByRole('button', { name: 'Set password' })).toBeEnabled();
  });

  it('sets the password and signs the person out everywhere by default', async () => {
    render();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Reset password' }),
    );
    await userEvent.type(
      await screen.findByLabelText('New password'),
      'Correct-horse-battery',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Set password' }));
    await waitFor(() => expect(posted('/resetPassword')).toHaveLength(1));
    expect(String(posted('/resetPassword')[0]?.path)).toContain('users/u2/');
    expect(posted('/resetPassword')[0]?.json).toEqual({
      password: 'Correct-horse-battery',
    });
    await waitFor(() => expect(posted('/revokeSessions')).toHaveLength(1));
    // The password stays on screen so it can be copied and handed over.
    expect(
      await screen.findByText(/^Done\. Copy the password/u),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('New password')).toHaveValue(
      'Correct-horse-battery',
    );
  });

  it('keeps their sessions when the box is cleared', async () => {
    render();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Reset password' }),
    );
    await userEvent.type(
      await screen.findByLabelText('New password'),
      'Correct-horse-battery',
    );
    await userEvent.click(
      screen.getByRole('checkbox', { name: /sign them out/iu }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Set password' }));
    await waitFor(() => expect(posted('/resetPassword')).toHaveLength(1));
    expect(posted('/revokeSessions')).toHaveLength(0);
  });

  it('says what went wrong and does not sign anyone out when the reset fails', async () => {
    failReset = true;
    render();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Reset password' }),
    );
    await userEvent.type(
      await screen.findByLabelText('New password'),
      'Correct-horse-battery',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Set password' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(posted('/revokeSessions')).toHaveLength(0);
  });
});
