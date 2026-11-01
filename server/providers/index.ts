import SubmissionProvider from './submission.js';
import ProjectsAccessProvider from './projects-access.js';
import AgentsAccessProvider from './agents-access.js';
import ProjectManagerProvider from './project-manager.js';
import AgentExecutorProvider from './agent-executor.js';
import IssueSubjectProvider from './issue-subject.js';
import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  SubmissionProvider,
  ProjectsAccessProvider,
  AgentsAccessProvider,
  // The project manager exists before the `agent` kind names it as every new issue's default executor.
  ProjectManagerProvider,
  AgentExecutorProvider,
  IssueSubjectProvider,
];

export default serviceProviders;
