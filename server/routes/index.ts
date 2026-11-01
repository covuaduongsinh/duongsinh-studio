import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';
import { accessRoutes } from './access.js';

const routes: readonly AppRouteContribution<Application>[] = [accessRoutes];

export default routes;
