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
  // Dương Sinh Studio: an entry with no in-app message behind it has nothing the plugin could mark or delete.
  if (entry.inApp === false) return [];
  return [entry.item.readAt ? 'unread' : 'read', 'delete'];
}
