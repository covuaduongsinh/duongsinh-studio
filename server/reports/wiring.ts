import { agentsToken } from '@nocobase/app-plugin-agents/server/tokens';
import { projectsToken } from '@nocobase/app-plugin-projects/server/tokens';
import type { Application } from '@nocobase/app-server/application';
import { databaseManagerToken } from '@nocobase/db';
import { AGENT_KIND } from '../agents/ids.js';
import { createReportFigures, type ReportFigures } from './service.js';

/** The report figures over the two plugins' services, resolved when they are read. */
export function reportFiguresOf(
  container: Application['container'],
): ReportFigures {
  const agents = container.resolve(agentsToken);
  const conn = () => container.resolve(databaseManagerToken).connection();
  return createReportFigures({
    conn,
    now: () => new Date(),
    agentKind: AGENT_KIND,
    reporting: agents.reporting,
    issues: container.resolve(projectsToken).reports,
    agentNames: (ids) => agents.agents.names(conn(), [...ids]),
  });
}
