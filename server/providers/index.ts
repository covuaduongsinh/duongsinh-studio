import SubmissionProvider from './submission.js';
import ProjectsAccessProvider from './projects-access.js';
import AgentsAccessProvider from './agents-access.js';
import AgentActionsProvider from './agent-actions.js';
import ProjectManagerProvider from './project-manager.js';
import AgentExecutorProvider from './agent-executor.js';
import IssueSubjectProvider from './issue-subject.js';
import GitProvider from './git.js';
import MemoryProvider from './memory.js';
import KnowledgeProvider from './knowledge.js';
import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  SubmissionProvider,
  ProjectsAccessProvider,
  AgentsAccessProvider,
  // The business actions come first: the defaults and the project manager below are given some of them.
  AgentActionsProvider,
  // The project manager exists before the `agent` kind names it as every new issue's default executor.
  ProjectManagerProvider,
  AgentExecutorProvider,
  IssueSubjectProvider,
  GitProvider,
  // Reads repositories through the git service above.
  MemoryProvider,
  // The knowledge spaces and their access, and the knowledge each run may read.
  KnowledgeProvider,
];

export default serviceProviders;
