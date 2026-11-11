/**
 * `/issues/:issueId`: one issue, by its id or identifier, laid over the issue list. It is composed from the UI Library's
 * `issue-detail` block and `comment-thread` over the projects plugin's headless parts (`useIssueDetail`,
 * `useIssueUpdate`, `useIssuePageActions` and the activity hooks), and hosts the plugin's "New sub-issue" dialog
 * (`issueDetailChildRoutes`) at its outlet.
 */
import { useChatContextSource } from '@nocobase/app-plugin-agents/client/chat';
import { ApiClientError } from '@nocobase/app-client';
import {
  ATTACHMENT_SIZE_MB,
  canCloseIssue,
  canCreateIssues,
  canDeleteIssues,
  canEditIssues,
  canUploadAttachments,
  groupSubtasksByStage,
  useIssueDetail,
  useIssuePageActions,
  useIssueUpdate,
  useMentionSearch,
  type IssueChanges,
} from '@nocobase/app-plugin-projects/client/issues';
import {
  pmKeys,
  PmDetailSkeleton,
  useViewer,
} from '@nocobase/app-plugin-projects/client/kit';
import type {
  IssueDetail,
  StatusDefinition,
} from '@nocobase/app-plugin-projects/shared/issues';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import {
  CircleAlertIcon,
  Link2Icon,
  ListTreeIcon,
  PaperclipIcon,
  StarIcon,
} from 'lucide-react';
import { useMemo, useRef, useState, type ReactElement } from 'react';
import { Link, Outlet, useNavigate, useParams } from 'react-router';

import { BackButton } from '#components/back-button';
import { MarkdownView } from '#components/markdown-view';
import { AskAgentButton } from '#extensions/nocobase-agent-chat/launchers';
import { RouteChildPage } from '#components/route-child-page';
import { Alert, AlertDescription } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#components/ui/tabs';
import {
  IssueAddBar,
  IssueAddButton,
  IssueAttachments,
  IssueDeleteButton,
  IssueDependencies,
  IssueDescription,
  IssueFileDrop,
  IssueFilesButton,
  IssueHeader,
  IssueSubtasks,
  ISSUE_SURFACE,
  type DependencyItem,
} from '#extensions/nocobase-issue-detail/issue-detail';
import { cn } from 'cn';

import { useIssuePullRequests } from '#hooks/use-git';

import {
  issueHref,
  toAttachmentFile,
  useAttachmentLabels,
  useIssueDetailLabels,
  useRichTextLabels,
  useStatusPresenter,
} from '../presentation.js';
import { RouterAnchor } from '../router-anchor.js';
import { IssueActivity } from './issue-activity.js';
import { IssueAside, IssuePropertyChips } from './issue-aside.js';
import { IssueDeliveryReport } from './issue-delivery-report.js';
import { IssueKbOffers } from './issue-kb-offers.js';
import { IssueMergeButton, IssueNeedsYouActions } from './issue-needs-you.js';
import { IssueProgressPanel } from './issue-progress.js';
import { IssuePullRequests } from './issue-pull-requests.js';
import { IssuePreview } from './issue-preview.js';
import { IssueRelease } from './issue-release.js';
import { IssueRuns } from './issue-runs.js';
import { useScrolledPast } from './issue-scroll.js';
import { IssueStickyHeader } from './issue-sticky-header.js';

type IssueTab = 'activity' | 'description' | 'code' | 'runs';

function TabCount({ value }: { readonly value: number }): ReactElement | null {
  if (value <= 0) return null;
  return (
    <span className='text-xs text-muted-foreground tabular-nums'>{value}</span>
  );
}

/** A link between two issues, as the issue detail carries it (`shared/subtasks` is not a public entry). */
type IssueDependency = IssueDetail['blockedBy'][number];

