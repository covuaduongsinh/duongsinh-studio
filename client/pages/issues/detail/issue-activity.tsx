/**
 * An issue's activity line, drawn with the UI Library's `comment-thread` over the projects plugin's headless timeline:
 * comment threads and changes oldest first, older entries on demand, and the composer pinned under them.
 */
import {
  canComment,
  canDeleteComment,
  canEditComment,
  canUploadAttachments,
  ISSUE_REACTION_EMOJIS,
  useAttachmentUploads,
  useIssueCommentActions,
  useIssueTimeline,
  useMentionSearch,
  type CommentThread,
  type IssueComment,
} from '@nocobase/app-plugin-projects/client/issues';
import { useViewer } from '@nocobase/app-plugin-projects/client/kit';
import type {
  Activity,
  IssueDetail,
} from '@nocobase/app-plugin-projects/shared/issues';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import type { QueryKey } from '@tanstack/react-query';
import {
  ArrowDownIcon,
  BotIcon,
  ChevronRightIcon,
  CogIcon,
  GitPullRequestIcon,
} from 'lucide-react';
import { useRef, useState, type ReactElement } from 'react';
import { cn } from 'cn';

import {
  AttachmentList,
  PendingAttachments,
} from '#components/attachment-list';
import {
  CommentComposer,
  CommentTimeline,
  TimelineActivity,
  type CommentItem,
  type CommentThreadItem,
  type CommentTimelineEntry,
} from '#components/comment-thread';
import { MarkdownView } from '#components/markdown-view';
import { Button } from '#components/ui/button';
import { IssueSurface } from '#extensions/nocobase-issue-detail/issue-detail';
import { useIssuePullRequests, type GitPullRequest } from '#hooks/use-git';
import { useIssueRuns } from '#hooks/use-issue-work';
import { useIsMobile } from '#hooks/use-mobile';

import { durationText } from './duration.js';
import { RunRow } from './issue-runs.js';
import {
  toAttachmentFile,
  useAttachmentLabels,
  useCommentComposerLabels,
  useCommentThreadLabels,
  useStatusPresenter,
} from '../presentation.js';

/** The changes the activity line names in this application's words; any other reads as "updated the issue". */
/** Why an agent did not start on a comment or a move (`work_skipped`, the projects plugin's activity). */
const WORK_SKIP_REASONS = new Set([
  'limited',
  'blocked',
  'dormant',
  'waitingOwner',
]);

const ACTIVITY_ACTIONS = new Set([
  'created',
  'updated',
  'statusChanged',
  'titleChanged',
  'descriptionChanged',
  'priorityChanged',
  'ownerChanged',
  'executorChanged',
  'labelsChanged',
  'projectChanged',
  'parentChanged',
  'datesChanged',
  'deleted',
  'restored',
  'subtaskAdded',
  'dependencyAdded',
  'dependencyRemoved',
  'attachmentAdded',
  'attachmentRemoved',
  'commentDeleted',
  'threadResolved',
  'threadUnresolved',
  'ownerNotified',
]);

/** `status_changed` → `statusChanged`; the issue's own events drop their prefix (`issue_created` → `created`). */
function camel(action: string): string {
  return action
    .replace(/^issue_/u, '')
    .replace(/_([a-z])/gu, (_, letter: string) => letter.toUpperCase());
}

function actorIcon(kind: string): ReactElement | undefined {
  if (kind === 'system') return <CogIcon />;
  if (kind === 'user') return undefined;
  return <BotIcon />;
}

function ActivityLine({
  activity,
}: {
  readonly activity: Activity;
}): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const status = useStatusPresenter();
  const key = camel(activity.action);
  const skipReason = activity.details.reason;
  const verb =
    activity.action === 'work_skipped' &&
    typeof skipReason === 'string' &&
    WORK_SKIP_REASONS.has(skipReason)
      ? t(`issueDetail.activity.workSkipped.${skipReason}`)
      : ACTIVITY_ACTIONS.has(key)
        ? t(`issueDetail.activity.actions.${key}`)
        : t('issueDetail.activity.actions.updated');
  const { from, to } = activity.details;
  const change =
    activity.action === 'status_changed' &&
    typeof from === 'string' &&
    typeof to === 'string'
      ? t('issueDetail.activity.change', {
          from: status(from).name,
          to: status(to).name,
        })
      : null;
  const fallbackName =
    activity.actorType === 'system'
      ? t('issueDetail.activity.system')
      : t('issueDetail.activity.someone');
  return (
    <TimelineActivity
      actorName={activity.actorName ?? fallbackName}
      actorKind={activity.actorType}
      actorIcon={actorIcon(activity.actorType)}
      at={activity.createdAt}
      locale={locale}
    >
      <span>{verb}</span>
      {change ? <span className='text-foreground'>{change}</span> : null}
    </TimelineActivity>
  );
}

