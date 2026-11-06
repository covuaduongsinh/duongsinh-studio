/**
 * What Studio adds to the inbox: the decisions waiting on the viewer (`/api/inbox/*`), read from the state of their issues,
 * and how they read. A decision is taken on its issue's page, where its full context is.
 */
import { useTranslation } from '@nocobase/i18n/client';
import { ClipboardCheckIcon } from 'lucide-react';

import type { InboxEntry, InboxNotice } from '#extensions/nocobase-inbox/model';
import { defineInboxRenderer } from '#extensions/nocobase-inbox/registry';
import type { InboxSource } from '#extensions/nocobase-inbox/source';

/**
 * The in-app messages are the plugin's and keep working whatever happens here: if Studio's routes fail, the inbox shows
 * them as plain notifications, without the decisions, rather than nothing.
 */
export const studioInboxSource: InboxSource = {
  id: 'studio',
  notices: (notificationIds, { api, signal }) =>
    api
      .request<{ data: readonly InboxNotice[] }>({
        path: 'inbox/notices',
        query: { ids: notificationIds.join(',') },
        signal,
      })
      .then((response) => response.data)
      .catch(() => []),
  waiting: (subject, { api, signal }) =>
    api
      .request<{ data: readonly InboxEntry[] }>({
        path: 'inbox/waiting',
        ...(subject ? { query: { subject } } : {}),
        signal,
      })
      .then((response) => response.data)
      .catch(() => []),
  pending: ({ api, signal }) =>
    api
      .request<{ data: Readonly<Record<string, number>> }>({
        path: 'inbox/pending',
        signal,
      })
      .then((response) => response.data)
      .catch(() => ({})),
};

export const studioDecisionRenderer = defineInboxRenderer<undefined>({
  source: 'studio',
  icon: () => ClipboardCheckIcon,
  useWording: () => {
    const { t } = useTranslation();
    return {
      label: (entry) => t(`inboxStudio.type.${entry.notice?.type ?? 'answer'}`),
      text: (entry) => ({
        title: entry.item.title ?? '',
        sentence: entry.item.body || null,
      }),
      open: t('inboxStudio.open'),
    };
  },
});
