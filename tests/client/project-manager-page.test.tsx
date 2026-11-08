// Settings → Lead agent, with `server/routes/project-manager.ts` answered by the fixture.
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
import ProjectManagerPage from '../../client/pages/settings/project-manager.js';

const can = vi.hoisted(() => ({ value: true }));
vi.mock('@nocobase/app-plugin-authorization/client', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  useCan: () => ({ can: can.value, loading: false }),
}));

const settings = {
  name: 'Project manager',
  description: null,
  firstChoiceAgentId: 'coder',
  fallbackAgentId: null,
  fallbackAfterSeconds: 120,
  delegationQueueTimeoutSeconds: 600,
  commentRunLimit: 20,
  principles: 'Custom principles',
  builtInPrinciples: 'Built-in principles',
  defaults: {
    fallbackAfterSeconds: 120,
    delegationQueueTimeoutSeconds: 600,
    commentRunLimit: 20,
    principles: null,
  },
};
const options = [
  { id: 'coder', name: 'Claude', tool: 'claude', model: 'Opus 5.5' },
  { id: 'backup', name: 'Codex', tool: 'codex', model: 'GPT' },
];

let calls: ApiCall[] = [];

function render() {
  return renderWithApp(<ProjectManagerPage />, {
    namespace: packageMetadata.name,
    namespaces: { [packageMetadata.name]: enUS },
    fetch: answerApi((call: ApiCall) => {
      calls.push(call);
      if (String(call.path).endsWith('agentOptions')) return { data: options };
      if (call.method === 'PATCH')
        return { data: { ...settings, ...(call.json as object) } };
      return { data: settings };
    }),
  });
}

const patches = () => calls.filter((call) => call.method === 'PATCH');

beforeEach(() => {
  calls = [];
  can.value = true;
});

describe('Settings → Lead agent', () => {
  it('shows the saved settings and the agents to choose from', async () => {
    render();
    expect(
      await screen.findByLabelText('Wait for the first choice (seconds)'),
    ).toHaveValue(120);
    expect(screen.getByLabelText('Working principles')).toHaveValue(
      'Custom principles',
    );
    expect(screen.getByLabelText('First choice')).toHaveTextContent(
      'Claude · Opus 5.5',
    );
  });

  it('saves a changed wait and limit as one change', async () => {
    const user = userEvent.setup();
    render();
    const wait = await screen.findByLabelText(
      'Wait for the first choice (seconds)',
    );
    await user.clear(wait);
    await user.type(wait, '300');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(patches()[0]?.json).toMatchObject({
      fallbackAfterSeconds: 300,
      commentRunLimit: 20,
      firstChoiceAgentId: 'coder',
      principles: 'Custom principles',
    });
    expect(await screen.findByText(/Saved\./u)).toBeInTheDocument();
  });

  it('restores the defaults without touching the chosen agents', async () => {
    const user = userEvent.setup();
    render();
    await screen.findByLabelText('Working principles');
    await user.click(screen.getByRole('button', { name: 'Restore defaults' }));
    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(patches()[0]?.json).toEqual({
      fallbackAfterSeconds: 120,
      commentRunLimit: 20,
      principles: null,
    });
  });

  it('does not save an invalid number', async () => {
    const user = userEvent.setup();
    render();
    const limit = await screen.findByLabelText(
      'Runs started by comments per day',
    );
    await user.clear(limit);
    await user.type(limit, '0');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('is read-only without permission to manage agents', async () => {
    can.value = false;
    render();
    expect(await screen.findByLabelText('Working principles')).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: 'Save' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/only view this/u)).toBeInTheDocument();
  });
});
