/**
 * What the issue pages share: the projects plugin's issues and files mapped to the UI Library's rows, cards and
 * attachments, and the translated words the UI Library components take as props.
 */
import { useStatusName } from '@nocobase/app-plugin-projects/client/issues';
import type { Attachment } from '@nocobase/app-plugin-projects/shared/attachments';
import type {
  IssueListItem,
  StatusDefinition,
} from '@nocobase/app-plugin-projects/shared/issues';
import { FIXED_STATUSES } from '@nocobase/app-plugin-projects/shared/statuses';
import { useTranslation } from '@nocobase/i18n/client';

import type {
  AttachmentFile,
  AttachmentLabels,
} from '#components/attachment-list';
import type {
  CommentComposerLabels,
  CommentThreadLabels,
} from '#components/comment-thread';
import type { IssueCardIssue } from '#components/issue-card';
import type {
  IssueTableColor,
  IssueTableLabels,
  IssueTableRow,
} from '#components/issue-table';
import type { KanbanLabels } from '#components/kanban';
import type { PropertyFieldLabels } from '#components/property-fields';
import type { RichTextLabels } from '#components/rich-text-editor';
import type { IssueDetailLabels } from '#extensions/nocobase-issue-detail/labels';

/** An issue's own page, by its identifier (`PM-12`), which the API answers as well as its id. */
export function issueHref(issue: { readonly identifier: string }): string {
  return `/issues/${encodeURIComponent(issue.identifier)}`;
}

/** An issue's or a comment's file as the UI Library's attachment list shows it. */
export function toAttachmentFile(file: Attachment): AttachmentFile {
  return {
    id: file.id,
    name: file.filename,
    size: file.size,
    url: file.contentUrl,
    downloadUrl: file.downloadUrl,
    image: file.previewable,
    canRemove: file.canDelete,
  };
}

/** A status by its key, in the interface language and its colour. */
export function useStatusPresenter(): (
  key: string,
  statuses?: readonly StatusDefinition[],
) => { readonly name: string; readonly color: IssueTableColor } {
  const statusName = useStatusName();
  return (key, statuses = FIXED_STATUSES) => ({
    name: statusName(statuses, key),
    color: statuses.find((status) => status.key === key)?.color ?? 'gray',
  });
}

function finished(statusKey: string): boolean {
  const category = FIXED_STATUSES.find(
    (status) => status.key === statusKey,
  )?.category;
  return category === 'done' || category === 'closed';
}

/** A list item as the issue table and the board's cards show it. */
export function useIssueRow(): (
  item: IssueListItem,
) => IssueTableRow & IssueCardIssue {
  const status = useStatusPresenter();
  return (item) => ({
    id: item.id,
    identifier: item.identifier,
    title: item.title,
    labels: item.labels,
    status: status(item.statusKey),
    priority: item.priority,
    owner: item.owner ? { name: item.owner.name, kind: 'user' } : null,
    executor: item.executor
      ? {
          name: item.executorName ?? item.executor.id,
          kind: item.executor.type,
        }
      : null,
    updatedAt: item.updatedAt,
    // A finished issue is not overdue, so the card shows no due date for it.
    dueDate: finished(item.statusKey) ? null : item.dueDate,
  });
}

export function useIssueTableLabels(): IssueTableLabels {
  const { t } = useTranslation();
  return {
    identifier: t('issues.table.identifier'),
    title: t('issues.table.title'),
    status: t('issues.table.status'),
    priority: t('issues.table.priority'),
    owner: t('issues.table.owner'),
    executor: t('issues.table.executor'),
    updated: t('issues.table.updated'),
    selectAll: t('issues.table.selectAll'),
    selectRow: t('issues.table.selectRow'),
    unassigned: t('issues.table.unassigned'),
    empty: t('issues.table.empty'),
    priorities: {
      urgent: t('issues.priority.urgent'),
      high: t('issues.priority.high'),
      medium: t('issues.priority.medium'),
      low: t('issues.priority.low'),
      none: t('issues.priority.none'),
    },
  };
}

export function useKanbanLabels(): KanbanLabels {
  const { t } = useTranslation();
  return {
    pickedUp: t('issues.board.pickedUp'),
    movedOver: t('issues.board.movedOver'),
    dropped: t('issues.board.dropped'),
    cancelled: t('issues.board.cancelled'),
  };
}

export function usePropertyFieldLabels(): PropertyFieldLabels {
  const { t } = useTranslation();
  return {
    saving: t('issueDetail.block.saving'),
    createNamed: t('issueDetail.block.createNamed'),
    noOptions: t('issueDetail.block.noOptions'),
    copy: t('issueDetail.block.copy'),
    copied: t('issueDetail.block.copied'),
    edit: t('issueDetail.block.editValue'),
    open: t('issueDetail.block.openValue'),
  };
}

