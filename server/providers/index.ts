import NotificationManagementProvider from './notification-management.js';
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
import ConversationsProvider from './conversations.js';
import ReleasesProvider from './releases.js';
import PreviewsProvider from './previews.js';
import ReviewsProvider from './reviews.js';
import AutopilotProvider from './autopilot.js';
import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  SubmissionProvider,
  NotificationManagementProvider,
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
  // Where conversations with agents start, what they read and the plans they propose; sessions on people's computers.
  ConversationsProvider,
  // Versions from tags, where each issue is, and the owner's production marks; the releases plugin's access.
  ReleasesProvider,
  // Previews and staging of NocoBase 2 on the VPS, through the allowlisted Dokploy client (S5.6).
  PreviewsProvider,
  // Structured review submissions by reviewing agents (AP1).
  ReviewsProvider,
  // Studio autopilot: automatic evaluation, merge, and sweep (AP2).
  AutopilotProvider,
];

export default serviceProviders;
