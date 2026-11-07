import {
  MailIcon,
  MailOpenIcon,
  Trash2Icon,
  type LucideIcon,
} from 'lucide-react';

import type { InboxEntry } from './model.js';

/** What a card offers: read ↔ unread, and delete (the in-app inbox has no archive). */
export type InboxAction = 'read' | 'unread' | 'delete';

export const INBOX_ACTION_ICON: Readonly<Record<InboxAction, LucideIcon>> = {
  read: MailOpenIcon,
  unread: MailIcon,
  delete: Trash2Icon,
};

export function inboxActionsFor(entry: InboxEntry): readonly InboxAction[] {
  // Changed from the template: a decision Studio reads off its issues (`server/routes/inbox.ts`, `entryOf`) has a made-up
  // id and no in-app item behind it, so the plugin answers 404 IN_APP_NOTIFICATION_NOT_FOUND to read, unread and delete. It
  // leaves the list when the issue no longer waits on the person, which is the only way it should.
  if (entry.notice?.source === 'studio' && entry.notice.kind === 'decision')
    return [];
  return [entry.item.readAt ? 'unread' : 'read', 'delete'];
}
