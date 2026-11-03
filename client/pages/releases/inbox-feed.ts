/**
 * The inbox feed of production marks waiting on the owner (`inbox-requests.tsx` renders them).
 */
import { defineInboxFeed } from '#extensions/nocobase-inbox/registry';
import { releaseKeys, type DeploymentRequest } from '#hooks/use-releases';

import { RequestDetail, RequestList } from './inbox-requests.js';

/** The production marks waiting on the viewer, before the inbox's own decisions. */
export const releaseRequestsFeed = defineInboxFeed<DeploymentRequest>({
  id: 'ds-release-requests',
  param: 'releaseRequest',
  query: (api) => ({
    queryKey: releaseKeys.requests(true),
    queryFn: async () =>
      (await api.request<{ data: DeploymentRequest[] }>({ path: 'deploys/requests', query: { awaitingMe: 'true' } })).data,
    select: (data) => (Array.isArray(data) ? (data as DeploymentRequest[]) : []),
    staleTime: 30_000,
  }),
  List: RequestList,
  Detail: RequestDetail,
});