/** A pull request of the issue as one line of the stream: open with its checks, merged, or closed. */
function PullLine({ pull }: { readonly pull: GitPullRequest }): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const checks = pull.ciState
    ? t(`issueDetail.timeline.checks.${pull.ciState}`)
    : null;
  // How long CI took: the longest of the checks that reported a duration, so "slow" is visible beside the result.
  const longest = Math.max(
    0,
    ...pull.checks.map((check) => check.durationMs ?? 0),
  );
  const ciTime =
    longest > 0
      ? t('issueDetail.timeline.checksTook', {
          duration: durationText(t, longest),
        })
      : null;
  return (
    <TimelineActivity
      actorName={t('issueDetail.timeline.pullRequest')}
      actorKind='system'
      actorIcon={<GitPullRequestIcon />}
      at={pull.mergedAt ?? pull.updatedAt}
      locale={locale}
    >
      <a
        href={pull.url}
        target='_blank'
        rel='noreferrer'
        className='text-foreground underline-offset-4 hover:underline'
      >
        {t(`issueDetail.timeline.pull.${pull.state}`, { number: pull.number })}
      </a>
      {pull.state === 'open' && checks ? <span>{checks}</span> : null}
      {ciTime ? <span>{ciTime}</span> : null}
    </TimelineActivity>
  );
}

