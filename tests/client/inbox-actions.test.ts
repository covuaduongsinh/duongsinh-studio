import { expect, it } from 'vitest';
import { inboxActionsFor } from '../../client/extensions/nocobase-inbox/inbox-actions.js';
import type { InboxEntry } from '../../client/extensions/nocobase-inbox/model.js';

const entry = (
  readAt: string | null,
  notice: Partial<NonNullable<InboxEntry['notice']>> | null,
): InboxEntry =>
  ({
    item: { id: 'x', readAt },
    notice: notice && {
      notificationId: 'x',
      source: 'projects',
      kind: 'info',
      ...notice,
    },
  }) as unknown as InboxEntry;

it('offers read, unread and delete on a message the plugin stores', () => {
  expect(inboxActionsFor(entry(null, { kind: 'info' }))).toEqual([
    'read',
    'delete',
  ]);
  expect(inboxActionsFor(entry('2026-11-07', null))).toEqual([
    'unread',
    'delete',
  ]);
});

it('offers nothing on a decision Studio reads off its issues, which the plugin does not know', () => {
  expect(
    inboxActionsFor(
      entry('2026-11-07', { source: 'studio', kind: 'decision' }),
    ),
  ).toEqual([]);
});
