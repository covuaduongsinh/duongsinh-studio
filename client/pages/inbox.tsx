import type { ReactElement } from 'react';

import { InboxPage as InboxBlock } from '#extensions/nocobase-inbox/inbox-page';
import { defaultInboxRegistry, type InboxRegistry } from '#extensions/nocobase-inbox/registry';

import { releaseRequestsFeed } from './releases/inbox-feed.js';

/** The inbox's contributors: production marks the owner decides (S5.4), before the decisions of the in-app items. */
const registry: InboxRegistry = {
  ...defaultInboxRegistry,
  feeds: [releaseRequestsFeed],
};

/**
 * Route `/inbox`: the UI Library's inbox block over the in-app notification plugin, reached from the header's inbox
 * button. Every message reads as a notification; production marks waiting on the owner come from their own feed.
 */
export default function InboxPage(): ReactElement {
  return <InboxBlock registry={registry} />;
}
