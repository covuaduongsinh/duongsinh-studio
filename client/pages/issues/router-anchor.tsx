import { Link } from 'react-router';

import type { IssueCardLink } from '#components/issue-card';

/**
 * The UI Library's links (issue cards, the issue page's parent, project and dependencies), drawn by the router so the
 * deployment base path is added and navigation stays inside the application.
 */
export const RouterAnchor: IssueCardLink = ({ href, ...props }) => (
  <Link to={href} {...props} />
);
