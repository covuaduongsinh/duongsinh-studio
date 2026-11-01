import SubmissionProvider from './submission.js';
import ProjectsAccessProvider from './projects-access.js';
import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  SubmissionProvider,
  ProjectsAccessProvider,
];

export default serviceProviders;
