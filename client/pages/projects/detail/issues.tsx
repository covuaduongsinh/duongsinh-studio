/** A project's Issues tab: the grouped table of this project's issues, the same list the Issues page draws. */
import { useMemo, type ReactElement } from 'react';

import { IssueGroupedList } from '../../issues/issue-grouped-list.js';
import { useProjectOutlet } from './shared.js';

export function ProjectIssuesTab(): ReactElement {
  const { project } = useProjectOutlet();
  const filters = useMemo(() => ({ projectId: project.id }), [project.id]);
  return (
    <IssueGroupedList
      filters={filters}
      filtered={false}
      onClear={() => undefined}
    />
  );
}
