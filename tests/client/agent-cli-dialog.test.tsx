// "Use Studio in your agent": a download token is minted only when asked, and the install line carries it.
import {
  answerApi,
  renderWithApp,
  type ApiCall,
} from '@nocobase/app-testing/client';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';

import enUS from '../../client/locales/en-US.js';
import { AgentCliDialog } from '../../client/layouts/components/agent-cli-dialog.js';
import packageMetadata from '../../package.json' with { type: 'json' };

const api = vi.fn((call: ApiCall): unknown =>
  call.method === 'POST' && call.path === 'agents/dist/downloadTokens'
    ? {
        data: {
          token: 'dl_abc123',
          expiresAt: '2026-11-11T10:00:00Z',
          maxDownloads: 3,
        },
      }
    : new Response(null, { status: 404 }),
);

beforeEach(() => {
  api.mockClear();
});

it('shows the sign-in line at once and mints a token only when asked, then shows the install line with it', async () => {
  const user = userEvent.setup();
  await renderWithApp(<AgentCliDialog open onOpenChange={() => undefined} />, {
    namespace: packageMetadata.name,
    namespaces: { [packageMetadata.name]: enUS },
    fetch: answerApi(api),
  });
  expect(
    await screen.findByText(/ds-studio login --server/),
  ).toBeInTheDocument();
  expect(api).not.toHaveBeenCalled();

  await user.click(screen.getByRole('button', { name: enUS.agentCli.create }));
  await waitFor(() => expect(api).toHaveBeenCalledTimes(1));
  const install = await screen.findByText(/--token dl_abc123/);
  expect(install.textContent).toContain('/api/agents/dist/installScript');
  expect(
    screen.getByRole('link', { name: enUS.agentCli.myAccount }),
  ).toHaveAttribute('href', expect.stringContaining('/settings/my-account'));
});