export default function IssueDetailPage(): ReactElement {
  const { t } = useTranslation();
  const { issueId = '' } = useParams();
  const query = useIssueDetail(issueId);

  let content: ReactElement;
  if (query.data) {
    content = (
      <IssueDetailView detail={query.data} detailKey={pmKeys.issue(issueId)} />
    );
  } else if (query.error) {
    const status =
      query.error instanceof ApiClientError ? query.error.status : undefined;
    content = (
      <div className='flex flex-col gap-4 p-4 md:p-6'>
        <BackButton />
        <Alert variant='destructive' role='alert'>
          <CircleAlertIcon />
          <AlertDescription>
            {status === 404 || status === 403
              ? t('issueDetail.notFound')
              : t('issueDetail.loadFailed')}
          </AlertDescription>
        </Alert>
      </div>
    );
  } else {
    content = (
      <div className='p-4 md:p-6'>
        <PmDetailSkeleton />
      </div>
    );
  }

  return (
    <RouteChildPage>
      {content}
      <Outlet />
    </RouteChildPage>
  );
}

export function IssueDetailView({
  detail,
  detailKey,
  embedded = false,
}: {
  readonly detail: IssueDetail;
  readonly detailKey: QueryKey;
  /** Shown inside another page (the split view's right pane): no way back of its own, the list beside it is that. */
  readonly embedded?: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const navigate = useNavigate();
  const viewer = useViewer();
  const update = useIssueUpdate(detail, detailKey);
  const actions = useIssuePageActions(detail);
  const canEdit = canEditIssues(viewer);
  const canUpload = canEdit && canUploadAttachments(viewer);
  const mentionSearch = useMentionSearch(detail.id, canEdit);
  const status = useStatusPresenter();
  const labels = useIssueDetailLabels();
  const fileLabels = useAttachmentLabels();
  const richTextLabels = useRichTextLabels();
  const [addingDependency, setAddingDependency] = useState(false);
  const [uploading, setUploading] = useState<readonly string[]>([]);
  const queryClient = useQueryClient();

  const save = async (changes: IssueChanges): Promise<void> => {
    await update.mutateAsync(changes);
  };
  const upload = (files: readonly File[]): void => {
    setUploading(files.map((file) => file.name));
    // uploadFiles reports each failed file itself and refreshes the issue; only the progress line is left to clear.
    const done = () => setUploading([]);
    actions.uploadFiles(files).then(done, done);
  };
  const remove = async (): Promise<void> => {
    await actions.deleteIssue();
    await navigate('/issues', { replace: true });
  };
  // A merge moves the issue to Done on the server (`ds.pr.merged`): read it, and the lists showing it, again.
  const refetchAfterMerge = (): void => {
    queryClient
      .invalidateQueries({ queryKey: detailKey })
      .catch(() => undefined);
    queryClient
      .invalidateQueries({ queryKey: pmKeys.issues })
      .catch(() => undefined);
  };
  const toDependency = (dependency: IssueDependency): DependencyItem => ({
    id: dependency.dependencyId,
    issueId: dependency.issueId,
    identifier: dependency.identifier,
    title: dependency.title,
    href: issueHref(dependency),
    status: status(dependency.status.key, [dependency.status]),
  });
  const statusOf = (definition: StatusDefinition) =>
    status(definition.key, [definition]);
  // What the agents' chat pins while this page is open; "Ask agent" opens it with the issue and a draft question.
  const chatItem = useMemo(
    () => ({
      kind: 'issue',
      id: detail.id,
      label: `${detail.identifier} ${detail.title}`,
    }),
    [detail.id, detail.identifier, detail.title],
  );
  useChatContextSource(chatItem);

  const following = detail.subscribers.some(
    (subscriber) => subscriber.userId === viewer?.userId,
  );
  const pulls = useIssuePullRequests(detail.id);
  const pullCount = Array.isArray(pulls.data) ? pulls.data.length : 0;
  const [tab, setTab] = useState<IssueTab>('activity');
  const rootRef = useRef<HTMLDivElement>(null);
  const { scrolled, toTop } = useScrolledPast(rootRef);
  const mayMerge = canCloseIssue(viewer, detail);

  return (
    <div
      ref={rootRef}
      data-testid='issue-detail-root'
      className='@container/issue-detail min-h-full'
    >
      <div className='mx-auto flex min-h-full max-w-5xl flex-col gap-4 p-4 md:gap-6 md:p-6'>
        {scrolled ? (
          <IssueStickyHeader
            identifier={detail.identifier}
            title={detail.title}
            status={
              <span className='shrink-0 text-xs text-muted-foreground'>
                {status(detail.statusKey, detail.statuses).name}
              </span>
            }
            actions={
              <IssueMergeButton
                issueId={detail.id}
                canMerge={mayMerge}
                onChanged={refetchAfterMerge}
              />
            }
            onTop={toTop}
          />
        ) : null}
        <IssueFileDrop
          {...(canUpload ? { onFiles: upload } : {})}
          className={cn(ISSUE_SURFACE, 'flex flex-col gap-6')}
        >
          <IssueHeader
            identifier={detail.identifier}
            title={detail.title}
            status={status(detail.statusKey, detail.statuses)}
            {...(embedded ? {} : { trail: <BackButton /> })}
            parent={
              detail.parent
                ? {
                    identifier: detail.parent.identifier,
                    title: detail.parent.title,
                    href: issueHref(detail.parent),
                  }
                : null
            }
            project={
              detail.project
                ? {
                    name: detail.project.name,
                    href: `/projects/${encodeURIComponent(detail.project.id)}`,
                  }
                : null
            }
            actions={
              <>
                {/* Embedded in the split view, its own header already carries Follow. */}
                {viewer && !embedded ? (
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    aria-pressed={following}
                    onClick={() => void actions.setFollowing(!following)}
                  >
                    <StarIcon
                      data-icon='inline-start'
                      className={cn(following && 'fill-current')}
                    />
                    {following
                      ? t('issueDetail.unfollow')
                      : t('issueDetail.follow')}
                  </Button>
                ) : null}
                <AskAgentButton
                  item={chatItem}
                  label={t('studioChat.askIssue')}
                  draft={t('studioChat.askIssueDraft', {
                    issue: detail.identifier,
                  })}
                  newConversation
                />
                {canDeleteIssues(viewer) ? (
                  <IssueDeleteButton
                    identifier={detail.identifier}
                    onDelete={remove}
                    labels={labels}
                  />
                ) : null}
              </>
            }
            {...(canEdit ? { onRename: (title) => save({ title }) } : {})}
            link={RouterAnchor}
            labels={labels}
          />
          <IssueProgressPanel
            issueId={detail.id}
            revision={detail.revision}
            canEdit={canEditIssues(viewer)}
            onChanged={refetchAfterMerge}
            needsYouActions={
              <IssueNeedsYouActions
                issueId={detail.id}
                canMerge={mayMerge}
                onChanged={refetchAfterMerge}
                onShowActivity={() => setTab('activity')}
              />
            }
          />
          <IssueDeliveryReport
            issueId={detail.id}
            acceptance={detail.acceptance}
          />
          <IssuePropertyChips
            detail={detail}
            update={update}
            more={
              <IssueAside
                detail={detail}
                update={update}
                actions={actions}
                compact
              />
            }
          />
          <IssueAddBar label={t('issueDetail.add')}>
            {canCreateIssues(viewer) ? (
              <IssueAddButton
                nativeButton={false}
                render={<Link to='new-subtask' />}
              >
                <ListTreeIcon data-icon='inline-start' />
                {t('issueDetail.subIssue')}
              </IssueAddButton>
            ) : null}
            {canEdit && !addingDependency ? (
              <IssueAddButton onClick={() => setAddingDependency(true)}>
                <Link2Icon data-icon='inline-start' />
                {t('issueDetail.dependency')}
              </IssueAddButton>
            ) : null}
            {canUpload && detail.attachments.length === 0 ? (
              <IssueFilesButton onFiles={upload} busy={uploading.length > 0}>
                <PaperclipIcon data-icon='inline-start' />
                {t('issueDetail.attachments')}
              </IssueFilesButton>
            ) : null}
          </IssueAddBar>
          <IssueSubtasks
            groups={groupSubtasksByStage(detail.subtasks).map((group) => ({
              key: group.stage === null ? 'none' : String(group.stage),
              title:
                group.stage === null
                  ? null
                  : t('issueDetail.stage', { stage: group.stage }),
              done: group.done,
              issues: group.subtasks.map((subtask) => ({
                id: subtask.id,
                identifier: subtask.identifier,
                title: subtask.title,
                href: issueHref(subtask),
                status: statusOf(subtask.status),
                waiting:
                  subtask.blockedCount > 0
                    ? t('issueDetail.waiting', {
                        count: subtask.blockedCount,
                      })
                    : null,
                executor:
                  subtask.executor && subtask.executorName
                    ? {
                        name: subtask.executorName,
                        kind: subtask.executor.type,
                      }
                    : null,
              })),
            }))}
            link={RouterAnchor}
            labels={labels}
          />
          <IssueDependencies
            blockedBy={detail.blockedBy.map(toDependency)}
            blocks={detail.blocks.map(toDependency)}
            related={detail.relatedTo.map(toDependency)}
            hidden={
              detail.hiddenBlockerCount > 0
                ? t('issueDetail.hiddenBlockers', {
                    count: detail.hiddenBlockerCount,
                  })
                : null
            }
            {...(canEdit
              ? {
                  onAdd: (issue) => actions.addBlocker(issue.id),
                  onRemove: (dependency) =>
                    actions.removeDependency(dependency.id),
                }
              : {})}
            onSearch={async (text) =>
              (await actions.searchIssues(text)).map((issue) => ({
                id: issue.id,
                identifier: issue.identifier,
                title: issue.title,
              }))
            }
            adding={addingDependency}
            onAddingChange={setAddingDependency}
            excludeIds={[detail.id]}
            link={RouterAnchor}
            labels={labels}
          />
          <IssueAttachments
            files={detail.attachments.map(toAttachmentFile)}
            {...(canUpload
              ? {
                  onUpload: upload,
                  hint: t('issueDetail.attachHint', {
                    size: ATTACHMENT_SIZE_MB,
                  }),
                }
              : {})}
            uploading={uploading}
            onRemove={(file) => actions.removeFile(file.id)}
            locale={locale}
            labels={fileLabels}
          />
          <IssueKbOffers issueId={detail.id} />
        </IssueFileDrop>
        <Tabs value={tab} onValueChange={(value) => setTab(value as IssueTab)}>
          <TabsList variant='line' className='h-auto flex-wrap'>
            <TabsTrigger value='activity'>
              {t('issueDetail.tabs.activity')}
              <TabCount
                value={detail.threads.length + detail.activities.length}
              />
            </TabsTrigger>
            <TabsTrigger value='description'>
              {t('issueDetail.tabs.description')}
            </TabsTrigger>
            <TabsTrigger value='code'>
              {t('issueDetail.tabs.code')}
              <TabCount value={pullCount} />
            </TabsTrigger>
            <TabsTrigger value='runs'>{t('issueDetail.tabs.runs')}</TabsTrigger>
          </TabsList>
          <TabsContent value='activity'>
            <IssueActivity detail={detail} detailKey={detailKey} />
          </TabsContent>
          <TabsContent value='description'>
            <div className={cn(ISSUE_SURFACE, 'flex flex-col gap-6')}>
              <IssueDescription
                description={detail.description}
                renderMarkdown={(content) => <MarkdownView content={content} />}
                {...(canEdit
                  ? {
                      onSave: (description) => save({ description }),
                      onMentionSearch: mentionSearch,
                    }
                  : {})}
                richTextLabels={richTextLabels}
                labels={labels}
              />
            </div>
          </TabsContent>
          <TabsContent value='code'>
            <div className={cn(ISSUE_SURFACE, 'flex flex-col gap-6')}>
              <IssuePullRequests
                issueId={detail.id}
                canMerge={mayMerge}
                onMerged={refetchAfterMerge}
              />
              <IssuePreview issueId={detail.id} />
              <IssueRelease issueId={detail.id} />
            </div>
          </TabsContent>
          <TabsContent value='runs'>
            <div className={cn(ISSUE_SURFACE, 'flex flex-col gap-6')}>
              <IssueRuns issueId={detail.id} />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
