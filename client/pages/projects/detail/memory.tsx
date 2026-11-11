/** A project's Memory tab: what agents wrote down in its repositories. */
import type { ReactElement } from 'react';

import { ProjectMemoryView } from '../../project-memory/index.js';
import { useProjectOutlet } from './shared.js';

export function ProjectMemoryTab(): ReactElement {
  const { project } = useProjectOutlet();
  return <ProjectMemoryView fixedProjectId={project.id} />;
}
