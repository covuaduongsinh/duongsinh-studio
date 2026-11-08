// A project's agent variables and skills: who sees them, and which scope they are written to.
import { answerApi, renderWithApp } from '@nocobase/app-testing/client';
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import packageMetadata from '../../package.json' with { type: 'json' };
import enUS from '../../client/locales/en-US.js';
import { ProjectAgentSettings } from '../../client/pages/projects/project-agent-settings.js';

interface SectionProps {
  scope: string;
  scopeId: string;
  canEdit: boolean;
  description?: string;
}

// The plugin's sections talk to its own API; what matters here is what this page hands them.
vi.mock('@nocobase/app-plugin-agents/client/kit', () => ({
  VariablesSection: (props: SectionProps) => (
    <div
      data-testid='variables'
      data-scope={props.scope}
      data-scope-id={props.scopeId}
      data-can-edit={String(props.canEdit)}
    >
      {props.description}
    </div>
  ),
  DefaultSkillsSection: (props: SectionProps) => (
    <div
      data-testid='skills'
      data-scope={props.scope}
      data-scope-id={props.scopeId}
      data-can-edit={String(props.canEdit)}
    >
      {props.description}
    </div>
  ),
}));

function render(canManage: boolean) {
  return renderWithApp(
    <>
      <ProjectAgentSettings projectId='p1' canManage={canManage} />
      <p>page ready</p>
    </>,
    {
      namespace: packageMetadata.name,
      namespaces: { [packageMetadata.name]: enUS },
      fetch: answerApi(() => ({ data: [] })),
    },
  );
}

describe('a project’s agent variables and skills', () => {
  it('gives a project manager both sections on the project scope, editable', async () => {
    render(true);
    for (const id of ['variables', 'skills']) {
      const section = await screen.findByTestId(id);
      expect(section).toHaveAttribute('data-scope', 'project');
      expect(section).toHaveAttribute('data-scope-id', 'p1');
      expect(section).toHaveAttribute('data-can-edit', 'true');
    }
    expect(screen.getByText('Agents in this project')).toBeInTheDocument();
    expect(screen.getByTestId('variables')).toHaveTextContent(
      /every reveal is recorded/u,
    );
  });

  it('shows nothing to someone who cannot manage the project, so names of secrets stay hidden', async () => {
    render(false);
    await screen.findByText('page ready');
    expect(screen.queryByTestId('variables')).not.toBeInTheDocument();
    expect(screen.queryByTestId('skills')).not.toBeInTheDocument();
  });
});
