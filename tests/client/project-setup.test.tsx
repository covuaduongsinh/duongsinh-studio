// Setting a project up and the skills of new projects, with the server answered by the fixture below.
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
import ProjectSetupPage from '../../client/pages/projects/setup.js';
import ProjectDefaultSkillsPage from '../../client/pages/settings/project-default-skills.js';

const navigated = vi.hoisted(() => ({ to: [] as string[] }));
vi.mock('react-router', async (original) => ({
  ...(await original<typeof import('react-router')>()),
  useNavigate: () => (to: string) => {
    navigated.to.push(to);
  },
}));

let calls: ApiCall[] = [];
let answer: (call: ApiCall) => unknown;

function render(node: Parameters<typeof renderWithApp>[0]) {
  return renderWithApp(node, {
    namespace: packageMetadata.name,
    namespaces: { [packageMetadata.name]: enUS },
    fetch: answerApi((call: ApiCall) => {
      calls.push(call);
      return answer(call);
    }),
  });
}

const status = {
  data: {
    enabled: true,
    canManage: true,
    connections: [{ id: 'c1', name: 'GitHub', account: 'me' }],
  },
};

const sentTo = (path: string) =>
  calls.filter(
    (call) => call.method === 'POST' && String(call.path).endsWith(path),
  );

describe('project setup', () => {
  beforeEach(() => {
    calls = [];
    navigated.to.length = 0;
  });

  it('makes a project without code and opens it', async () => {
    answer = (call) =>
      call.method === 'POST' ? { data: { projectId: 'p1' } } : status;
    render(<ProjectSetupPage />);
    const create = await screen.findByRole('button', {
      name: 'Create project',
    });
    expect(create).toHaveProperty('disabled', true);
    await userEvent.type(screen.getByLabelText('Name'), 'Dự án mới');
    await userEvent.click(create);
    await waitFor(() => expect(navigated.to).toEqual(['/projects/p1']));
    expect(JSON.stringify(sentTo('projectSetups')[0])).toContain(
      '"codeLocation":"none"',
    );
  });

  it('asks for a prompt before sending one', async () => {
    answer = (call) =>
      call.method === 'POST' ? { data: { projectId: 'p1' } } : status;
    render(<ProjectSetupPage />);
    await userEvent.type(await screen.findByLabelText('Name'), 'Có repo');
    await userEvent.click(
      screen.getByRole('button', { name: 'An existing repository' }),
    );
    await userEvent.type(screen.getByLabelText('owner/name'), 'acme/app');
    await userEvent.click(
      screen.getByRole('button', { name: 'From my description' }),
    );
    const create = screen.getByRole('button', { name: 'Create project' });
    expect(create).toHaveProperty('disabled', true);
    await userEvent.type(screen.getByLabelText('What to set up'), 'Dựng khung');
    await userEvent.click(create);
    await waitFor(() => expect(sentTo('projectSetups')).toHaveLength(1));
    const sent = JSON.stringify(sentTo('projectSetups')[0]);
    expect(sent).toContain('"fullName":"acme/app"');
    expect(sent).toContain('"prompt":"Dựng khung"');
  });

  it('asks for a personal token when the host needs one, then tries again', async () => {
    let tries = 0;
    answer = (call) => {
      if (call.method !== 'POST') return status;
      if (String(call.path).endsWith('useToken'))
        return { data: { login: 'me' } };
      tries += 1;
      if (tries === 1)
        return new Response(
          JSON.stringify({
            error: {
              code: 400,
              status: 'FAILED_PRECONDITION',
              reason: 'GIT_PERSONAL_TOKEN_REQUIRED',
              domain: 'studio',
              message: 'Connect your token.',
            },
          }),
          {
            status: 400,
            headers: { 'content-type': 'application/json' },
          },
        );
      return { data: { projectId: 'p2' } };
    };
    render(<ProjectSetupPage />);
    await userEvent.type(await screen.findByLabelText('Name'), 'Repo mới');
    await userEvent.click(
      screen.getByRole('button', { name: 'A new repository' }),
    );
    await userEvent.type(screen.getByLabelText('Repository name'), 'moi');
    await userEvent.click(
      screen.getByRole('button', { name: 'Create project' }),
    );
    const token = await screen.findByLabelText('Your GitHub token');
    await userEvent.type(token, 'ghp_personal');
    await userEvent.click(
      screen.getByRole('button', { name: 'Create project' }),
    );
    await waitFor(() => expect(navigated.to).toEqual(['/projects/p2']));
    expect(JSON.stringify(sentTo('useToken')[0])).toContain('ghp_personal');
    // The token goes to its own endpoint, never with the project.
    expect(JSON.stringify(sentTo('projectSetups'))).not.toContain(
      'ghp_personal',
    );
  });
});

describe('skills of new projects', () => {
  beforeEach(() => {
    calls = [];
  });

  it('shows the library with the defaults ticked and saves changes', async () => {
    answer = (call) => {
      if (call.method === 'PUT') return { data: { skillIds: [] } };
      return String(call.path).includes('agents/skills')
        ? {
            data: [
              { id: 's1', slug: 'ds-workflow', description: 'Quy trình' },
              { id: 's2', slug: 'ds-review', description: 'Review' },
            ],
          }
        : { data: { skillIds: ['s1'] } };
    };
    render(<ProjectDefaultSkillsPage />);
    const workflow = await screen.findByRole('checkbox', {
      name: /ds-workflow/,
    });
    expect(workflow.getAttribute('aria-checked')).toBe('true');
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toHaveProperty('disabled', true);
    await userEvent.click(screen.getByRole('checkbox', { name: /ds-review/ }));
    await userEvent.click(save);
    await waitFor(() =>
      expect(calls.some((call) => call.method === 'PUT')).toBe(true),
    );
    const sent = JSON.stringify(calls.find((call) => call.method === 'PUT'));
    expect(sent).toContain('s1');
    expect(sent).toContain('s2');
  });
});
