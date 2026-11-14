import NotificationManagementProvider from './notification-management.js';
import SubmissionProvider from './submission.js';
import ProjectsAccessProvider from './projects-access.js';
import AgentsAccessProvider from './agents-access.js';
import AgentActionsProvider from './agent-actions.js';
import ProjectManagerProvider from './project-manager.js';
import AgentExecutorProvider from './agent-executor.js';
import IssueSubjectProvider from './issue-subject.js';
import BuildStorageProvider from './build-storage.js';
import OutboundProvider from './outbound.js';
import OrganizationKeysProvider from './organization-keys.js';
import ProjectDefaultsProvider from './project-defaults.js';
import GitProvider from './git.js';
import MemoryProvider from './memory.js';
import KnowledgeProvider from './knowledge.js';
import ConversationsProvider from './conversations.js';
import ReleasesProvider from './releases.js';
import PreviewsProvider from './previews.js';
import Nb3AppsProvider from './nb3-apps.js';
import Nb3JobsProvider from './nb3-jobs.js';
import CiKeyRemindersProvider from './ci-key-reminders.js';
import ReviewsProvider from './reviews.js';
import BenchProvider from './bench.js';
import LessonsProvider from './lessons.js';
import SecurityProvider from './security.js';
import AutopilotProvider from './autopilot.js';
import ReactionsProvider from './reactions.js';
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
  // The `dokploy` driver that runs NocoBase 3 Apps as composes in Studio's Dokploy project (M4.2).
  Nb3AppsProvider,
  Nb3JobsProvider,
  CiKeyRemindersProvider,
  // Structured review submissions by reviewing agents (AP1).
  ReviewsProvider,
  // Harness benchmarks and grade evaluation (H4).
  BenchProvider,
  // Lessons learned from mistakes across projects (H2a).
  LessonsProvider,
  // Secret detection and findings (H2b).
  SecurityProvider,
  // Studio autopilot: automatic evaluation, merge, and sweep (AP2).
  AutopilotProvider,
  // Studio's own reactions to a red CI, a conflict, a review asking for changes or a failed run (plan T, T1).
  ReactionsProvider,
  // Projects as a skill scope, the skills new projects start with, and Studio's own skills (U6).
  ProjectDefaultsProvider,
  // The account organization API keys belong to (U6).
  OrganizationKeysProvider,
  // Keeps Apps and their builds while the App Host stays off (U6).
  BuildStorageProvider,
  // Email, web push and budgets (U7).
  OutboundProvider,
];

export default serviceProviders;
