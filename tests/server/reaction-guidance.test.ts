// @vitest-environment node
import { expect, it } from 'vitest';
import { BUILTIN_SKILLS } from '../../server/agents/builtin-skills.js';
import { PROJECT_MANAGER_PRINCIPLES } from '../../server/agents/project-manager-principles.js';

// T1.4 (plan T): the project manager steps in only after Studio's own reactions gave up.
it('tells the project manager and the agents that Studio reacts first', () => {
  const workflow = BUILTIN_SKILLS.find((s) => s.slug === 'ds-workflow')!;
  expect(workflow.revision).toBe(5);
  expect(workflow.content).toContain('Studio tự phản ứng');
  expect(workflow.history?.length).toBeGreaterThan(0);
  expect(
    workflow.history?.some((old) => !old.includes('Studio tự phản ứng')),
  ).toBe(true);
  expect(PROJECT_MANAGER_PRINCIPLES).toContain('Tự phản ứng');
  expect(PROJECT_MANAGER_PRINCIPLES).toContain(
    'Đừng giao lại việc Studio vừa đánh thức',
  );
});
