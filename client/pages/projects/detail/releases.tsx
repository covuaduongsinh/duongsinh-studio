/** A project's Releases tab: the release hub narrowed to this project. */
import type { ReactElement } from 'react';

import { ReleasesHub } from '../../releases/index.js';
import { useProjectOutlet } from './shared.js';

export function ProjectReleasesTab(): ReactElement {
  const { project } = useProjectOutlet();
  return <ReleasesHub fixedProjectId={project.id} />;
}