/** Records the system wrote on its own, folded under one line until a person opens it. */
function SystemRecords({
  activities,
}: {
  readonly activities: readonly Activity[];
}): ReactElement {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const label =
    activities.length === 1
      ? t('issueDetail.activity.systemRecord')
      : t('issueDetail.activity.systemRecords', { count: activities.length });
  return (
    <div className='flex flex-col gap-1'>
      <button
        type='button'
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className='inline-flex w-fit cursor-pointer items-center gap-1 text-xs text-muted-foreground hover:text-foreground'
      >
        <ChevronRightIcon
          aria-hidden='true'
          className={cn('size-3.5 transition-transform', open && 'rotate-90')}
        />
        {label}
      </button>
      {open ? (
        <div className='flex flex-col gap-1 pl-5'>
          {activities.map((activity) => (
            <ActivityLine key={activity.id} activity={activity} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function IssueActivity({
  detail,
  detailKey,
}: {
  readonly detail: IssueDetail;
  readonly detailKey: QueryKey;
}): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const viewer = useViewer();
  const timeline = useIssueTimeline(detail);
  const runs = useIssueRuns(detail.id);
  const pulls = useIssuePullRequests(detail.id);
  const mobile = useIsMobile();
  const endRef = useRef<HTMLDivElement>(null);
  const comments = useIssueCommentActions(detail.id, detailKey);
  const mayComment = canComment(viewer);
  const mayAttach = mayComment && canUploadAttachments(viewer);
  const mentionSearch = useMentionSearch(detail.id, mayComment);
  const uploads = useAttachmentUploads();
  const threadLabels = useCommentThreadLabels();
  const composerLabels = useCommentComposerLabels();
  const fileLabels = useAttachmentLabels();
  const [replyTo, setReplyTo] = useState<{
    readonly id: string;
    readonly name: string;
  } | null>(null);

  // The comment each drawn item stands for, so an action on an item reaches the comment it came from.
  const source = new Map<string, IssueComment>();
  const toComment = (comment: IssueComment): CommentItem => {
    source.set(comment.id, comment);
    const fallbackName =
      comment.authorType === 'system'
        ? t('issueDetail.activity.system')
        : t('issueDetail.activity.someone');
    return {
      id: comment.id,
      authorName: comment.authorName ?? fallbackName,
      authorKind: comment.authorType,
      authorIcon: actorIcon(comment.authorType),
      tags: comment.note
        ? [{ key: 'note', label: t('issueDetail.activity.note') }]
        : undefined,
      createdAt: comment.createdAt,
      editedAt: comment.editedAt,
      deleted: comment.deleted,
      content: comment.content,
      footer:
        comment.attachments.length > 0 ? (
          <AttachmentList
            files={comment.attachments.map(toAttachmentFile)}
            labels={fileLabels}
            locale={locale}
          />
        ) : undefined,
      reactions: comment.reactions.map((reaction) => ({
        emoji: reaction.emoji,
        count: reaction.count,
        names: reaction.userIds.map(
          (userId) =>
            detail.subscribers.find((person) => person.userId === userId)
              ?.name ?? (userId === viewer?.userId ? viewer.name : userId),
        ),
        mine: viewer ? reaction.userIds.includes(viewer.userId) : false,
      })),
      canEdit: canEditComment(viewer, comment),
      canDelete: canDeleteComment(viewer, comment, detail),
    };
  };
  const toThread = (thread: CommentThread): CommentThreadItem => ({
    root: toComment(thread.root),
    replies: thread.replies.map(toComment),
    resolved: thread.root.resolvedAt !== null,
    resolvedBy: thread.root.resolvedByName,
  });
  // One stream (V2.2): the comments and changes the projects plugin reads, with the agent runs and the pull requests of
  // the issue placed among them by time. What the system recorded on its own, several in a row, folds into one line that
  // opens (the demo's "N system records").
  const stamped: { at: number; entry: CommentTimelineEntry }[] = [];
  let system: Activity[] = [];
  const flushSystem = (): void => {
    if (system.length === 0) return;
    stamped.push({
      at: Date.parse(system[0]?.createdAt ?? ''),
      entry: {
        kind: 'custom',
        key: `system:${system[0]?.id ?? ''}`,
        node: <SystemRecords activities={system} />,
      },
    });
    system = [];
  };
  for (const entry of timeline.entries) {
    if (entry.kind === 'activity' && entry.activity.actorType === 'system') {
      system.push(entry.activity);
      continue;
    }
    flushSystem();
    if (entry.kind === 'thread')
      stamped.push({
        at: Date.parse(entry.thread.root.createdAt),
        entry: {
          kind: 'thread',
          key: entry.key,
          thread: toThread(entry.thread),
        },
      });
    else if (entry.kind === 'activity')
      stamped.push({
        at: Date.parse(entry.activity.createdAt),
        entry: {
          kind: 'custom',
          key: entry.key,
          node: <ActivityLine activity={entry.activity} />,
        },
      });
  }
  flushSystem();
  // Older comments load on demand; runs and pull requests older than what is loaded wait with them, so the stream
  // never shows a run before the comments around it exist.
  const loadedFrom = stamped.length
    ? Math.min(...stamped.map((item) => item.at))
    : 0;
  const within = (at: number): boolean =>
    !timeline.hasOlder || at >= loadedFrom;
  for (const run of runs.data ?? [])
    if (within(Date.parse(run.createdAt)))
      stamped.push({
        at: Date.parse(run.createdAt),
        entry: {
          kind: 'custom',
          key: `run:${run.id}`,
          node: (
            <ul className='list-none rounded-lg border bg-muted/30 p-3'>
              <RunRow run={run} issueId={detail.id} />
            </ul>
          ),
        },
      });
  for (const pull of Array.isArray(pulls.data) ? pulls.data : []) {
    const at = Date.parse(pull.mergedAt ?? pull.updatedAt);
    if (within(at))
      stamped.push({
        at,
        entry: {
          kind: 'custom',
          key: `pull:${pull.id}`,
          node: <PullLine pull={pull} />,
        },
      });
  }
  // `sort` is stable: entries with the same time keep the order they were added in.
  const entries: CommentTimelineEntry[] = stamped
    .sort((first, second) => first.at - second.at)
    .map((item) => item.entry);

  const [filterMode, setFilterMode] = useState<'all' | 'conversations'>('all');

  const filteredEntries = ((): CommentTimelineEntry[] => {
    if (filterMode === 'all') return entries;
    return entries.filter((entry) => {
      if (entry.kind === 'custom') return false;
      if (entry.kind === 'thread') {
        const root = entry.thread.root;
        if (root.authorKind === 'user') return true;
        if (root.content.includes('@') || root.content.length > 80) return true;
        return false;
      }
      return true;
    });
  })();

  const submit = async (content: string): Promise<string> => {
    const comment = await comments.create({
      content,
      ...(replyTo ? { parentId: replyTo.id } : {}),
      ...(uploads.ids.length > 0 ? { attachmentIds: uploads.ids } : {}),
    });
    uploads.clear();
    setReplyTo(null);
    return comment.id;
  };

  const attach = (files: readonly File[]): void => {
    // The upload hook tells the person what failed; the files it could store wait for the comment.
    uploads.add(files).catch(() => undefined);
  };

  return (
    <IssueSurface
      aria-label={threadLabels.title}
      className='flex flex-col gap-4'
    >
      <div className='flex items-center justify-between border-b border-border/60 pb-2 text-xs'>
        <span className='font-medium text-muted-foreground'>
          {threadLabels.title}
        </span>
        <div className='inline-flex items-center rounded-lg bg-muted p-0.5 text-xs'>
          <button
            type='button'
            onClick={() => setFilterMode('all')}
            className={cn(
              'rounded-md px-2.5 py-1 font-medium transition-colors cursor-pointer',
              filterMode === 'all'
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t('issueDetail.activity.filterAll', 'Tất cả')}
          </button>
          <button
            type='button'
            onClick={() => setFilterMode('conversations')}
            className={cn(
              'rounded-md px-2.5 py-1 font-medium transition-colors cursor-pointer',
              filterMode === 'conversations'
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t(
              'issueDetail.activity.filterConversations',
              'Chỉ trao đổi & báo cáo',
            )}
          </button>
        </div>
      </div>
      {mobile && entries.length > 0 ? (
        <Button
          type='button'
          variant='outline'
          size='sm'
          className='w-fit'
          onClick={() =>
            endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
          }
        >
          <ArrowDownIcon data-icon='inline-start' />
          {t('issueDetail.timeline.latest')}
        </Button>
      ) : null}
      <CommentTimeline
        entries={filteredEntries}
        renderMarkdown={(content) => <MarkdownView content={content} />}
        emojis={ISSUE_REACTION_EMOJIS}
        {...(mayComment
          ? {
              onReply: (comment: CommentItem) =>
                setReplyTo({ id: comment.id, name: comment.authorName }),
              onResolve: (thread: CommentThreadItem, resolved: boolean) =>
                comments.resolve(thread.root.id, resolved),
              onReact: (comment: CommentItem, emoji: string) => {
                const original = source.get(comment.id);
                if (original && viewer)
                  comments.react(original, emoji, viewer.userId);
              },
            }
          : {})}
        onEdit={(comment, content) => comments.update(comment.id, content)}
        onDelete={(comment) => comments.remove(comment.id)}
        onMentionSearch={mentionSearch}
        replyingToId={replyTo?.id ?? null}
        hasOlder={timeline.hasOlder}
        loadingOlder={timeline.loadingOlder}
        onLoadOlder={timeline.loadOlder}
        locale={locale}
        labels={threadLabels}
      />
      <div ref={endRef} />
      {mayComment ? (
        <CommentComposer
          onSubmit={submit}
          replyingTo={replyTo?.name ?? null}
          onCancelReply={() => setReplyTo(null)}
          onMentionSearch={mentionSearch}
          {...(mayAttach
            ? {
                onAttach: attach,
                attachments:
                  uploads.uploads.length > 0 ? (
                    <PendingAttachments
                      files={uploads.uploads.map((upload) => ({
                        key: upload.key,
                        name: upload.name,
                        size: upload.size,
                        done: upload.attachment !== null,
                        thumbnailUrl: upload.attachment?.previewable
                          ? upload.attachment.contentUrl
                          : null,
                      }))}
                      onRemove={uploads.remove}
                      locale={locale}
                      labels={fileLabels}
                    />
                  ) : undefined,
              }
            : {})}
          busy={uploads.uploading}
          labels={composerLabels}
        />
      ) : null}
    </IssueSurface>
  );
}