export function useIssueDetailLabels(): IssueDetailLabels {
  const { t } = useTranslation();
  return {
    editTitle: t('issueDetail.block.editTitle'),
    titleLabel: t('issueDetail.block.titleLabel'),
    parent: t('issueDetail.block.parent'),
    description: t('issueDetail.block.description'),
    descriptionPlaceholder: t('issueDetail.block.descriptionPlaceholder'),
    editDescription: t('issueDetail.block.editDescription'),
    noDescription: t('issueDetail.block.noDescription'),
    save: t('issueDetail.block.save'),
    cancel: t('issueDetail.block.cancel'),
    delete: t('issueDetail.block.delete'),
    deleteTitle: t('issueDetail.block.deleteTitle'),
    deleteDescription: t('issueDetail.block.deleteDescription'),
    properties: t('issueDetail.properties'),
    saving: t('issueDetail.block.saving'),
    createNamed: t('issueDetail.block.createNamed'),
    noOptions: t('issueDetail.block.noOptions'),
    subtasks: {
      title: t('issueDetail.block.subtasks'),
      none: t('issueDetail.block.noSubtasks'),
      stage: t('issueDetail.block.noStage'),
      noStage: t('issueDetail.block.noStage'),
    },
    dependencies: {
      title: t('issueDetail.block.dependencies'),
      blockedBy: t('issueDetail.block.blockedBy'),
      blocks: t('issueDetail.block.blocks'),
      related: t('issueDetail.block.related'),
      remove: t('issueDetail.block.removeDependency'),
      add: t('issueDetail.block.addBlocker'),
      addPlaceholder: t('issueDetail.block.searchIssues'),
      addLabel: t('issueDetail.block.addLabel'),
      addDependency: t('issueDetail.dependency'),
      searchEmpty: t('issueDetail.block.searchEmpty'),
    },
    labelColors: {
      open: t('issueDetail.block.labelColorsOpen'),
      title: t('issueDetail.block.labelColorsTitle'),
      for: t('issueDetail.block.labelColorFor'),
    },
    followers: {
      title: t('issueDetail.block.followers'),
      none: t('issueDetail.block.noFollowers'),
      follow: t('issueDetail.block.follow'),
      unfollow: t('issueDetail.block.unfollow'),
      label: t('issueDetail.block.followerCount'),
    },
    dates: {
      title: t('issueDetail.block.details'),
      created: t('issueDetail.block.created'),
      updated: t('issueDetail.block.updated'),
    },
    start: {
      title: t('issueDetail.block.startTitle'),
      later: t('issueDetail.block.startLater'),
      start: t('issueDetail.block.start'),
    },
  };
}

export function useCommentThreadLabels(): CommentThreadLabels {
  const { t } = useTranslation();
  return {
    title: t('issueDetail.activity.title'),
    empty: t('issueDetail.activity.empty'),
    loadOlder: t('issueDetail.activity.loadOlder'),
    reply: t('issueDetail.activity.reply'),
    replyTo: t('issueDetail.activity.replyTo'),
    edit: t('issueDetail.activity.edit'),
    editLabel: t('issueDetail.activity.editLabel'),
    delete: t('issueDetail.activity.delete'),
    deleteTitle: t('issueDetail.activity.deleteTitle'),
    deleteDescription: t('issueDetail.activity.deleteDescription'),
    deleted: t('issueDetail.activity.deleted'),
    edited: t('issueDetail.activity.edited'),
    more: t('issueDetail.activity.more'),
    cancel: t('issueDetail.activity.cancel'),
    save: t('issueDetail.activity.save'),
    resolve: t('issueDetail.activity.resolve'),
    resolved: t('issueDetail.activity.resolved'),
    resolvedBy: t('issueDetail.activity.resolvedBy'),
    reopen: t('issueDetail.activity.reopen'),
    expand: t('issueDetail.activity.expand'),
    collapse: t('issueDetail.activity.collapse'),
    replies: t('issueDetail.activity.replies'),
    reactions: t('issueDetail.activity.reactions'),
    addReaction: t('issueDetail.activity.addReaction'),
    toggleReaction: t('issueDetail.activity.toggleReaction'),
    nameSeparator: t('issueDetail.activity.nameSeparator'),
  };
}

export function useCommentComposerLabels(): CommentComposerLabels {
  const { t } = useTranslation();
  return {
    label: t('issueDetail.composer.label'),
    placeholder: t('issueDetail.composer.placeholder'),
    send: t('issueDetail.composer.send'),
    sendReply: t('issueDetail.composer.sendReply'),
    replyingTo: t('issueDetail.composer.replyingTo'),
    cancelReply: t('issueDetail.composer.cancelReply'),
    attach: t('issueDetail.composer.attach'),
    hint: t('issueDetail.composer.hint'),
  };
}

export function useAttachmentLabels(): AttachmentLabels {
  const { t } = useTranslation();
  return {
    title: t('issueDetail.files.title'),
    images: t('issueDetail.files.images'),
    files: t('issueDetail.files.files'),
    pending: t('issueDetail.files.pending'),
    upload: t('issueDetail.files.upload'),
    preview: t('issueDetail.files.preview'),
    download: t('issueDetail.files.download'),
    remove: t('issueDetail.files.remove'),
    uploading: t('issueDetail.files.uploading'),
    removeTitle: t('issueDetail.files.removeTitle'),
    removeDescription: t('issueDetail.files.removeDescription'),
    removeConfirm: t('issueDetail.files.removeConfirm'),
    cancel: t('issueDetail.files.cancel'),
    previous: t('issueDetail.files.previous'),
    next: t('issueDetail.files.next'),
  };
}

export function useRichTextLabels(): RichTextLabels {
  const { t } = useTranslation();
  return {
    mentionList: t('issueDetail.richText.mentionList'),
    noMatches: t('issueDetail.richText.noMatches'),
    toolbar: t('issueDetail.richText.toolbar'),
    uploading: t('issueDetail.richText.uploading'),
    tools: {
      bold: t('issueDetail.richText.bold'),
      italic: t('issueDetail.richText.italic'),
      strike: t('issueDetail.richText.strike'),
      code: t('issueDetail.richText.code'),
      bulletList: t('issueDetail.richText.bulletList'),
      orderedList: t('issueDetail.richText.orderedList'),
      quote: t('issueDetail.richText.quote'),
    },
  };
}
