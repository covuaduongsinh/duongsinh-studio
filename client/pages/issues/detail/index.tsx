/**
 * `/issues/:issueId`: one issue, by its id or identifier, laid over the issue list. It is composed from the UI Library's
 * `issue-detail` block and `comment-thread` over the projects plugin's headless parts (`useIssueDetail`,
 * `useIssueUpdate`, `useIssuePageActions` and the activity hooks), and hosts the plugin's "New sub-issue" dialog
 * (`issueDetailChildRoutes`) at its outlet.
 */
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
  ClipboardCheckIcon,
  Link2Icon,
  ListTreeIcon,
  PaperclipIcon,
} from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { Link, Outlet, useNavigate, useParams } from 'react-router';

import { BackButton } from '#components/back-button';
import { MarkdownView } from '#components/markdown-view';
import { RouteChildPage } from '#components/route-child-page';
import { Alert, AlertDescription } from '#components/ui/alert';
import {
  IssueAddBar,
  IssueAddButton,
  IssueAttachments,
  IssueDeleteButton,
  IssueDependencies,
  IssueDescription,
  IssueDetailLayout,
  IssueFileDrop,
  IssueFilesButton,
  IssueHeader,
  IssueSection,
  IssueSubtasks,
  ISSUE_SURFACE,
  type DependencyItem,
} from '#extensions/nocobase-issue-detail/issue-detail';
import { cn } from 'cn';

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
import { IssueAside } from './issue-aside.js';
import { IssuePullRequests } from './issue-pull-requests.js';

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

function IssueDetailView({
  detail,
  detailKey,
}: {
  readonly detail: IssueDetail;
  readonly detailKey: QueryKey;
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

  return (
    <IssueDetailLayout
      asideLabel={t('issueDetail.properties')}
      main={
        <>
          <IssueFileDrop
            {...(canUpload ? { onFiles: upload } : {})}
            className={cn(ISSUE_SURFACE, 'flex flex-col gap-6')}
          >
            <IssueHeader
              identifier={detail.identifier}
              title={detail.title}
              status={status(detail.statusKey, detail.statuses)}
              trail={<BackButton />}
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
                canDeleteIssues(viewer) ? (
                  <IssueDeleteButton
                    identifier={detail.identifier}
                    onDelete={remove}
                    labels={labels}
                  />
                ) : null
              }
              {...(canEdit ? { onRename: (title) => save({ title }) } : {})}
              link={RouterAnchor}
              labels={labels}
            />
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
            <IssuePullRequests
              issueId={detail.id}
              canMerge={canCloseIssue(viewer, detail)}
              onMerged={refetchAfterMerge}
            />
            {detail.acceptance ? (
              <IssueSection
                icon={<ClipboardCheckIcon />}
                title={t('issueDetail.acceptance')}
              >
                <MarkdownView content={detail.acceptance} />
              </IssueSection>
            ) : null}
          </IssueFileDrop>
          <IssueActivity detail={detail} detailKey={detailKey} />
        </>
      }
      aside={<IssueAside detail={detail} update={update} actions={actions} />}
    />
  );
}
